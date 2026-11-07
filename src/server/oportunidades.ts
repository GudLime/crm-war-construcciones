import { asc, count, desc, eq, inArray, notInArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { herramientasEfectivas } from "@/lib/agent-roles";
import {
  ESTADOS_ABIERTOS,
  ESTADOS_OPORTUNIDAD,
  TIPOS_QUE_CLASIFICA_LA_IA,
  VALORES_TIPOLOGIA,
  etiqueta,
  normalizarTipoContacto,
  normalizarTipologias,
  resolverEdificiosPorNombre,
  resolverEstadoOportunidad,
  siguientesParaLaIA,
  tipoExcluyeDeVenta,
  type EstadoOportunidad,
  type TipoContacto,
  type Tipologia,
} from "@/lib/ventas";
import { pauseConversations } from "@/server/contacts-import";
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
import { VentasError } from "@/server/ventas";

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
  motivoCierre: string | null;
  edificios: { id: string; nombre: string }[];
  tipologias: Tipologia[];
  updatedAt: string;
  /** War — «Sin respuesta · 3 intentos · hace 4 días», o null. */
  sinRespuesta: string | null;
};

export type EstadoComercialDto = {
  tipoContacto: TipoContacto | null;
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
      tipoContacto: schema.contact.tipoContacto,
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
): Promise<{ edificios: { id: string; nombre: string }[]; tipologias: Tipologia[] }> {
  const db = getDb();
  const [edificios, tipologias] = await Promise.all([
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
      .select({ tipologia: schema.oportunidadTipologia.tipologia })
      .from(schema.oportunidadTipologia)
      .where(
        scoped(
          schema.oportunidadTipologia.organizationId,
          organizationId,
          eq(schema.oportunidadTipologia.oportunidadId, oportunidadId)
        )
      ),
  ]);
  const set = new Set(tipologias.map((t) => t.tipologia));
  return {
    edificios,
    tipologias: (VALORES_TIPOLOGIA as Tipologia[]).filter((t) => set.has(t)),
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
    motivoCierre: op.motivoCierre,
    edificios: interes.edificios,
    tipologias: interes.tipologias,
    updatedAt: op.updatedAt.toISOString(),
    sinRespuesta: textoSinRespuesta(op),
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
      .select({ id: schema.edificio.id, nombre: schema.edificio.nombre })
      .from(schema.edificio)
      .where(scoped(schema.edificio.organizationId, organizationId))
      .orderBy(asc(schema.edificio.nombre)),
  ]);
  return {
    tipoContacto: contacto.tipoContacto,
    abierta: abierta ? await aDelChat(organizationId, abierta) : null,
    anteriores: Number(cerradas?.n ?? 0),
    edificios,
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
  actor: Actor = { fuente: "sistema" }
): Promise<FilaOportunidad> {
  const existente = await oportunidadAbierta(organizationId, contactId);
  if (existente) return existente;
  const contacto = await contactoDe(organizationId, contactId);
  if (!contacto) throw new VentasError(404, "not_found", "Ese contacto no existe");
  if (contacto.tipoContacto !== "lead") {
    throw new VentasError(
      409,
      "no_es_lead",
      "Solo un contacto de tipo Lead tiene oportunidades de venta"
    );
  }
  try {
    const [nueva] = await getDb()
      .insert(schema.oportunidad)
      .values({
        id: newId("oportunidad"),
        organizationId,
        nombre: contacto.name,
        contactId,
        estado: "recibido",
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
  const contacto = await contactoDe(organizationId, contactId);
  if (contacto?.tipoContacto !== "lead") return;

  // Se había perdido hace poco (por ejemplo, cerrada por no responder): se
  // reabre LA MISMA, con su formulario y su campaña, en el estado que tenía.
  const ajustes = await leerAjustesVentas(organizationId);
  const previa = await ultimaCerrada(organizationId, contactId);
  if (previa && seReabre(previa.op, ajustes, at)) {
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
    // Volvió a consultar después de la ventana (o nunca tuvo): una nueva.
    const nueva = await abrirOportunidad(organizationId, contactId);
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
 * Clasifica un contacto.
 *
 * - `ia`: solo si está sin clasificar, y nunca como `propio`. Una persona
 *   manda: la IA no pisa lo que alguien decidió.
 * - `persona`: cualquier tipo, o `null` para volver a "sin clasificar".
 *
 * Efectos: `lead` abre la oportunidad; los tipos fuera de la venta apagan el
 * agente para ese contacto (lo atiende una persona). Si una persona lo pasa de
 * un tipo excluido a `lead`, el agente vuelve a estar disponible.
 */
export async function clasificarContacto(input: {
  organizationId: string;
  contactId: string;
  tipo: TipoContacto | null;
  fuente: "ia" | "persona";
  /** War — quién (si fue una persona), para el historial. */
  userId?: string | null;
}): Promise<{ changed: boolean; tipo: TipoContacto | null }> {
  const { organizationId, contactId, tipo, fuente } = input;
  const actor: Actor =
    fuente === "ia" ? { fuente: "ia" } : { fuente: "persona", userId: input.userId ?? null };
  const contacto = await contactoDe(organizationId, contactId);
  if (!contacto) throw new VentasError(404, "not_found", "Ese contacto no existe");

  if (fuente === "ia") {
    if (contacto.tipoContacto != null) return { changed: false, tipo: contacto.tipoContacto };
    if (!tipo || !TIPOS_QUE_CLASIFICA_LA_IA.includes(tipo)) {
      return { changed: false, tipo: contacto.tipoContacto };
    }
  }
  if (contacto.tipoContacto === tipo) {
    if (tipo === "lead") await abrirOportunidad(organizationId, contactId, actor);
    return { changed: false, tipo };
  }

  const antes = contacto.tipoContacto;
  const excluyeAhora = tipoExcluyeDeVenta(tipo);
  const excluiaAntes = tipoExcluyeDeVenta(antes);

  await getDb()
    .update(schema.contact)
    .set({
      tipoContacto: tipo,
      updatedAt: new Date(),
      ...(excluyeAhora ? { aiPaused: true } : excluiaAntes ? { aiPaused: false } : {}),
    })
    .where(scoped(schema.contact.organizationId, organizationId, eq(schema.contact.id, contactId)));

  // Una persona corta la IA en el acto. Si clasifica la IA, la conversación
  // NO se pausa aquí: el agente todavía tiene que despedirse y derivar en
  // este mismo turno; el despacho deja de mandarle mensajes desde el próximo.
  if (excluyeAhora && fuente === "persona") {
    await pauseConversations(organizationId, [contactId], true);
  } else if (excluiaAntes) {
    await pauseConversations(organizationId, [contactId], false);
  }
  if (tipo === "lead") await abrirOportunidad(organizationId, contactId, actor);

  await avisarConversaciones(organizationId, contactId);
  return { changed: true, tipo };
}

async function edificiosValidos(organizationId: string, ids: readonly string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const filas = await getDb()
    .select({ id: schema.edificio.id })
    .from(schema.edificio)
    .where(scoped(schema.edificio.organizationId, organizationId, inArray(schema.edificio.id, [...ids])));
  return filas.map((f) => f.id);
}

/** Suma interés sin quitar lo que ya había (lo que hace la IA). */
export async function sumarInteres(
  organizationId: string,
  oportunidadId: string,
  edificioIds: readonly string[],
  tipologias: readonly Tipologia[]
): Promise<void> {
  const db = getDb();
  const validos = await edificiosValidos(organizationId, edificioIds);
  if (validos.length) {
    await db
      .insert(schema.oportunidadEdificio)
      .values(validos.map((edificioId) => ({ organizationId, oportunidadId, edificioId })))
      .onConflictDoNothing();
  }
  if (tipologias.length) {
    await db
      .insert(schema.oportunidadTipologia)
      .values(tipologias.map((tipologia) => ({ organizationId, oportunidadId, tipologia })))
      .onConflictDoNothing();
  }
}

/** Reemplaza el interés (lo que hace una persona desde el panel o el formulario). */
export async function reemplazarInteres(
  organizationId: string,
  oportunidadId: string,
  cambios: { edificioIds?: readonly string[]; tipologias?: readonly Tipologia[] }
): Promise<void> {
  const db = getDb();
  if (cambios.edificioIds) {
    await db
      .delete(schema.oportunidadEdificio)
      .where(
        scoped(
          schema.oportunidadEdificio.organizationId,
          organizationId,
          eq(schema.oportunidadEdificio.oportunidadId, oportunidadId)
        )
      );
    await sumarInteres(organizationId, oportunidadId, cambios.edificioIds, []);
  }
  if (cambios.tipologias) {
    await db
      .delete(schema.oportunidadTipologia)
      .where(
        scoped(
          schema.oportunidadTipologia.organizationId,
          organizationId,
          eq(schema.oportunidadTipologia.oportunidadId, oportunidadId)
        )
      );
    await sumarInteres(organizationId, oportunidadId, [], cambios.tipologias);
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
  tipologias?: readonly Tipologia[];
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
    tipologias: input.tipologias,
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
    const tipo = normalizarTipoContacto(ficha[CLAVES_FICHA_WAR.tipo]);
    if (tipo) await clasificarContacto({ organizationId, contactId, tipo, fuente: "ia" });

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
      await sumarInteres(organizationId, abierta.id, edificios, tipologias);
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
  const contacto = await contactoDe(organizationId, contactId);
  if (!contacto || contacto.tipoContacto !== "lead") return null;
  const abierta = await oportunidadAbierta(organizationId, contactId);
  if (!abierta) return null;
  return {
    id: abierta.id,
    stageName: etiqueta(ESTADOS_OPORTUNIDAD, abierta.estado),
    nextStages: siguientesParaLaIA(abierta.estado).map((e) => ({
      id: e,
      name: etiqueta(ESTADOS_OPORTUNIDAD, e),
    })),
  };
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

function listaParaElModelo(estados: readonly EstadoOportunidad[]): string {
  return estados.length
    ? `Puedes moverla a: ${estados.map((e) => etiqueta(ESTADOS_OPORTUNIDAD, e)).join(", ")}.`
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

  const siguientes = siguientesParaLaIA(abierta.estado);
  const destino = resolverEstadoOportunidad(input.stage);
  if (!destino) {
    return {
      ok: false,
      status: 422,
      code: "etapa_desconocida",
      message: `No existe la etapa «${input.stage.trim()}». ${listaParaElModelo(siguientes)}`,
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
      message: `No puedes mover la oportunidad a «${etiqueta(ESTADOS_OPORTUNIDAD, destino)}». ${listaParaElModelo(siguientes)}`,
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
    lead: { id: abierta.id, stageName: etiqueta(ESTADOS_OPORTUNIDAD, destino) },
    conversationId: conv.id,
  };
}
