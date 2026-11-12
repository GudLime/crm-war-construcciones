import { eq, isNotNull, or, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { apiError } from "@/lib/api";
import { esAdmin } from "@/lib/auth/roles";
import type { SessionContext } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";

/**
 * Visibilidad por rol (ver `lib/auth/roles.ts`). El admin ve todo; el
 * operador, lo que tiene asignado:
 *
 * - una **oportunidad** si es su responsable;
 * - un **contacto** (y sus chats, mensajes, notas y adjuntos) si alguna de
 *   sus oportunidades es suya;
 * - una **tarea** si es su responsable, o en solo lectura si es de tipo
 *   Visita;
 * - las **reuniones de Agenda**: todas, pero edita solo las de sus contactos.
 *
 * Todo filtro sale de acá: las listas usan las condiciones SQL y las rutas de
 * un registro, los `puede…`. Lo que no se puede ver responde 404, como si no
 * existiera.
 */

export type Alcance = { organizationId: string; userId: string; admin: boolean };

export function alcanceDe(s: SessionContext): Alcance {
  return { organizationId: s.organizationId, userId: s.userId, admin: esAdmin(s.role) };
}

/** Respuesta para lo que el operador no puede ver. */
export const noEncontrado = (que = "Eso") => apiError(404, "not_found", `${que} no existe`);
export const prohibido = (msg = "No tenés permiso para cambiar esto") => apiError(403, "forbidden", msg);

/** Oportunidades visibles: las suyas (operador) o todas (admin → sin condición). */
export function oportunidadVisible(a: Alcance): SQL | undefined {
  return a.admin ? undefined : eq(schema.oportunidad.responsableUserId, a.userId);
}

/** Contactos visibles: los que tienen alguna oportunidad suya. `col` = la columna con el id del contacto. */
export function contactoVisible(a: Alcance, col: AnyPgColumn): SQL | undefined {
  if (a.admin) return undefined;
  return sql`exists (
    select 1 from ${schema.oportunidad} o
    where o.organization_id = ${a.organizationId}
      and o.contact_id = ${col}
      and o.responsable_user_id = ${a.userId}
  )`;
}

/**
 * Filtro por responsable que puede pedir el admin en las listas (Bandeja):
 * «yo», «sin» (sin asignar) o el id de una persona, separados por coma. Un
 * operador siempre queda en lo suyo.
 */
export function contactoDeResponsables(a: Alcance, col: AnyPgColumn, pedido: string | null): SQL | undefined {
  if (!a.admin) return contactoVisible(a, col);
  const ids = (pedido ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  if (!ids.length || ids.includes("todos")) return undefined;
  const personas = ids.filter((x) => x !== "sin").map((x) => (x === "yo" ? a.userId : x));
  const partes: SQL[] = [];
  if (personas.length) {
    partes.push(sql`exists (
      select 1 from ${schema.oportunidad} o
      where o.organization_id = ${a.organizationId}
        and o.contact_id = ${col}
        and o.responsable_user_id in (${sql.join(
          personas.map((p) => sql`${p}`),
          sql`, `
        )})
    )`);
  }
  if (ids.includes("sin")) {
    partes.push(sql`not exists (
      select 1 from ${schema.oportunidad} o
      where o.organization_id = ${a.organizationId}
        and o.contact_id = ${col}
        and o.responsable_user_id is not null
    )`);
  }
  return partes.length === 1 ? partes[0] : sql`(${sql.join(partes, sql` or `)})`;
}

export async function puedeVerOportunidad(a: Alcance, oportunidadId: string): Promise<boolean> {
  if (a.admin) return true;
  const [f] = await getDb()
    .select({ id: schema.oportunidad.id })
    .from(schema.oportunidad)
    .where(
      scoped(
        schema.oportunidad.organizationId,
        a.organizationId,
        eq(schema.oportunidad.id, oportunidadId),
        eq(schema.oportunidad.responsableUserId, a.userId)
      )
    )
    .limit(1);
  return Boolean(f);
}

export async function puedeVerContacto(a: Alcance, contactId: string | null | undefined): Promise<boolean> {
  if (a.admin) return true;
  if (!contactId) return false;
  const [f] = await getDb()
    .select({ id: schema.oportunidad.id })
    .from(schema.oportunidad)
    .where(
      scoped(
        schema.oportunidad.organizationId,
        a.organizationId,
        eq(schema.oportunidad.contactId, contactId),
        eq(schema.oportunidad.responsableUserId, a.userId)
      )
    )
    .limit(1);
  return Boolean(f);
}

export async function contactoDeConversacion(organizationId: string, conversationId: string): Promise<string | null> {
  const [f] = await getDb()
    .select({ contactId: schema.conversation.contactId })
    .from(schema.conversation)
    .where(scoped(schema.conversation.organizationId, organizationId, eq(schema.conversation.id, conversationId)))
    .limit(1);
  return f?.contactId ?? null;
}

export async function puedeVerConversacion(a: Alcance, conversationId: string): Promise<boolean> {
  if (a.admin) return true;
  return puedeVerContacto(a, await contactoDeConversacion(a.organizationId, conversationId));
}

/** Tareas visibles: las suyas, más las visitas de todos (en lectura). */
export function tareaVisible(a: Alcance): SQL | undefined {
  if (a.admin) return undefined;
  return or(eq(schema.tareaVenta.responsableUserId, a.userId), eq(schema.tareaVenta.tipo, "visita"));
}

/** Una tarea: el operador la ve si es suya o si es una visita; la edita solo si es suya. */
export async function accesoATarea(a: Alcance, tareaId: string): Promise<"editar" | "leer" | null> {
  const [t] = await getDb()
    .select({ responsable: schema.tareaVenta.responsableUserId, tipo: schema.tareaVenta.tipo })
    .from(schema.tareaVenta)
    .where(scoped(schema.tareaVenta.organizationId, a.organizationId, eq(schema.tareaVenta.id, tareaId)))
    .limit(1);
  if (!t) return null;
  if (a.admin || t.responsable === a.userId) return "editar";
  return t.tipo === "visita" ? "leer" : null;
}

/** Una reunión de Agenda: todos la ven; la edita el admin o quien tiene el contacto. */
export async function puedeEditarReunion(a: Alcance, bookingId: string): Promise<boolean> {
  if (a.admin) return true;
  const [b] = await getDb()
    .select({ contactId: schema.booking.contactId })
    .from(schema.booking)
    .where(scoped(schema.booking.organizationId, a.organizationId, eq(schema.booking.id, bookingId)))
    .limit(1);
  return puedeVerContacto(a, b?.contactId ?? null);
}

/** Los contactos que ve un operador (para filtrar en memoria, p. ej. los eventos en vivo). */
export async function contactosVisibles(a: Alcance): Promise<Set<string> | null> {
  if (a.admin) return null;
  const filas = await getDb()
    .selectDistinct({ contactId: schema.oportunidad.contactId })
    .from(schema.oportunidad)
    .where(
      scoped(
        schema.oportunidad.organizationId,
        a.organizationId,
        eq(schema.oportunidad.responsableUserId, a.userId),
        isNotNull(schema.oportunidad.contactId)
      )
    );
  return new Set(filas.map((f) => f.contactId!).filter(Boolean));
}


/** El mensaje de origen de un reenvío: solo de una conversación que puede ver. */
export async function puedeVerMensaje(a: Alcance, messageId: string): Promise<boolean> {
  if (a.admin) return true;
  const [m] = await getDb()
    .select({ conversationId: schema.message.conversationId })
    .from(schema.message)
    .where(scoped(schema.message.organizationId, a.organizationId, eq(schema.message.id, messageId)))
    .limit(1);
  return m ? puedeVerConversacion(a, m.conversationId) : false;
}

/** Un adjunto: si viajó en un mensaje, solo si ve esa conversación. */
export async function puedeVerAdjunto(a: Alcance, assetId: string): Promise<boolean> {
  if (a.admin) return true;
  const filas = await getDb()
    .select({ conversationId: schema.message.conversationId })
    .from(schema.message)
    .where(scoped(schema.message.organizationId, a.organizationId, eq(schema.message.mediaAssetId, assetId)))
    .limit(5);
  if (!filas.length) return true;
  for (const f of filas) if (await puedeVerConversacion(a, f.conversationId)) return true;
  return false;
}

/**
 * Para los eventos en vivo (SSE): un filtro por suscriptor. El operador solo
 * recibe lo de las conversaciones de sus contactos (se refresca cada minuto,
 * por si le asignan una oportunidad) y nada del Laboratorio.
 */
export function filtroDeEventos(a: Alcance): (evento: { type: string; data: unknown }) => Promise<boolean> {
  if (a.admin) return async () => true;
  let contactos: Set<string> = new Set();
  let hasta = 0;
  const contactoDe = new Map<string, string | null>();
  const vigentes = async () => {
    if (Date.now() > hasta) {
      contactos = (await contactosVisibles(a)) ?? new Set();
      hasta = Date.now() + 60_000;
    }
    return contactos;
  };
  return async (evento) => {
    if (evento.type === "booking.updated") return true;
    if (evento.type === "lab.run") return false;
    const d = (evento.data ?? {}) as { conversationId?: string; contactId?: string; conversation?: { id?: string; contactId?: string; contact?: { id?: string } } };
    let contactId = d.contactId ?? d.conversation?.contactId ?? d.conversation?.contact?.id ?? null;
    const convId = d.conversationId ?? d.conversation?.id ?? null;
    if (!contactId && convId) {
      if (!contactoDe.has(convId)) contactoDe.set(convId, await contactoDeConversacion(a.organizationId, convId));
      contactId = contactoDe.get(convId) ?? null;
    }
    if (!contactId) return false;
    return (await vigentes()).has(contactId);
  };
}
