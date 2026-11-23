import { sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { armarVisitas, type EstadoCita, type FilaVisita, type VisitasDto } from "@/lib/visitas-resultados";
import { condicionOportunidad, type FiltrosAnalytics } from "@/server/analytics/filtros";
import type { ResolvedPeriod } from "@/server/analytics/period";
import { nombreDelAgente } from "@/server/responsables";

/**
 * Resultados — sección Visitas: las citas (`booking`, kind session) con fecha
 * en el período. Cada cita se ata a la oportunidad de su contacto (la de
 * última interacción más reciente); los filtros de la barra y la visibilidad
 * por rol se aplican sobre esa oportunidad.
 */
export async function visitasDelPeriodo(
  organizationId: string,
  userId: string,
  admin: boolean,
  period: ResolvedPeriod,
  filtros: FiltrosAnalytics
): Promise<VisitasDto> {
  const b = schema.booking;
  const o = schema.oportunidad;
  const condicion = condicionOportunidad(organizationId, userId, filtros, sql`o.id`);
  const soloMias = admin ? undefined : sql`o.responsable_user_id = ${userId}`;
  const exigirOp = Boolean(condicion || soloMias);
  const filas = (await getDb().execute(sql`
    select b.id, to_char(b.scheduled_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as at,
      to_char((b.scheduled_at at time zone 'UTC') at time zone ${period.timezone}, 'YYYY-MM-DD') as dia,
      b.status, b.source, b.notes,
      op.id as op_id, op.nombre as op_nombre, op.tipo as op_tipo, op.estado as op_estado,
      op.responsable as op_responsable, op.edificio as op_edificio, op.color as op_color,
      op.unidad as op_unidad, op.ambientes as op_ambientes
    from ${b} b
    left join lateral (
      select o.id, o.nombre, o.tipo, o.estado, u.name as responsable, e.nombre as edificio, e.color, d.unidad,
        (select array_agg(a.ambientes order by a.ambientes) from ${schema.oportunidadAmbiente} a
          where a.organization_id = ${organizationId} and a.oportunidad_id = o.id) as ambientes
      from ${o} o
      left join "user" u on u.id = o.responsable_user_id
      left join ${schema.edificio} e on e.id = coalesce(o.edificio_id, (
        select oe.edificio_id from ${schema.oportunidadEdificio} oe
        where oe.organization_id = ${organizationId} and oe.oportunidad_id = o.id limit 1
      ))
      left join ${schema.departamento} d on d.id = o.departamento_id
      where o.organization_id = ${organizationId} and o.contact_id = b.contact_id
        ${condicion ? sql`and ${condicion}` : sql``}
        ${soloMias ? sql`and ${soloMias}` : sql``}
      order by o.ultima_interaccion desc
      limit 1
    ) op on true
    where b.organization_id = ${organizationId}
      and b.kind = 'session'
      and b.is_test = false
      and b.scheduled_at >= ${period.start.toISOString()}::timestamp
      and b.scheduled_at < ${period.end.toISOString()}::timestamp
      ${exigirOp ? sql`and op.id is not null` : sql``}
    order by b.scheduled_at desc
    limit 5000
  `)) as unknown as Record<string, unknown>[];

  const visitas: FilaVisita[] = filas.map((f) => ({
    id: String(f.id),
    at: String(f.at),
    dia: String(f.dia),
    status: String(f.status) as EstadoCita,
    source: f.source === "ai" ? "ai" : "manual",
    notas: (f.notes as string | null) ?? null,
    oportunidad: f.op_id
      ? {
          id: String(f.op_id),
          nombre: String(f.op_nombre ?? ""),
          tipo: (f.op_tipo as string | null) ?? null,
          estado: String(f.op_estado),
          responsable: (f.op_responsable as string | null) ?? null,
          edificio: (f.op_edificio as string | null) ?? null,
          color: (f.op_color as string | null) ?? null,
          unidad: (f.op_unidad as string | null) ?? null,
          ambientes: Array.isArray(f.op_ambientes) ? (f.op_ambientes as number[]).map(Number) : [],
        }
      : null,
  }));
  return armarVisitas(visitas, period.dto.from, period.dto.to, await nombreDelAgente(organizationId));
}
