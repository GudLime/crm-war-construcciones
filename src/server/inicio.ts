import { and, asc, count, desc, eq, gte, inArray, isNull, lt, min, ne, or, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { ESTADOS_ABIERTOS_LISTA } from "@/lib/ventas";
import { motivoDeDerivacion, type DerivadaDto, type InicioContadores, type ItemDelDia } from "@/lib/inicio";
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

/**
 * Una derivación de la IA que nadie tomó: con handoff, la IA pausada, sin que
 * nadie la haya tomado y sin respuesta de una persona después del handoff.
 * Cuando el dueño contestó desde el teléfono no cuenta: ya la atendió.
 */
export function derivadaSinTomar(): SQL {
  const c = schema.conversation;
  return sql`(${c.handoffAt} is not null
    and ${c.aiEnabled} = false
    and ${c.isTest} = false
    and ${c.tomadaPorUserId} is null
    and coalesce(${c.handoffReason}, '') <> 'manual_reply'
    and not exists (
      select 1 from ${schema.message} m
      where m.conversation_id = ${c.id}
        and m.direction = 'out'
        and m.origin <> 'ai'
        and m.created_at > ${c.handoffAt}
    ))`;
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
        scoped(c.organizationId, organizationId, derivadaSinTomar())
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

/** Las derivaciones sin tomar, de todo el equipo, de la más vieja a la más nueva. */
export async function derivadasSinTomar(organizationId: string, limite = 5): Promise<DerivadaDto[]> {
  const c = schema.conversation;
  const filas = await getDb()
    .select({
      id: c.id,
      canal: c.channel,
      handoffAt: c.handoffAt,
      motivo: c.handoffReason,
      resumen: c.handoffResumen,
      contactoId: schema.contact.id,
      contacto: schema.contact.name,
      ultimoMensaje: sql<string | null>`(
        select m.text from ${schema.message} m
        where m.conversation_id = ${c.id} and m.direction = 'in'
        order by m.created_at desc limit 1
      )`,
      edificio: sql<{ nombre: string; color: string | null } | null>`(
        select json_build_object('nombre', e.nombre, 'color', e.color)
        from ${schema.oportunidad} o
        join ${schema.edificio} e on e.id = o.edificio_id
        where o.organization_id = ${organizationId}
          and o.contact_id = ${c.contactId}
          and o.estado in ('recibido','en_charlas','conoce_informacion','visito','reservo')
        order by o.ultima_interaccion desc limit 1
      )`,
    })
    .from(c)
    .innerJoin(schema.contact, eq(schema.contact.id, c.contactId))
    .where(scoped(c.organizationId, organizationId, derivadaSinTomar()))
    .orderBy(asc(c.handoffAt))
    .limit(limite);
  return filas.map((f) => ({
    conversationId: f.id,
    canal: f.canal,
    contacto: { id: f.contactoId, nombre: f.contacto },
    edificio: f.edificio ?? null,
    motivo: motivoDeDerivacion(f.motivo, f.resumen),
    ultimoMensaje: f.ultimoMensaje,
    esperaDesde: (f.handoffAt ?? new Date()).toISOString(),
  }));
}

export class TomarError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
  }
}

/**
 * Tomar una derivación: queda a cargo de quien la toca y sale de la lista de
 * los demás. Si la oportunidad abierta del contacto no tiene una persona a
 * cargo (nadie o la IA), también pasa a ser suya. Solo una persona gana: si
 * otra la tomó antes, 409.
 */
export async function tomarDerivada(
  organizationId: string,
  conversationId: string,
  userId: string
): Promise<{ conversationId: string; oportunidadId: string | null }> {
  const db = getDb();
  const c = schema.conversation;
  const ahora = new Date();
  const [tomada] = await db
    .update(c)
    .set({ tomadaPorUserId: userId, tomadaAt: ahora, updatedAt: ahora })
    .where(scoped(c.organizationId, organizationId, eq(c.id, conversationId), derivadaSinTomar()))
    .returning({ id: c.id, contactId: c.contactId });
  if (!tomada) {
    const [existe] = await db
      .select({ por: c.tomadaPorUserId })
      .from(c)
      .where(scoped(c.organizationId, organizationId, eq(c.id, conversationId)))
      .limit(1);
    if (!existe) throw new TomarError(404, "not_found", "Esa conversación no existe");
    if (existe.por === userId) return { conversationId, oportunidadId: null };
    throw new TomarError(409, "ya_tomada", "Otra persona ya la tomó, o ya no está derivada");
  }
  const op = schema.oportunidad;
  const [oportunidad] = await db
    .update(op)
    .set({ responsableUserId: userId, responsableIa: false, updatedAt: ahora })
    .where(
      and(
        eq(
          op.id,
          sql`(select o.id from ${op} o
            where o.organization_id = ${organizationId}
              and o.contact_id = ${tomada.contactId}
              and o.estado in ('recibido','en_charlas','conoce_informacion','visito','reservo')
            order by o.ultima_interaccion desc limit 1)`
        ),
        or(isNull(op.responsableUserId), eq(op.responsableIa, true))
      )
    )
    .returning({ id: op.id });
  return { conversationId, oportunidadId: oportunidad?.id ?? null };
}

/**
 * Tu día: las tareas para hacer (vencidas y de hoy) y las citas de hoy de
 * quien mira, por hora. Las vencidas primero.
 */
export async function tuDia(organizationId: string, userId: string, ahora = new Date()): Promise<ItemDelDia[]> {
  const db = getDb();
  const tz = await businessTimezone(organizationId);
  const hoy = todayInTz(ahora, tz);
  const inicioHoy = zonedWallClockToUtc(hoy, "00:00", tz) ?? ahora;
  const inicioManana = zonedWallClockToUtc(addDaysISO(hoy, 1), "00:00", tz) ?? ahora;
  const t = schema.tareaVenta;
  const b = schema.booking;
  const edificioDe = (contacto: typeof t.contactId | typeof b.contactId) => sql<string | null>`(
    select e.nombre from ${schema.oportunidad} o
    join ${schema.edificio} e on e.id = o.edificio_id
    where o.organization_id = ${organizationId} and o.contact_id = ${contacto}
    order by o.ultima_interaccion desc limit 1
  )`;
  const [tareas, citas] = await Promise.all([
    db
      .select({
        id: t.id,
        titulo: t.titulo,
        tipo: t.tipo,
        fecha: t.fecha,
        contacto: schema.contact.name,
        edificio: edificioDe(t.contactId),
      })
      .from(t)
      .leftJoin(schema.contact, eq(schema.contact.id, t.contactId))
      .where(
        scoped(t.organizationId, organizationId, eq(t.responsableUserId, userId), eq(t.estado, "realizar"), lt(t.fecha, inicioManana))
      )
      .orderBy(asc(t.fecha))
      .limit(30),
    db
      .select({ id: b.id, fecha: b.scheduledAt, contacto: schema.contact.name, edificio: edificioDe(b.contactId) })
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
      .orderBy(desc(b.scheduledAt))
      .limit(20),
  ]);
  const items: ItemDelDia[] = [
    ...tareas.map((x) => ({
      clase: "tarea" as const,
      id: x.id,
      at: x.fecha!.toISOString(),
      vencida: x.fecha!.getTime() < inicioHoy.getTime(),
      titulo: x.titulo,
      tipo: x.tipo,
      contacto: x.contacto,
      edificio: x.edificio,
    })),
    ...citas.map((x) => ({
      clase: "cita" as const,
      id: x.id,
      at: x.fecha.toISOString(),
      vencida: false,
      titulo: x.contacto ? `Visita con ${x.contacto}` : "Visita",
      tipo: "visita" as const,
      contacto: x.contacto,
      edificio: x.edificio,
    })),
  ];
  return items.sort((x, y) => Number(y.vencida) - Number(x.vencida) || x.at.localeCompare(y.at));
}

/** Marcar una tarea propia como hecha (Tu día). False si no es suya o no existe. */
export async function marcarTareaHecha(organizationId: string, tareaId: string, userId: string, admin: boolean): Promise<boolean> {
  const t = schema.tareaVenta;
  const [f] = await getDb()
    .update(t)
    .set({ estado: "listo", updatedAt: new Date() })
    .where(scoped(t.organizationId, organizationId, eq(t.id, tareaId), ...(admin ? [] : [eq(t.responsableUserId, userId)])))
    .returning({ id: t.id });
  return Boolean(f);
}
