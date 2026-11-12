import { asc, count, eq, gte, inArray, isNotNull, isNull, lt, min, ne, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { ESTADOS_ABIERTOS_LISTA } from "@/lib/ventas";
import type { InicioContadores } from "@/lib/inicio";
import { addDaysISO, todayInTz, zonedWallClockToUtc } from "@/lib/time/slots";
import { businessTimezone } from "@/server/analytics/period";

/**
 * Inicio del vendedor — lo que tiene que atender hoy una persona. Cada número
 * es una consulta chica con conteo (nunca listas completas). Todo se calcula
 * para `userId`; las derivaciones de la IA son del equipo.
 */

/** Las oportunidades «abiertas» de la lista (Reservó ya cuenta como cerrada). */
const ABIERTAS = [...ESTADOS_ABIERTOS_LISTA];

/** Un contacto con alguna oportunidad de esta persona. */
function contactoDe(organizationId: string, userId: string, col: typeof schema.booking.contactId) {
  return sql`exists (
    select 1 from ${schema.oportunidad} o
    where o.organization_id = ${organizationId}
      and o.contact_id = ${col}
      and o.responsable_user_id = ${userId}
  )`;
}

export async function contadoresDeInicio(
  organizationId: string,
  userId: string,
  ahora = new Date()
): Promise<InicioContadores> {
  const db = getDb();
  const tz = await businessTimezone(organizationId);
  const hoy = todayInTz(ahora, tz);
  const inicioHoy = zonedWallClockToUtc(hoy, "00:00", tz) ?? ahora;
  const inicioManana = zonedWallClockToUtc(addDaysISO(hoy, 1), "00:00", tz) ?? ahora;
  const op = schema.oportunidad;
  const t = schema.tareaVenta;
  const b = schema.booking;
  const c = schema.conversation;

  const [nuevas, calientes, tareas, vencidas, citas, tareasVisita, derivadas] = await Promise.all([
    // Asignadas a mí y todavía sin primer contacto.
    db
      .select({ n: count() })
      .from(op)
      .where(
        scoped(op.organizationId, organizationId, eq(op.responsableUserId, userId), inArray(op.estado, ABIERTAS), isNull(op.primerContactoAt))
      ),
    // Ya visitaron y siguen abiertas.
    db
      .select({ n: count() })
      .from(op)
      .where(scoped(op.organizationId, organizationId, eq(op.responsableUserId, userId), eq(op.estado, "visito"))),
    // Tareas para hacer con fecha hasta hoy (incluye las vencidas).
    db
      .select({ n: count() })
      .from(t)
      .where(
        scoped(t.organizationId, organizationId, eq(t.responsableUserId, userId), eq(t.estado, "realizar"), lt(t.fecha, inicioManana))
      ),
    db
      .select({ n: count() })
      .from(t)
      .where(
        scoped(t.organizationId, organizationId, eq(t.responsableUserId, userId), eq(t.estado, "realizar"), lt(t.fecha, inicioHoy))
      ),
    // Citas de hoy de contactos con oportunidades mías.
    db
      .select({ id: b.id, at: b.scheduledAt, contacto: schema.contact.name })
      .from(b)
      .leftJoin(schema.contact, eq(schema.contact.id, b.contactId))
      .where(
        scoped(
          b.organizationId,
          organizationId,
          eq(b.kind, "session"),
          ne(b.status, "cancelada"),
          eq(b.isTest, false),
          gte(b.scheduledAt, inicioHoy),
          lt(b.scheduledAt, inicioManana),
          contactoDe(organizationId, userId, b.contactId)
        )
      )
      .orderBy(asc(b.scheduledAt)),
    // Mientras haya tareas de tipo Visita o Reunión, también cuentan.
    db
      .select({ id: t.id, at: t.fecha, contacto: schema.contact.name, titulo: t.titulo })
      .from(t)
      .leftJoin(schema.contact, eq(schema.contact.id, t.contactId))
      .where(
        scoped(
          t.organizationId,
          organizationId,
          eq(t.responsableUserId, userId),
          inArray(t.tipo, ["visita", "reunion"]),
          ne(t.estado, "listo"),
          gte(t.fecha, inicioHoy),
          lt(t.fecha, inicioManana)
        )
      )
      .orderBy(asc(t.fecha)),
    // Derivadas por la IA, de todo el equipo: sin IA y sin respuesta humana después.
    db
      .select({ n: count(), masVieja: min(c.handoffAt) })
      .from(c)
      .where(
        scoped(
          c.organizationId,
          organizationId,
          isNotNull(c.handoffAt),
          eq(c.aiEnabled, false),
          eq(c.isTest, false),
          sql`not exists (
            select 1 from ${schema.message} m
            where m.conversation_id = ${c.id}
              and m.direction = 'out'
              and m.origin <> 'ai'
              and m.created_at > ${c.handoffAt}
          )`
        )
      ),
  ]);

  const visitas = [
    ...citas.map((v) => ({ at: v.at, contacto: v.contacto })),
    ...tareasVisita.filter((v) => v.at).map((v) => ({ at: v.at!, contacto: v.contacto ?? v.titulo })),
  ].sort((x, y) => x.at.getTime() - y.at.getTime());
  const proxima = visitas.find((v) => v.at.getTime() >= ahora.getTime()) ?? null;
  const masVieja = derivadas[0]?.masVieja ?? null;

  return {
    hoy,
    zona: tz,
    nuevas: Number(nuevas[0]?.n ?? 0),
    tareasHoy: Number(tareas[0]?.n ?? 0),
    tareasVencidas: Number(vencidas[0]?.n ?? 0),
    visitasHoy: visitas.length,
    proximaVisita: proxima ? { at: proxima.at.toISOString(), contacto: proxima.contacto ?? null } : null,
    derivadas: Number(derivadas[0]?.n ?? 0),
    derivadaMasViejaAt: masVieja ? new Date(masVieja).toISOString() : null,
    calientes: Number(calientes[0]?.n ?? 0),
  };
}
