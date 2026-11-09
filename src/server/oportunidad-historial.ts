import { and, desc, eq, gte, inArray, isNull, lt, lte, or } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { ESTADOS_ABIERTOS, estaAbierta, type EstadoOportunidad } from "@/lib/ventas";
import {
  AJUSTES_VENTAS_POR_DEFECTO,
  MOTIVO_SIN_RESPUESTA,
  intentosTrasUnIntento,
  resultadoDeCierre,
  type AjustesVentas,
} from "@/lib/ventas-ajustes";
import { aplicarReglasDeEtapa } from "@/server/motor/oportunidad";

/**
 * War — La única puerta por la que cambia el estado de una oportunidad, y lo
 * que registra su historial (`oportunidad_evento`).
 *
 * Todo cambio de estado —de una persona, de Mateo, de Make o del cierre por
 * silencio— pasa por `cambiarEstadoOportunidad`, que además de cambiarlo deja
 * el evento con la foto del momento y cuánto estuvo en el estado anterior.
 * Así el historial sirve para estadísticas sin depender de quién lo movió.
 *
 * También lleva la cuenta de «sin respuesta»: cada tanda de mensajes nuestros
 * es un intento (`registrarIntento`) y cada mensaje de la persona la pone en
 * cero (`registrarRespuesta`).
 *
 * Nada de esto frena la operación: registrar un evento nunca lanza.
 */

type FilaOportunidad = typeof schema.oportunidad.$inferSelect;
type TipoEvento = (typeof schema.oportunidadEvento.$inferInsert)["tipo"];

export type Actor = {
  fuente: "persona" | "ia" | "make" | "sistema" | "migracion";
  userId?: string | null;
};

const ABIERTOS = ESTADOS_ABIERTOS as EstadoOportunidad[];

/* ------------------------------------------------------------------
 * Ajustes → Ventas
 * ------------------------------------------------------------------ */

export async function leerAjustesVentas(organizationId: string): Promise<AjustesVentas> {
  const [fila] = await getDb()
    .select()
    .from(schema.ventasAjustes)
    .where(eq(schema.ventasAjustes.organizationId, organizationId))
    .limit(1);
  if (!fila) return { ...AJUSTES_VENTAS_POR_DEFECTO };
  return {
    sinRespuestaIntentos: fila.sinRespuestaIntentos,
    sinRespuestaDias: fila.sinRespuestaDias,
    sinRespuestaModo: fila.sinRespuestaModo,
    reaperturaDias: fila.reaperturaDias,
    iaConversacionesNuevas: fila.iaConversacionesNuevas,
  };
}

export async function guardarAjustesVentas(
  organizationId: string,
  ajustes: AjustesVentas
): Promise<AjustesVentas> {
  await getDb()
    .insert(schema.ventasAjustes)
    .values({ organizationId, ...ajustes, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.ventasAjustes.organizationId,
      set: { ...ajustes, updatedAt: new Date() },
    });
  return ajustes;
}

/* ------------------------------------------------------------------
 * Eventos
 * ------------------------------------------------------------------ */

export async function registrarEvento(input: {
  organizationId: string;
  op: FilaOportunidad;
  tipo: TipoEvento;
  actor: Actor;
  at?: Date;
  estadoDesde?: string | null;
  estadoHasta?: string | null;
  motivo?: string | null;
  segundosEnEstadoAnterior?: number | null;
  intentosSinRespuesta?: number | null;
  datos?: Record<string, unknown> | null;
}): Promise<void> {
  const { op } = input;
  try {
    await getDb()
      .insert(schema.oportunidadEvento)
      .values({
        id: newId("oportunidadEvento"),
        organizationId: input.organizationId,
        oportunidadId: op.id,
        contactId: op.contactId,
        tipo: input.tipo,
        estadoDesde: input.estadoDesde ?? null,
        estadoHasta: input.estadoHasta ?? null,
        resultado:
          input.tipo === "cerrada" && input.estadoHasta
            ? resultadoDeCierre(input.estadoHasta as EstadoOportunidad)
            : null,
        motivo: input.motivo ?? null,
        segundosEnEstadoAnterior: input.segundosEnEstadoAnterior ?? null,
        intentosSinRespuesta: input.intentosSinRespuesta ?? null,
        origen: op.origen,
        edificioId: op.edificioId,
        tipoOportunidad: op.tipo,
        fuente: input.actor.fuente,
        actorUserId: input.actor.fuente === "persona" ? (input.actor.userId ?? null) : null,
        datos: input.datos ?? null,
        occurredAt: input.at ?? new Date(),
      });
  } catch (err) {
    console.error(
      `[historial] no se pudo registrar «${input.tipo}» de ${op.id}:`,
      err instanceof Error ? err.message : err
    );
  }
}

/** Se abrió una oportunidad: su primer evento. */
export async function registrarCreada(
  organizationId: string,
  op: FilaOportunidad,
  actor: Actor,
  datos?: Record<string, unknown>
): Promise<void> {
  await registrarEvento({
    organizationId,
    op,
    tipo: "creada",
    actor,
    at: op.createdAt,
    estadoHasta: op.estado,
    datos: datos ?? null,
  });
}

function segundosEntre(desde: Date, hasta: Date): number {
  return Math.max(0, Math.round((hasta.getTime() - desde.getTime()) / 1000));
}

/**
 * Cambia el estado y deja el evento. Devuelve la fila nueva (o la misma si
 * no cambió nada), `null` si no existe.
 *
 * - Abierta → cerrada (o de un cierre a otro): `cerrada`, con resultado,
 *   motivo y los intentos sin respuesta de ese momento.
 * - Cerrada → abierta: `reabierta`; se borran el motivo y la cuenta de
 *   silencio.
 * - Entre abiertas: `estado`.
 */
export async function cambiarEstadoOportunidad(input: {
  organizationId: string;
  oportunidadId: string;
  destino: EstadoOportunidad;
  /** `undefined` = no tocar; al cerrar sin motivo queda el que tenía. */
  motivoCierre?: string | null;
  actor: Actor;
  at?: Date;
}): Promise<FilaOportunidad | null> {
  const db = getDb();
  const at = input.at ?? new Date();
  const [op] = await db
    .select()
    .from(schema.oportunidad)
    .where(
      scoped(
        schema.oportunidad.organizationId,
        input.organizationId,
        eq(schema.oportunidad.id, input.oportunidadId)
      )
    )
    .limit(1);
  if (!op) return null;

  if (op.estado === input.destino) {
    if (input.motivoCierre === undefined || input.motivoCierre === op.motivoCierre) return op;
    const [fila] = await db
      .update(schema.oportunidad)
      .set({ motivoCierre: input.motivoCierre, updatedAt: new Date() })
      .where(eq(schema.oportunidad.id, op.id))
      .returning();
    return fila ?? op;
  }

  const abiertaAntes = estaAbierta(op.estado);
  const abiertaDespues = estaAbierta(input.destino);
  const tipo: TipoEvento = !abiertaDespues ? "cerrada" : !abiertaAntes ? "reabierta" : "estado";

  const set: Partial<FilaOportunidad> = {
    estado: input.destino,
    estadoDesde: at,
    updatedAt: new Date(),
  };
  if (tipo === "cerrada") {
    set.cerradaAt = at;
    set.motivoCierre = input.motivoCierre === undefined ? op.motivoCierre : input.motivoCierre;
  } else if (tipo === "reabierta") {
    set.cerradaAt = null;
    set.motivoCierre = null;
    set.intentosSinRespuesta = 0;
  } else if (input.motivoCierre !== undefined) {
    set.motivoCierre = input.motivoCierre;
  }

  const [fila] = await db
    .update(schema.oportunidad)
    .set(set)
    .where(eq(schema.oportunidad.id, op.id))
    .returning();
  if (!fila) return null;

  await registrarEvento({
    organizationId: input.organizationId,
    op: fila,
    tipo,
    actor: input.actor,
    at,
    estadoDesde: op.estado,
    estadoHasta: input.destino,
    motivo: tipo === "cerrada" ? (set.motivoCierre ?? null) : null,
    segundosEnEstadoAnterior: segundosEntre(op.estadoDesde, at),
    intentosSinRespuesta: tipo === "cerrada" ? op.intentosSinRespuesta : null,
  });
  // 070 — Reglas de etapa del motor (Reservó → la unidad, Reservado). Con un
  // solo vinculado se aplica sola; con varios, la pantalla pregunta. Sin
  // configuración del cliente no hace nada; nunca lanza.
  await aplicarReglasDeEtapa({
    organizationId: input.organizationId,
    oportunidadId: fila.id,
    etapa: input.destino,
    actor:
      input.actor.fuente === "persona"
        ? { tipo: "usuario", id: input.actor.userId ?? null }
        : input.actor.fuente === "ia"
          ? { tipo: "agente" }
          : { tipo: "sistema" },
  });
  return fila;
}

/* ------------------------------------------------------------------
 * «Sin respuesta»: intentos y respuestas
 * ------------------------------------------------------------------ */

async function abiertasDe(organizationId: string, contactId: string): Promise<FilaOportunidad[]> {
  return getDb()
    .select()
    .from(schema.oportunidad)
    .where(
      scoped(
        schema.oportunidad.organizationId,
        organizationId,
        eq(schema.oportunidad.contactId, contactId),
        inArray(schema.oportunidad.estado, ABIERTOS)
      )
    );
}

/**
 * Le escribimos (o llamamos) a la persona. Suma un intento en sus
 * oportunidades abiertas —los mensajes de una misma tanda cuentan uno— y
 * marca el primer contacto. Nunca lanza.
 */
export async function registrarIntento(input: {
  organizationId: string;
  contactId: string;
  at: Date;
  canal: string;
  fuente: Actor["fuente"];
  userId?: string | null;
}): Promise<void> {
  try {
    const db = getDb();
    for (const op of await abiertasDe(input.organizationId, input.contactId)) {
      const intentos = intentosTrasUnIntento(op, input.at);
      const primero = !op.primerContactoAt;
      const [fila] = await db
        .update(schema.oportunidad)
        .set({
          intentosSinRespuesta: intentos,
          ultimoIntentoAt: input.at,
          ...(primero ? { primerContactoAt: input.at } : {}),
        })
        .where(eq(schema.oportunidad.id, op.id))
        .returning();
      if (primero && fila) {
        await registrarEvento({
          organizationId: input.organizationId,
          op: fila,
          tipo: "primer_contacto",
          actor: { fuente: input.fuente, userId: input.userId ?? null },
          at: input.at,
          segundosEnEstadoAnterior: segundosEntre(op.createdAt, input.at),
          datos: { canal: input.canal },
        });
      }
    }
  } catch (err) {
    console.error("[historial] no se pudo registrar el intento:", err instanceof Error ? err.message : err);
  }
}

/** La persona escribió: el silencio vuelve a cero. Nunca lanza. */
export async function registrarRespuesta(input: {
  organizationId: string;
  contactId: string;
  at: Date;
}): Promise<void> {
  try {
    const db = getDb();
    for (const op of await abiertasDe(input.organizationId, input.contactId)) {
      const primera = !op.primeraRespuestaAt;
      const [fila] = await db
        .update(schema.oportunidad)
        .set({
          intentosSinRespuesta: 0,
          ultimaRespuestaAt: input.at,
          ...(primera ? { primeraRespuestaAt: input.at } : {}),
        })
        .where(eq(schema.oportunidad.id, op.id))
        .returning();
      if (primera && fila) {
        await registrarEvento({
          organizationId: input.organizationId,
          op: fila,
          tipo: "primera_respuesta",
          actor: { fuente: "sistema" },
          at: input.at,
          segundosEnEstadoAnterior: segundosEntre(op.primerContactoAt ?? op.createdAt, input.at),
          intentosSinRespuesta: op.intentosSinRespuesta,
        });
      }
    }
  } catch (err) {
    console.error("[historial] no se pudo registrar la respuesta:", err instanceof Error ? err.message : err);
  }
}

/** Un saliente por WhatsApp (de Mateo, del equipo, una plantilla o el teléfono). */
export async function registrarSaliente(input: {
  organizationId: string;
  conversationId: string;
  at: Date;
  origen: "ai" | "operator" | "manual" | "template";
}): Promise<void> {
  try {
    const [conv] = await getDb()
      .select({ contactId: schema.conversation.contactId, isTest: schema.conversation.isTest })
      .from(schema.conversation)
      .where(eq(schema.conversation.id, input.conversationId))
      .limit(1);
    if (!conv || conv.isTest) return;
    await registrarIntento({
      organizationId: input.organizationId,
      contactId: conv.contactId,
      at: input.at,
      canal: "whatsapp",
      fuente: input.origen === "ai" ? "ia" : "persona",
    });
  } catch (err) {
    console.error("[historial] saliente sin registrar:", err instanceof Error ? err.message : err);
  }
}

/* ------------------------------------------------------------------
 * Reapertura y cierre por silencio
 * ------------------------------------------------------------------ */

/** La última oportunidad cerrada del contacto, y el estado que tenía antes del cierre. */
export async function ultimaCerrada(
  organizationId: string,
  contactId: string
): Promise<{ op: FilaOportunidad; estadoPrevio: EstadoOportunidad } | null> {
  const db = getDb();
  const [op] = await db
    .select()
    .from(schema.oportunidad)
    .where(
      scoped(
        schema.oportunidad.organizationId,
        organizationId,
        eq(schema.oportunidad.contactId, contactId),
        eq(schema.oportunidad.estado, "perdido")
      )
    )
    .orderBy(desc(schema.oportunidad.cerradaAt), desc(schema.oportunidad.updatedAt))
    .limit(1);
  if (!op) return null;
  const [cierre] = await db
    .select({ estadoDesde: schema.oportunidadEvento.estadoDesde })
    .from(schema.oportunidadEvento)
    .where(
      and(
        eq(schema.oportunidadEvento.oportunidadId, op.id),
        eq(schema.oportunidadEvento.tipo, "cerrada")
      )
    )
    .orderBy(desc(schema.oportunidadEvento.occurredAt))
    .limit(1);
  const previo = cierre?.estadoDesde as EstadoOportunidad | null | undefined;
  return { op, estadoPrevio: previo && estaAbierta(previo) ? previo : "recibido" };
}

/**
 * Cierra como Perdido («No responde») las abiertas que cumplen el umbral de
 * Ajustes → Ventas. Solo en modo «cerrar»; en «sugerir» las muestra la
 * lista y las cierra una persona. Devuelve cuántas cerró.
 */
export async function cerrarPorSilencio(ahora: Date = new Date()): Promise<number> {
  const db = getDb();
  const orgs = await db.select({ id: schema.organization.id }).from(schema.organization);
  let cerradas = 0;
  for (const { id: organizationId } of orgs) {
    const ajustes = await leerAjustesVentas(organizationId);
    if (ajustes.sinRespuestaModo !== "cerrar") continue;
    const limite = new Date(ahora.getTime() - ajustes.sinRespuestaDias * 24 * 60 * 60 * 1000);
    const candidatas = await db
      .select({ id: schema.oportunidad.id })
      .from(schema.oportunidad)
      .where(
        and(
          eq(schema.oportunidad.organizationId, organizationId),
          inArray(schema.oportunidad.estado, ABIERTOS),
          gte(schema.oportunidad.intentosSinRespuesta, ajustes.sinRespuestaIntentos),
          lte(schema.oportunidad.ultimoIntentoAt, limite),
          or(
            isNull(schema.oportunidad.ultimaRespuestaAt),
            lt(schema.oportunidad.ultimaRespuestaAt, schema.oportunidad.ultimoIntentoAt)
          )
        )
      );
    for (const c of candidatas) {
      const fila = await cambiarEstadoOportunidad({
        organizationId,
        oportunidadId: c.id,
        destino: "perdido",
        motivoCierre: MOTIVO_SIN_RESPUESTA,
        actor: { fuente: "sistema" },
        at: ahora,
      });
      if (fila) cerradas++;
    }
  }
  return cerradas;
}

/* ------------------------------------------------------------------
 * El barrido (cada hora, dentro del proceso)
 * ------------------------------------------------------------------ */

const CADA_MS = 60 * 60 * 1000;
const g = globalThis as unknown as { __warSilencios?: { timer: NodeJS.Timeout | null; corriendo: boolean } };

function estadoBarrido() {
  if (!g.__warSilencios) g.__warSilencios = { timer: null, corriendo: false };
  return g.__warSilencios;
}

export async function barridoSilencios(): Promise<void> {
  const e = estadoBarrido();
  if (e.corriendo) return;
  e.corriendo = true;
  try {
    const n = await cerrarPorSilencio();
    if (n > 0) console.log(`[ventas] ${n} oportunidad(es) cerrada(s) por falta de respuesta`);
  } catch (err) {
    console.error("[ventas] el cierre por silencio falló:", err instanceof Error ? err.message : err);
  } finally {
    e.corriendo = false;
  }
}

export function iniciarBarridoSilencios(): void {
  const e = estadoBarrido();
  if (e.timer) return;
  e.timer = setInterval(() => void barridoSilencios(), CADA_MS);
  e.timer.unref?.();
  // La primera pasada, un rato después del arranque (las migraciones y el
  // resto del boot primero).
  setTimeout(() => void barridoSilencios(), 60_000).unref?.();
}
