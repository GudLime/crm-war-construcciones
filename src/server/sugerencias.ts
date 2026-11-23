import { and, desc, eq, isNotNull, ne, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { sugerencias, type Cita, type Sugerencia } from "@/lib/sugerencias";
import { todayInTz, zonedWallClockToUtc } from "@/lib/time/slots";
import { businessTimezone } from "@/server/analytics/period";
import { listarPlantillas } from "@/server/plantillas-tareas";

/**
 * 0059 — Tareas sugeridas en el detalle de la oportunidad: arma el contexto
 * (etapa, mensajes, citas, tareas abiertas, descartes) y llama a la función
 * pura. Crear y descartar las elige el vendedor; nada se crea solo.
 */

export type SugerenciasDto = {
  estado: string;
  sugerencias: Sugerencia[];
  /** Cuántas hay descartadas en esta etapa (para «mostrar»). */
  descartadas: { plantillaId: string; titulo: string }[];
};

/** La hora a la que vence una tarea sugerida. */
const HORA = "10:00";

async function contexto(organizationId: string, oportunidadId: string) {
  const db = getDb();
  const op = schema.oportunidad;
  const [o] = await db
    .select({
      estado: op.estado,
      responsableUserId: op.responsableUserId,
      primerContactoAt: op.primerContactoAt,
      origen: op.origen,
      contactId: op.contactId,
      contacto: schema.contact.name,
      vendedor: schema.user.name,
      edificio: sql<string | null>`(
        select e.nombre from ${schema.edificio} e
        where e.id = coalesce(${op.edificioId}, (
          select oe.edificio_id from ${schema.oportunidadEdificio} oe
          where oe.organization_id = ${organizationId} and oe.oportunidad_id = ${op.id} limit 1
        ))
      )`,
      unidad: sql<string | null>`(select d.unidad from ${schema.departamento} d where d.id = ${op.departamentoId})`,
    })
    .from(op)
    .leftJoin(schema.contact, eq(schema.contact.id, op.contactId))
    .leftJoin(schema.user, eq(schema.user.id, op.responsableUserId))
    .where(scoped(op.organizationId, organizationId, eq(op.id, oportunidadId)))
    .limit(1);
  if (!o) return null;

  const [mensajes, citas, abiertas, descartes, tz, llamadas] = await Promise.all([
    o.contactId
      ? db
          .select({
            entrante: sql<string | null>`to_char(max(${schema.message.createdAt}) filter (where ${schema.message.direction} = 'in'), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`,
            saliente: sql<string | null>`to_char(max(${schema.message.createdAt}) filter (where ${schema.message.direction} = 'out'), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`,
          })
          .from(schema.message)
          .innerJoin(schema.conversation, eq(schema.conversation.id, schema.message.conversationId))
          .where(
            scoped(
              schema.conversation.organizationId,
              organizationId,
              eq(schema.conversation.contactId, o.contactId),
              eq(schema.conversation.isTest, false)
            )
          )
      : Promise.resolve([]),
    o.contactId
      ? db
          .select({ at: schema.booking.scheduledAt, status: schema.booking.status })
          .from(schema.booking)
          .where(
            scoped(
              schema.booking.organizationId,
              organizationId,
              eq(schema.booking.contactId, o.contactId),
              eq(schema.booking.kind, "session"),
              eq(schema.booking.isTest, false),
              ne(schema.booking.status, "cancelada")
            )
          )
          .orderBy(desc(schema.booking.scheduledAt))
          .limit(20)
      : Promise.resolve([]),
    db
      .select({ plantillaId: schema.tareaVenta.plantillaId })
      .from(schema.tareaVenta)
      .where(
        scoped(
          schema.tareaVenta.organizationId,
          organizationId,
          eq(schema.tareaVenta.oportunidadId, oportunidadId),
          isNotNull(schema.tareaVenta.plantillaId),
          ne(schema.tareaVenta.estado, "listo")
        )
      ),
    db
      .select({ plantillaId: schema.sugerenciaDescartada.plantillaId, estado: schema.sugerenciaDescartada.estado })
      .from(schema.sugerenciaDescartada)
      .where(
        scoped(
          schema.sugerenciaDescartada.organizationId,
          organizationId,
          eq(schema.sugerenciaDescartada.oportunidadId, oportunidadId)
        )
      ),
    businessTimezone(organizationId),
    // 0061 — La última llamada ya marcada (atendida o no).
    db
      .select({ estado: schema.tareaVenta.estado, at: schema.tareaVenta.updatedAt })
      .from(schema.tareaVenta)
      .where(
        scoped(
          schema.tareaVenta.organizationId,
          organizationId,
          eq(schema.tareaVenta.oportunidadId, oportunidadId),
          eq(schema.tareaVenta.tipo, "llamada"),
          ne(schema.tareaVenta.estado, "realizar")
        )
      )
      .orderBy(desc(schema.tareaVenta.updatedAt))
      .limit(1),
  ]);

  const ahora = new Date();
  const fmtDia = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", timeZone: tz });
  const fmtHora = new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: tz });
  return {
    o,
    tz,
    descartes,
    ctx: {
      hoy: todayInTz(ahora, tz),
      ahora: ahora.toISOString(),
      oportunidad: {
        estado: o.estado,
        responsableId: o.responsableUserId,
        primerContactoAt: o.primerContactoAt?.toISOString() ?? null,
        origen: o.origen,
      },
      ultimaLlamada: llamadas[0]
        ? { estado: llamadas[0].estado as "listo" | "no_responde", at: llamadas[0].at.toISOString() }
        : null,
      datos: { nombre: o.contacto, vendedor: o.vendedor, edificio: o.edificio, unidad: o.unidad },
      ultimoEntranteAt: mensajes[0]?.entrante ?? null,
      ultimoSalienteAt: mensajes[0]?.saliente ?? null,
      citas: citas.map((c) => ({ at: c.at.toISOString(), status: c.status as Cita["status"] })),
      plantillasConTareaAbierta: abiertas.map((a) => a.plantillaId!).filter(Boolean),
      descartadas: descartes,
      formatearFecha: (iso: string) => ({ dia: fmtDia.format(new Date(iso)), hora: fmtHora.format(new Date(iso)) }),
    },
  };
}

export async function sugerenciasDeOportunidad(organizationId: string, oportunidadId: string): Promise<SugerenciasDto | null> {
  const [c, plantillas] = await Promise.all([contexto(organizationId, oportunidadId), listarPlantillas(organizationId)]);
  if (!c) return null;
  const nombres = new Map(plantillas.map((p) => [p.id, p.nombre]));
  return {
    estado: c.o.estado,
    sugerencias: sugerencias(plantillas, c.ctx),
    descartadas: c.descartes
      .filter((d) => d.estado === c.o.estado && nombres.has(d.plantillaId))
      .map((d) => ({ plantillaId: d.plantillaId, titulo: nombres.get(d.plantillaId)! })),
  };
}

export class SugerenciaError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
  }
}

/**
 * Crear la tarea de una sugerencia, en un paso: con la fecha calculada (a las
 * 10:00 en la zona del negocio), el mensaje como comentario y a cargo del
 * responsable de la oportunidad (o de quien la crea).
 */
export async function crearDesdeSugerencia(
  organizationId: string,
  oportunidadId: string,
  plantillaId: string,
  userId: string
): Promise<{ tareaId: string; titulo: string; vence: string }> {
  const [c, plantillas] = await Promise.all([contexto(organizationId, oportunidadId), listarPlantillas(organizationId)]);
  if (!c) throw new SugerenciaError(404, "not_found", "Esa oportunidad no existe");
  const s = sugerencias(plantillas, c.ctx, 100).find((x) => x.plantillaId === plantillaId);
  if (!s) throw new SugerenciaError(409, "ya_no_aplica", "Esa sugerencia ya no aplica");
  const fecha = zonedWallClockToUtc(s.vence, HORA, c.tz) ?? new Date();
  const id = newId("tareaVenta");
  await getDb()
    .insert(schema.tareaVenta)
    .values({
      id,
      organizationId,
      titulo: s.titulo,
      tipo: s.tipo as typeof schema.tareaVenta.$inferInsert.tipo,
      estado: "realizar",
      fecha,
      comentarios: s.mensaje,
      contactId: c.o.contactId,
      oportunidadId,
      responsableUserId: c.o.responsableUserId ?? userId,
      plantillaId,
    });
  return { tareaId: id, titulo: s.titulo, vence: s.vence };
}

/** Descartar: se oculta mientras la oportunidad siga en esta etapa. */
export async function descartarSugerencia(
  organizationId: string,
  oportunidadId: string,
  plantillaId: string,
  userId: string
): Promise<void> {
  const [o] = await getDb()
    .select({ estado: schema.oportunidad.estado })
    .from(schema.oportunidad)
    .where(scoped(schema.oportunidad.organizationId, organizationId, eq(schema.oportunidad.id, oportunidadId)))
    .limit(1);
  if (!o) throw new SugerenciaError(404, "not_found", "Esa oportunidad no existe");
  await getDb()
    .insert(schema.sugerenciaDescartada)
    .values({ organizationId, oportunidadId, plantillaId, estado: o.estado, userId })
    .onConflictDoUpdate({
      target: [schema.sugerenciaDescartada.oportunidadId, schema.sugerenciaDescartada.plantillaId],
      set: { estado: o.estado, userId, at: new Date() },
    });
}

/** Volver a mostrar una descartada. */
export async function restaurarSugerencia(organizationId: string, oportunidadId: string, plantillaId: string): Promise<void> {
  await getDb()
    .delete(schema.sugerenciaDescartada)
    .where(
      and(
        eq(schema.sugerenciaDescartada.organizationId, organizationId),
        eq(schema.sugerenciaDescartada.oportunidadId, oportunidadId),
        eq(schema.sugerenciaDescartada.plantillaId, plantillaId)
      )
    );
}
