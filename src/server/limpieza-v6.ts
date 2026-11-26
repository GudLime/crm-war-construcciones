import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";

/**
 * War v6 — TEMPORAL. Se borra apenas se usa.
 *
 * Al arrancar deja en el log (solo lectura):
 *   1. La zona horaria de la Agenda (v6-5).
 *   2. Lo de Constanza Mozzano y cuántos contactos tienen más de una
 *      oportunidad abierta, o están duplicados por teléfono (v6-1).
 *   3. La prueba en seco del borrado de lo pendiente que vino de Notion (v6-2).
 *
 * Borra SOLO con `WAR_V6_BORRAR_NOTION=si` (después del ok de Sebastián).
 *
 * Qué es «de Notion»: las tareas anotadas en `importacion_externa` (fuente
 * notion, tipo tarea), y las citas que salieron de esas tareas al pasarlas a la
 * Agenda. La conversión borra la tarea y crea la cita con
 * `confirmada_at = created_at de la tarea`, que es el `now()` de la
 * transacción de la importación: el mismo instante que el de su anotación en
 * `importacion_externa`. Una cita cuenta como de Notion solo si su
 * `confirmada_at` coincide exacto con una anotación de una tarea que ya no
 * existe; lo demás queda afuera.
 *
 * No se borra: lo creado el 26/11 (hora de Buenos Aires), las tareas en Listo o
 * No responde, ni las citas en Vino, No vino o canceladas. Las anotaciones de
 * `importacion_externa` quedan: así nada se vuelve a importar.
 */

const DESDE_HOY = "2026-11-26 03:00:00"; // 26/11 00:00 en Buenos Aires, en UTC

type Fila = Record<string, unknown>;
const filas = async (q: ReturnType<typeof sql>) => (await getDb().execute(q)) as unknown as Fila[];
const log = (titulo: string, datos: unknown) => console.log(`[v6] ${titulo}: ${JSON.stringify(datos)}`);

const tareasDeNotion = sql`
  select t.id, t.tipo, t.estado, t.fecha
  from tarea_venta t
  join importacion_externa ie
    on ie.organization_id = t.organization_id and ie.fuente = 'notion' and ie.tipo = 'tarea' and ie.crm_id = t.id
  where t.estado not in ('listo', 'no_responde')
    and t.created_at < ${DESDE_HOY}`;

const citasDeNotion = sql`
  select b.id, b.modo, b.status, b.scheduled_at
  from booking b
  where b.kind = 'session' and b.source = 'manual' and b.is_test = false
    and b.status = 'agendada'
    and b.confirmada_at < ${DESDE_HOY}
    and exists (
      select 1 from importacion_externa ie
      where ie.organization_id = b.organization_id and ie.fuente = 'notion' and ie.tipo = 'tarea'
        and ie.created_at = b.confirmada_at
        and not exists (select 1 from tarea_venta t where t.id = ie.crm_id)
    )`;

async function diagnostico(): Promise<void> {
  log("zona horaria", await filas(sql`select organization_id, timezone from calendar_settings`));

  const constanza = await filas(sql`
    select c.id as contacto, c.name, c.wa_identity, c.phone, c.created_at,
      (select json_agg(json_build_object('id', o.id, 'tipo', o.tipo, 'estado', o.estado, 'responsable', u.name,
         'ia', o.responsable_ia, 'origen', o.origen, 'creada', o.created_at,
         'notion', exists (select 1 from importacion_externa ie where ie.crm_id = o.id))
         order by o.created_at)
       from oportunidad o left join "user" u on u.id = o.responsable_user_id where o.contact_id = c.id) as oportunidades,
      (select json_agg(json_build_object('id', cv.id, 'tomada', cv.tomada_por_user_id)) from conversation cv where cv.contact_id = c.id) as chats
    from contact c
    where c.name ilike '%mozzano%'`);
  log("Constanza Mozzano", constanza);

  log(
    "contactos con más de una oportunidad abierta (por tipo)",
    await filas(sql`
      select tipo, count(*)::int as contactos, sum(n)::int as oportunidades
      from (
        select contact_id, tipo, count(*) as n from oportunidad
        where contact_id is not null and cerrada_at is null
        group by contact_id, tipo having count(*) > 1
      ) x group by tipo`)
  );
  log(
    "ejemplos (hasta 15)",
    await filas(sql`
      select c.name, o.tipo, json_agg(json_build_object('id', o.id, 'estado', o.estado, 'origen', o.origen,
        'creada', o.created_at, 'notion', exists (select 1 from importacion_externa ie where ie.crm_id = o.id)) order by o.created_at) as ops
      from oportunidad o join contact c on c.id = o.contact_id
      where o.cerrada_at is null
        and (o.contact_id, o.tipo) in (
          select contact_id, tipo from oportunidad where contact_id is not null and cerrada_at is null
          group by contact_id, tipo having count(*) > 1)
      group by c.name, o.contact_id, o.tipo
      limit 15`)
  );
  log(
    "contactos duplicados por teléfono",
    await filas(sql`
      select count(*)::int as telefonos, sum(n)::int as contactos from (
        select phone, count(*) as n from contact where phone is not null and phone <> ''
        group by organization_id, phone having count(*) > 1
      ) x`)
  );

  log(
    "prueba en seco — tareas pendientes de Notion a borrar",
    await filas(sql`
      select tipo, case when fecha is null then 'sin fecha' when fecha < now() at time zone 'UTC' then 'vencida' else 'futura' end as cuando,
        count(*)::int as n
      from (${tareasDeNotion}) x group by 1, 2 order by 1, 2`)
  );
  log(
    "prueba en seco — citas pendientes de Notion a borrar",
    await filas(sql`
      select modo, case when scheduled_at < now() at time zone 'UTC' then 'pasada' else 'futura' end as cuando, count(*)::int as n
      from (${citasDeNotion}) x group by 1, 2 order by 1, 2`)
  );
  log(
    "para comparar — citas convertidas que NO se pueden atribuir a Notion (quedan)",
    await filas(sql`
      select count(*)::int as n from booking b
      where b.kind = 'session' and b.source = 'manual' and b.status = 'agendada' and b.is_test = false
        and b.confirmada_at < ${DESDE_HOY}
        and b.id not in (select id from (${citasDeNotion}) y)`)
  );
}

async function borrar(): Promise<void> {
  await getDb().transaction(async (tx) => {
    const t = (await tx.execute(sql`delete from tarea_venta where id in (select id from (${tareasDeNotion}) x) returning id`)) as unknown as Fila[];
    const b = (await tx.execute(sql`delete from booking where id in (select id from (${citasDeNotion}) x) returning id`)) as unknown as Fila[];
    log("BORRADO", { tareas: t.length, citas: b.length });
  });
}

export async function limpiezaV6AlArrancar(): Promise<void> {
  try {
    await diagnostico();
    if (process.env.WAR_V6_BORRAR_NOTION === "si") await borrar();
  } catch (err) {
    console.error("[v6] falló el diagnóstico:", err instanceof Error ? err.message : err);
  }
}
