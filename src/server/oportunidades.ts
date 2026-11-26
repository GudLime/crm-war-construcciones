import { asc, count, desc, eq, inArray, notInArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { herramientasEfectivas } from "@/lib/agent-roles";
import {
  ESTADOS_ABIERTOS,
  MAX_AMBIENTES,
  ambientesDeTipologia,
  normalizarTipoContacto,
  normalizarTipologias,
  ordenarTipologiasUnidad,
  resolverEdificiosPorNombre,
  resolverEstadoOportunidad,
  siguientesParaLaIA,
  tiposValidos,
  type EstadoOportunidad,
  type TipoContacto,
  type TipoOportunidad,
} from "@/lib/ventas";
import {
  cambiarEstadoOportunidad,
  leerAjustesVentas,
  registrarCreada,
  registrarEvento,
  registrarRespuesta,
  ultimaCerrada,
  type Actor,
} from "@/server/oportunidad-historial";
import { seReabre, textoSinRespuesta } from "@/lib/ventas-ajustes";
import { publish } from "@/server/events/bus";
import { ajustarInteres } from "@/server/motor/interes";
import { asignarLeadDeMeta } from "@/server/asignacion";
import { VentasError } from "@/server/ventas";
import { vocabulario } from "@/server/vocabulario";
import { nombreEstado, type Vocabulario } from "@/lib/vocabulario";

/**
 * 068 — Oportunidades de War (ver specs/068-oportunidades-war).
 *
 * Lo que avanza en el embudo es la OPORTUNIDAD, no el contacto. Un contacto
 * tiene a lo sumo una abierta; cuando se cierra (compró, perdido, no
 * calificado) puede abrirse otra. Este módulo es la única puerta que abre,
 * clasifica y mueve oportunidades desde el chat y desde el cerebro.
 */

type Db = ReturnType<typeof getDb>;
type FilaOportunidad = typeof schema.oportunidad.$inferSelect;

const ABIERTOS = ESTADOS_ABIERTOS as EstadoOportunidad[];

export type OportunidadDelChat = {
  id: string;
  nombre: string;
  estado: EstadoOportunidad;
  /** v4 — Lo que busca: Venta, Alquiler o Inmobiliaria. */
  tipo: TipoOportunidad | null;
  motivoCierre: string | null;
  edificios: { id: string; nombre: string }[];
  /** 0047 — Ambientes de interés (números). */
  ambientes: number[];
  /** 0047 — Tipologías de interés (unidades tipo «1A», «2B»). */
  tipologiasUnidad: string[];
  updatedAt: string;
  /** War — «Sin respuesta · 3 intentos · hace 4 días», o null. */
  sinRespuesta: string | null;
};

export type EstadoComercialDto = {
  /** v4 — Lo que la persona es (selección múltiple). */
  tiposContacto: TipoContacto[];
  abierta: OportunidadDelChat | null;
  /** Cuántas oportunidades cerradas tuvo antes este contacto. */
  anteriores: number;
  /** El catálogo para elegir edificios de interés en el panel. */
  edificios: { id: string; nombre: string }[];
};

function esViolacionUnica(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "23505"
  );
}

async function contactoDe(organizationId: string, contactId: string) {
  const [c] = await getDb()
    .select({
      id: schema.contact.id,
      name: schema.contact.name,
      tiposContacto: schema.contact.tiposContacto,
      aiPaused: schema.contact.aiPaused,
    })
    .from(schema.contact)
    .where(scoped(schema.contact.organizationId, organizationId, eq(schema.contact.id, contactId)))
    .limit(1);
  return c ?? null;
}

export async function oportunidadAbierta(
  organizationId: string,
  contactId: string,
  db: Db = getDb()
): Promise<FilaOportunidad | null> {
  const [op] = await db
    .select()
    .from(schema.oportunidad)
    .where(
      scoped(
        schema.oportunidad.organizationId,
        organizationId,
        eq(schema.oportunidad.contactId, contactId),
        inArray(schema.oportunidad.estado, ABIERTOS)
      )
    )
    // War: puede haber varias abiertas (una por edificio); manda la que tuvo
    // la última interacción del interesado.
    .orderBy(desc(schema.oportunidad.ultimaInteraccion), desc(schema.oportunidad.updatedAt))
    .limit(1);
  return op ?? null;
}

async function interesDe(
  organizationId: string,
  oportunidadId: string
): Promise<{ edificios: { id: string; nombre: string }[]; ambientes: number[]; tipologiasUnidad: string[] }> {
  const db = getDb();
  const [edificios, ambientes, tipologias] = await Promise.all([
    db
      .select({ id: schema.edificio.id, nombre: schema.edificio.nombre })
      .from(schema.oportunidadEdificio)
      .innerJoin(schema.edificio, eq(schema.edificio.id, schema.oportunidadEdificio.edificioId))
      .where(
        scoped(
          schema.oportunidadEdificio.organizationId,
          organizationId,
          eq(schema.oportunidadEdificio.oportunidadId, oportunidadId)
        )
      )
      .orderBy(asc(schema.edificio.nombre)),
    db
      .select({ ambientes: schema.oportunidadAmbiente.ambientes })
      .from(schema.oportunidadAmbiente)
      .where(
        scoped(
          schema.oportunidadAmbiente.organizationId,
          organizationId,
          eq(schema.oportunidadAmbiente.oportunidadId, oportunidadId)
        )
      ),
    db
      .select({ tipologia: schema.oportunidadTipologiaUnidad.tipologia })
      .from(schema.oportunidadTipologiaUnidad)
      .where(
        scoped(
          schema.oportunidadTipologiaUnidad.organizationId,
          organizationId,
          eq(schema.oportunidadTipologiaUnidad.oportunidadId, oportunidadId)
        )
      ),
  ]);
  return {
    edificios,
    ambientes: ambientes.map((a) => a.ambientes).sort((a, b) => a - b),
    tipologiasUnidad: ordenarTipologiasUnidad(tipologias.map((t) => t.tipologia)),
  };
}

async function aDelChat(
  organizationId: string,
  op: FilaOportunidad
): Promise<OportunidadDelChat> {
  const interes = await interesDe(organizationId, op.id);
  return {
    id: op.id,
    nombre: op.nombre,
    estado: op.estado,
    tipo: op.tipo ?? null,
    motivoCierre: op.motivoCierre,
    edificios: interes.edificios,
    ambientes: interes.ambientes,
    tipologiasUnidad: interes.tipologiasUnidad,
    updatedAt: op.updatedAt.toISOString(),
    // Cambios 25/11 — El conteo de intentos es del cierre por falta de
    // respuesta: un cliente que no lo usa no lo ve.
    sinRespuesta: (await vocabulario()).cierrePorSinRespuesta ? textoSinRespuesta(op) : null,
  };
}

/** Lo que muestra el panel del chat: tipo, oportunidad abierta y catálogo. */
export async function estadoComercialDelContacto(
  organizationId: string,
  contactId: string
): Promise<EstadoComercialDto | null> {
  const contacto = await contactoDe(organizationId, contactId);
  if (!contacto) return null;
  const db = getDb();
  const [abierta, [cerradas], edificios] = await Promise.all([
    oportunidadAbierta(organizationId, contactId),
    db
      .select({ n: count() })
      .from(schema.oportunidad)
      .where(
        scoped(
          schema.oportunidad.organizationId,
          organizationId,
          eq(schema.oportunidad.contactId, contactId),
          notInArray(schema.oportunidad.estado, ABIERTOS)
        )
      ),
    db
      .select({ id: schema.edificio.id, nombre: schema.edificio.nombre, enVenta: schema.edificio.enVenta })
      .from(schema.edificio)
      .where(scoped(schema.edificio.organizationId, organizationId))
      .orderBy(asc(schema.edificio.nombre)),
  ]);
  const delChat = abierta ? await aDelChat(organizationId, abierta) : null;
  // v5 — Para elegir, solo los que están en venta (y los que ya tenía).
  const tenia = new Set(delChat?.edificios.map((e) => e.id) ?? []);
  return {
    tiposContacto: tiposValidos(contacto.tiposContacto),
    abierta: delChat,
    anteriores: Number(cerradas?.n ?? 0),
    edificios: edificios.filter((e) => e.enVenta || tenia.has(e.id)).map(({ id, nombre }) => ({ id, nombre })),
  };
}

/**
 * War — Casi siempre la oportunidad se abre DESPUÉS de que la persona
 * escribió (Mateo la clasifica como Lead leyendo su mensaje): ese mensaje es
 * su primera respuesta. Sin esto, «sin respuesta» y el tiempo hasta la primera
 * respuesta arrancarían como si nunca hubiera escrito.
 */
async function conRespuestaPrevia(
  organizationId: string,
  contactId: string,
  op: FilaOportunidad
): Promise<FilaOportunidad> {
  try {
    const [conv] = await getDb()
      .select({ lastInboundAt: schema.conversation.lastInboundAt })
      .from(schema.conversation)
      .where(
        scoped(
          schema.conversation.organizationId,
          organizationId,
          eq(schema.conversation.contactId, contactId),
          eq(schema.conversation.isTest, false)
        )
      )
      .orderBy(desc(schema.conversation.lastInboundAt))
      .limit(1);
    const at = conv?.lastInboundAt;
    if (!at) return op;
    const [fila] = await getDb()
      .update(schema.oportunidad)
      .set({ ultimaRespuestaAt: at, primeraRespuestaAt: at })
      .where(eq(schema.oportunidad.id, op.id))
      .returning();
    if (fila) {
      await registrarEvento({
        organizationId,
        op: fila,
        tipo: "primera_respuesta",
        actor: { fuente: "sistema" },
        at,
      });
    }
    return fila ?? op;
  } catch (err) {
    console.error("[historial] respuesta previa sin registrar:", err instanceof Error ? err.message : err);
    return op;
  }
}

/**
 * Abre la oportunidad del contacto si no tiene una abierta; si ya la tiene,
 * la devuelve. Idempotente también ante dos pedidos a la vez: el índice único
 * parcial frena al segundo y aquí se devuelve la que ganó.
 */
export async function abrirOportunidad(
  organizationId: string,
  contactId: string,
  actor: Actor = { fuente: "sistema" },
  /** v4 — Lo que busca: Venta, Alquiler o Inmobiliaria. */
  tipo: TipoOportunidad | null = null
): Promise<FilaOportunidad> {
  const existente = await oportunidadAbierta(organizationId, contactId);
  if (existente) {
    // La que ya estaba abierta sin tipo toma el que se detectó.
    if (tipo && !existente.tipo) {
      await getDb().update(schema.oportunidad).set({ tipo, updatedAt: new Date() }).where(eq(schema.oportunidad.id, existente.id));
      return { ...existente, tipo };
    }
    return existente;
  }
  const contacto = await contactoDe(organizationId, contactId);
  if (!contacto) throw new VentasError(404, "not_found", "Ese contacto no existe");
  try {
    const [nueva] = await getDb()
      .insert(schema.oportunidad)
      .values({
        id: newId("oportunidad"),
        organizationId,
        nombre: contacto.name,
        contactId,
        estado: "recibido",
        ...(tipo ? { tipo } : {}),
      })
      .returning();
    await registrarCreada(organizationId, nueva!, actor);
    return await conRespuestaPrevia(organizationId, contactId, nueva!);
  } catch (err) {
    if (!esViolacionUnica(err)) throw err;
    const ganadora = await oportunidadAbierta(organizationId, contactId);
    if (!ganadora) throw err;
    return ganadora;
  }
}

/**
 * War — El interesado escribió por WhatsApp.
 *
 * - Si tiene una oportunidad abierta, la más reciente toma esta última
 *   interacción y vuelve arriba en la lista.
 * - Si es Lead y no tiene ninguna abierta (las anteriores se cerraron), se
 *   abre una nueva: volvió a consultar. Si vino de un anuncio, el origen
 *   queda en Meta Ads.
 *
 * Nunca frena la ingesta: quien la llama atrapa cualquier error.
 */
export async function registrarInteraccionDelContacto(input: {
  organizationId: string;
  contactId: string;
  at: Date;
  desdeAnuncio: boolean;
}): Promise<void> {
  const { organizationId, contactId, at } = input;
  const abierta = await oportunidadAbierta(organizationId, contactId);
  if (abierta) {
    await getDb()
      .update(schema.oportunidad)
      .set({ ultimaInteraccion: at, updatedAt: new Date() })
      .where(eq(schema.oportunidad.id, abierta.id));
    await registrarRespuesta({ organizationId, contactId, at });
    return;
  }
  // Cambios 25/11 — En un cliente donde cada lead nace con su oportunidad (un
  // restaurante: Recibido), quien escribe sin una abierta tiene una nueva. No
  // se reabre la anterior: una reserva cerrada (Asistió, Canceló) es pasado.
  if ((await vocabulario()).abrirConCadaLead) {
    const nueva = await abrirOportunidad(organizationId, contactId, { fuente: "sistema" });
    await getDb()
      .update(schema.oportunidad)
      .set({
        ultimaInteraccion: at,
        ...(input.desdeAnuncio && !nueva.origen ? { origen: "Meta Ads" } : {}),
      })
      .where(eq(schema.oportunidad.id, nueva.id));
    await avisarConversaciones(organizationId, contactId);
    return;
  }
  // v4 — Sin «Lead»: vuelve a la venta quien ya tuvo una oportunidad. Quien
  // nunca tuvo la arma el agente o el lector al leer el chat.
  const ajustes = await leerAjustesVentas(organizationId);
  const previa = await ultimaCerrada(organizationId, contactId);
  if (!previa) return;

  // Se había perdido hace poco (por ejemplo, cerrada por no responder): se
  // reabre LA MISMA, con su formulario y su campaña, en el estado que tenía.
  if (seReabre(previa.op, ajustes, at)) {
    await cambiarEstadoOportunidad({
      organizationId,
      oportunidadId: previa.op.id,
      destino: previa.estadoPrevio,
      motivoCierre: null,
      actor: { fuente: "sistema" },
      at,
    });
    await getDb()
      .update(schema.oportunidad)
      .set({ ultimaInteraccion: at })
      .where(eq(schema.oportunidad.id, previa.op.id));
  } else {
    // Volvió a consultar después de la ventana: una nueva, del mismo tipo.
    const nueva = await abrirOportunidad(organizationId, contactId, { fuente: "sistema" }, previa.op.tipo ?? null);
    await getDb()
      .update(schema.oportunidad)
      .set({
        ultimaInteraccion: at,
        ...(input.desdeAnuncio && !nueva.origen ? { origen: "Meta Ads" } : {}),
      })
      .where(eq(schema.oportunidad.id, nueva.id));
  }
  await registrarRespuesta({ organizationId, contactId, at });
  await avisarConversaciones(organizationId, contactId);
}

export async function avisarConversaciones(organizationId: string, contactId: string) {
  const convs = await getDb()
    .select({ id: schema.conversation.id })
    .from(schema.conversation)
    .where(
      scoped(
        schema.conversation.organizationId,
        organizationId,
        eq(schema.conversation.contactId, contactId)
      )
    );
  for (const c of convs) {
    publish(organizationId, { type: "conversation.updated", data: { conversation: { id: c.id } } });
  }
}

/**
 * v4 — Lo que la persona ES (selección múltiple). Una persona cambia la lista
 * entera; la IA solo SUMA (nunca quita, nunca pone «propio»): no pisa lo que
 * alguien decidió.
 */
export async function cambiarTiposContacto(input: {
  organizationId: string;
  contactId: string;
  tipos: readonly TipoContacto[];
  fuente: "ia" | "persona";
  userId?: string | null;
}): Promise<{ changed: boolean; tipos: TipoContacto[] }> {
  const { organizationId, contactId, fuente } = input;
  const contacto = await contactoDe(organizationId, contactId);
  if (!contacto) throw new VentasError(404, "not_found", "Ese contacto no existe");
  const antes = tiposValidos(contacto.tiposContacto);
  const pedidos = tiposValidos(input.tipos).filter((t) => fuente === "persona" || t !== "propio");
  const despues = fuente === "ia" ? tiposValidos([...antes, ...pedidos]) : pedidos;
  if (despues.join() === antes.join()) return { changed: false, tipos: antes };
  await getDb()
    .update(schema.contact)
    .set({ tiposContacto: despues, updatedAt: new Date() })
    .where(scoped(schema.contact.organizationId, organizationId, eq(schema.contact.id, contactId)));
  await avisarConversaciones(organizationId, contactId);
  return { changed: true, tipos: despues };
}

/**
 * v4 — Lo que la IA detectó (lo que dejó el agente o el lector): abre o
 * completa la oportunidad con lo que busca y suma lo que la persona es.
 */
export async function aplicarClasificacionIa(input: {
  organizationId: string;
  contactId: string;
  oportunidad: TipoOportunidad | null;
  contacto: TipoContacto | null;
}): Promise<void> {
  if (input.contacto) {
    await cambiarTiposContacto({
      organizationId: input.organizationId,
      contactId: input.contactId,
      tipos: [input.contacto],
      fuente: "ia",
    });
  }
  if (input.oportunidad) {
    await abrirOportunidad(input.organizationId, input.contactId, { fuente: "ia" }, input.oportunidad);
    await avisarConversaciones(input.organizationId, input.contactId);
  }
}

/**
 * v4 — Al arrancar: los contactos que eran «Lead» (el tipo viejo) pasan a
 * tener su oportunidad de Venta. Si ya tuvieron alguna, no se crea otra (la
 * abierta sin tipo ya quedó en Venta con la migración 0066). Re-ejecutable:
 * marca cada uno al terminar. Nunca tumba el arranque.
 */
export async function pasarLeadsAVentaAlArrancar(): Promise<void> {
  try {
    const db = getDb();
    const leads = await db
      .select({ id: schema.contact.id, organizationId: schema.contact.organizationId })
      .from(schema.contact)
      .where(eq(schema.contact.tipoContactoAnterior, "lead"))
      .limit(5000);
    let creadas = 0;
    for (const c of leads) {
      const [alguna] = await db
        .select({ id: schema.oportunidad.id })
        .from(schema.oportunidad)
        .where(scoped(schema.oportunidad.organizationId, c.organizationId, eq(schema.oportunidad.contactId, c.id)))
        .limit(1);
      if (!alguna) {
        await abrirOportunidad(c.organizationId, c.id, { fuente: "sistema" }, "venta").catch(() => null);
        creadas++;
      }
      await db.update(schema.contact).set({ tipoContactoAnterior: null }).where(eq(schema.contact.id, c.id));
    }
    if (leads.length) console.log(`[v4] ${leads.length} contacto(s) Lead pasados a Venta (${creadas} oportunidad(es) nueva(s))`);
  } catch (err) {
    console.error("[v4] no se pudieron pasar los Lead a Venta:", err instanceof Error ? err.message : err);
  }
}

/**
 * v5 — Solo se abre interés por edificios EN VENTA. Uno que ya estaba en la
 * oportunidad (`conservar`) se mantiene aunque haya dejado de estar en venta.
 * Vale para todos: una persona, la IA, el lector y los leads.
 */
async function edificiosValidos(
  organizationId: string,
  ids: readonly string[],
  conservar: readonly string[] = []
): Promise<string[]> {
  if (ids.length === 0) return [];
  const filas = await getDb()
    .select({ id: schema.edificio.id, enVenta: schema.edificio.enVenta })
    .from(schema.edificio)
    .where(scoped(schema.edificio.organizationId, organizationId, inArray(schema.edificio.id, [...ids])));
  return filas.filter((f) => f.enVenta || conservar.includes(f.id)).map((f) => f.id);
}

async function edificiosDe(organizationId: string, oportunidadId: string): Promise<string[]> {
  const filas = await getDb()
    .select({ id: schema.oportunidadEdificio.edificioId })
    .from(schema.oportunidadEdificio)
    .where(
      scoped(
        schema.oportunidadEdificio.organizationId,
        organizationId,
        eq(schema.oportunidadEdificio.oportunidadId, oportunidadId)
      )
    );
  return filas.map((f) => f.id);
}

/**
 * Suma interés sin quitar lo que ya había (lo que hace la IA o un lead). Con
 * el interés encadenado del motor, recalcula el Valor; nunca suelta unidades.
 */
export async function sumarInteres(
  organizationId: string,
  oportunidadId: string,
  edificioIds: readonly string[],
  ambientes: readonly number[],
  tipologiasUnidad: readonly string[] = []
): Promise<void> {
  // 0051 — Si es su primer edificio, puede tocarle a alguien (asignación automática).
  const primerEdificio = edificioIds.length > 0 && !(await tieneEdificios(organizationId, oportunidadId));
  await insertarInteres(organizationId, oportunidadId, edificioIds, ambientes, tipologiasUnidad);
  await ajustarInteres(organizationId, oportunidadId, { podar: false });
  if (primerEdificio) await asignarLeadDeMeta(organizationId, oportunidadId);
}

async function tieneEdificios(organizationId: string, oportunidadId: string): Promise<boolean> {
  const [f] = await getDb()
    .select({ id: schema.oportunidadEdificio.edificioId })
    .from(schema.oportunidadEdificio)
    .where(
      scoped(
        schema.oportunidadEdificio.organizationId,
        organizationId,
        eq(schema.oportunidadEdificio.oportunidadId, oportunidadId)
      )
    )
    .limit(1);
  return Boolean(f);
}

async function insertarInteres(
  organizationId: string,
  oportunidadId: string,
  edificioIds: readonly string[],
  ambientes: readonly number[],
  tipologiasUnidad: readonly string[] = [],
  conservar?: readonly string[]
): Promise<void> {
  const db = getDb();
  const validos = await edificiosValidos(
    organizationId,
    edificioIds,
    conservar ?? (edificioIds.length ? await edificiosDe(organizationId, oportunidadId) : [])
  );
  if (validos.length) {
    await db
      .insert(schema.oportunidadEdificio)
      .values(validos.map((edificioId) => ({ organizationId, oportunidadId, edificioId })))
      .onConflictDoNothing();
  }
  const amb = [...new Set(ambientes)].filter((n) => Number.isInteger(n) && n > 0 && n <= MAX_AMBIENTES);
  if (amb.length) {
    await db
      .insert(schema.oportunidadAmbiente)
      .values(amb.map((n) => ({ organizationId, oportunidadId, ambientes: n })))
      .onConflictDoNothing();
  }
  const tips = [...new Set(tipologiasUnidad.map((t) => t.trim()).filter(Boolean))];
  if (tips.length) {
    await db
      .insert(schema.oportunidadTipologiaUnidad)
      .values(tips.map((tipologia) => ({ organizationId, oportunidadId, tipologia })))
      .onConflictDoNothing();
  }
}

/** Reemplaza el interés (lo que hace una persona desde el panel o el formulario). */
export async function reemplazarInteres(
  organizationId: string,
  oportunidadId: string,
  cambios: {
    edificioIds?: readonly string[];
    ambientes?: readonly number[];
    tipologiasUnidad?: readonly string[];
  }
): Promise<void> {
  const db = getDb();
  if (cambios.edificioIds) {
    // Los que ya tenía se pueden dejar aunque no estén más en venta.
    const tenia = await edificiosDe(organizationId, oportunidadId);
    await db
      .delete(schema.oportunidadEdificio)
      .where(
        scoped(
          schema.oportunidadEdificio.organizationId,
          organizationId,
          eq(schema.oportunidadEdificio.oportunidadId, oportunidadId)
        )
      );
    await insertarInteres(organizationId, oportunidadId, cambios.edificioIds, [], [], tenia);
  }
  if (cambios.ambientes) {
    await db
      .delete(schema.oportunidadAmbiente)
      .where(
        scoped(
          schema.oportunidadAmbiente.organizationId,
          organizationId,
          eq(schema.oportunidadAmbiente.oportunidadId, oportunidadId)
        )
      );
    await insertarInteres(organizationId, oportunidadId, [], cambios.ambientes);
  }
  if (cambios.tipologiasUnidad) {
    await db
      .delete(schema.oportunidadTipologiaUnidad)
      .where(
        scoped(
          schema.oportunidadTipologiaUnidad.organizationId,
          organizationId,
          eq(schema.oportunidadTipologiaUnidad.oportunidadId, oportunidadId)
        )
      );
    await insertarInteres(organizationId, oportunidadId, [], [], cambios.tipologiasUnidad);
  }
  // Sacar un edificio o un ambiente suelta las unidades que ya no coinciden, y
  // el Valor se recalcula (interés encadenado del motor).
  if (cambios.edificioIds || cambios.ambientes) {
    await ajustarInteres(organizationId, oportunidadId, { podar: true });
  }
}

/**
 * Cambios que hace una persona sobre una oportunidad desde el chat: etapa
 * (cualquiera), motivo de cierre e interés. Reabrir una cerrada cuando el
 * contacto ya tiene otra abierta da 409: una abierta por contacto.
 */
export async function actualizarOportunidadDelChat(input: {
  organizationId: string;
  oportunidadId: string;
  estado?: EstadoOportunidad;
  motivoCierre?: string | null;
  edificioIds?: readonly string[];
  ambientes?: readonly number[];
  tipologiasUnidad?: readonly string[];
  /** War — quién lo cambió, para el historial. */
  userId?: string | null;
}): Promise<OportunidadDelChat> {
  const { organizationId, oportunidadId } = input;
  let fila: FilaOportunidad | null | undefined;
  if (input.estado) {
    // El cambio de estado pasa por el historial (evento y tiempos).
    fila = await cambiarEstadoOportunidad({
      organizationId,
      oportunidadId,
      destino: input.estado,
      motivoCierre: input.motivoCierre,
      actor: { fuente: "persona", userId: input.userId ?? null },
    });
  }
  if (fila !== null) {
    [fila] = await getDb()
      .update(schema.oportunidad)
      .set({
        updatedAt: new Date(),
        ...(!input.estado && input.motivoCierre !== undefined
          ? { motivoCierre: input.motivoCierre }
          : {}),
      })
      .where(
        scoped(
          schema.oportunidad.organizationId,
          organizationId,
          eq(schema.oportunidad.id, oportunidadId)
        )
      )
      .returning();
  }
  if (!fila) throw new VentasError(404, "not_found", "Esa oportunidad no existe");
  await reemplazarInteres(organizationId, oportunidadId, {
    edificioIds: input.edificioIds,
    ambientes: input.ambientes,
    tipologiasUnidad: input.tipologiasUnidad,
  });
  if (fila.contactId) await avisarConversaciones(organizationId, fila.contactId);
  return aDelChat(organizationId, fila);
}

/* ------------------------------------------------------------------
 * El cerebro (Nea) — el contrato de /api/bot/* no cambia
 * ------------------------------------------------------------------ */

/** Las claves de la ficha que el CRM de War lee además de guardarlas. */
export const CLAVES_FICHA_WAR = {
  tipo: "tipo_contacto",
  edificios: "edificios_interes",
  tipologias: "tipologias_interes",
} as const;

/**
 * Después de guardar la ficha que escribió el cerebro, el CRM aplica lo que
 * le toca: clasificar al contacto y sumar el interés a la oportunidad
 * abierta. Nunca lanza: la ficha ya quedó guardada y un error aquí no puede
 * convertirse en un 500 para el cerebro.
 */
export async function aplicarFichaDelCerebro(input: {
  organizationId: string;
  contactId: string;
  esPrueba: boolean;
  ficha: Record<string, unknown>;
}): Promise<void> {
  // El Laboratorio no toca el embudo real.
  if (input.esPrueba) return;
  const { organizationId, contactId, ficha } = input;
  try {
    const clasificacion = normalizarTipoContacto(ficha[CLAVES_FICHA_WAR.tipo]);
    if (clasificacion) await aplicarClasificacionIa({ organizationId, contactId, ...clasificacion });

    const rawEdificios = ficha[CLAVES_FICHA_WAR.edificios];
    const tipologias = normalizarTipologias(ficha[CLAVES_FICHA_WAR.tipologias]);
    if (rawEdificios === undefined && tipologias.length === 0) return;

    const abierta = await oportunidadAbierta(organizationId, contactId);
    if (!abierta) return;
    const catalogo = await getDb()
      .select({
        id: schema.edificio.id,
        nombre: schema.edificio.nombre,
        direccion: schema.edificio.direccion,
      })
      .from(schema.edificio)
      .where(scoped(schema.edificio.organizationId, organizationId));
    const edificios = resolverEdificiosPorNombre(rawEdificios, catalogo).map((e) => e.id);
    if (edificios.length || tipologias.length) {
      const ambientes = tipologias.map(ambientesDeTipologia).filter((n): n is number => n !== null);
      await sumarInteres(organizationId, abierta.id, edificios, ambientes);
      await getDb()
        .update(schema.oportunidad)
        .set({ updatedAt: new Date() })
        .where(eq(schema.oportunidad.id, abierta.id));
      await avisarConversaciones(organizationId, contactId);
    }
  } catch (err) {
    console.error("[068] no se pudo aplicar la ficha del cerebro", err);
  }
}

export type LeadParaElCerebro = {
  id: string;
  stageName: string;
  nextStages: { id: string; name: string }[];
};

/**
 * Lo que el contexto le muestra al cerebro como `lead`: la oportunidad
 * abierta de un contacto Lead, con las etapas a las que la IA puede llevarla.
 * `null` si no hay nada que el cerebro pueda mover.
 */
export async function leadParaElCerebro(
  organizationId: string,
  contactId: string
): Promise<LeadParaElCerebro | null> {
  // v4 — El cerebro mueve la oportunidad abierta de Venta (o sin tipo).
  const abierta = await oportunidadAbierta(organizationId, contactId);
  if (!abierta || (abierta.tipo && abierta.tipo !== "venta")) return null;
  const voc = await vocabulario();
  return {
    id: abierta.id,
    stageName: nombreEstado(voc, abierta.estado),
    nextStages: (await siguientesDeLaIA(abierta.estado)).map((e) => ({ id: e, name: nombreEstado(voc, e) })),
  };
}

/**
 * Cambios 25/11 — Las etapas a las que la IA puede llevarla, solo las que
 * esta instancia muestra: un restaurante no tiene «En charlas».
 */
async function siguientesDeLaIA(actual: EstadoOportunidad): Promise<EstadoOportunidad[]> {
  const visibles = new Set((await vocabulario()).estados.map((e) => e.value));
  return siguientesParaLaIA(actual).filter((e) => visibles.has(e));
}

/** La etapa que pidió el cerebro, por el nombre de esta instancia o el del núcleo. */
async function etapaPedida(pedida: string): Promise<EstadoOportunidad | null> {
  const limpia = pedida.trim().toLowerCase();
  const propia = (await vocabulario()).estados.find((e) => e.label.trim().toLowerCase() === limpia);
  return propia?.value ?? resolverEstadoOportunidad(pedida);
}

export type ResultadoEtapaWar =
  | { ok: true; changed: boolean; lead: { id: string; stageName: string }; conversationId: string }
  | { ok: false; status: 404; code: "not_found" | "sin_lead"; message: string }
  | {
      ok: false;
      status: 409;
      code: "ai_paused" | "herramienta_apagada" | "etapa_no_permitida";
      message: string;
    }
  | { ok: false; status: 422; code: "etapa_desconocida"; message: string };

function listaParaElModelo(estados: readonly EstadoOportunidad[], voc: Vocabulario): string {
  return estados.length
    ? `Puedes moverla a: ${estados.map((e) => nombreEstado(voc, e)).join(", ")}.`
    : "No hay etapas a las que puedas moverla: el resto lo decide una persona.";
}

/**
 * `POST /api/bot/stage` en War: mueve la oportunidad abierta, solo hacia
 * adelante y solo dentro de las etapas de la IA (hasta Conoce información).
 * Mismas guardas que el pipeline de Vocero: IA activa y herramienta `etapa`.
 */
export async function moverOportunidadPorElCerebro(input: {
  organizationId: string;
  conversationId: string;
  stage: string;
}): Promise<ResultadoEtapaWar> {
  const db = getDb();
  const { organizationId } = input;
  const [conv] = await db
    .select({
      id: schema.conversation.id,
      contactId: schema.conversation.contactId,
      aiEnabled: schema.conversation.aiEnabled,
      handoffAt: schema.conversation.handoffAt,
      isTest: schema.conversation.isTest,
    })
    .from(schema.conversation)
    .where(
      scoped(
        schema.conversation.organizationId,
        organizationId,
        eq(schema.conversation.id, input.conversationId)
      )
    )
    .limit(1);
  if (!conv) {
    return { ok: false, status: 404, code: "not_found", message: "Conversación no encontrada" };
  }
  if (!conv.aiEnabled || conv.handoffAt) {
    return { ok: false, status: 409, code: "ai_paused", message: "La IA está en pausa en esta conversación" };
  }
  const [perfil] = await db
    .select({ tools: schema.agentProfile.tools })
    .from(schema.agentProfile)
    .where(scoped(schema.agentProfile.organizationId, organizationId))
    .limit(1);
  if (!herramientasEfectivas(perfil?.tools).includes("etapa")) {
    return {
      ok: false,
      status: 409,
      code: "herramienta_apagada",
      message: "La herramienta «Mover de etapa» está apagada en el perfil del agente",
    };
  }

  const lead = conv.isTest ? null : await leadParaElCerebro(organizationId, conv.contactId);
  const abierta = lead ? await oportunidadAbierta(organizationId, conv.contactId) : null;
  if (!lead || !abierta) {
    return {
      ok: false,
      status: 404,
      code: "sin_lead",
      message: "El contacto no tiene una oportunidad abierta (o todavía no está clasificado como Lead)",
    };
  }

  const voc = await vocabulario();
  const siguientes = await siguientesDeLaIA(abierta.estado);
  const destino = await etapaPedida(input.stage);
  if (!destino) {
    return {
      ok: false,
      status: 422,
      code: "etapa_desconocida",
      message: `No existe la etapa «${input.stage.trim()}». ${listaParaElModelo(siguientes, voc)}`,
    };
  }
  if (destino === abierta.estado) {
    return { ok: true, changed: false, lead: { id: abierta.id, stageName: lead.stageName }, conversationId: conv.id };
  }
  if (!siguientes.includes(destino)) {
    return {
      ok: false,
      status: 409,
      code: "etapa_no_permitida",
      message: `No puedes mover la oportunidad a «${nombreEstado(voc, destino)}». ${listaParaElModelo(siguientes, voc)}`,
    };
  }

  await cambiarEstadoOportunidad({
    organizationId,
    oportunidadId: abierta.id,
    destino,
    actor: { fuente: "ia" },
  });
  await avisarConversaciones(organizationId, conv.contactId);
  return {
    ok: true,
    changed: true,
    lead: { id: abierta.id, stageName: nombreEstado(voc, destino) },
    conversationId: conv.id,
  };
}
