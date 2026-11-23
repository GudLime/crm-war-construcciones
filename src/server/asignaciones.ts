import { asc, eq, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import {
  cargaDe,
  configVendedoresSchema,
  HORAS_AUTOMATICAS,
  sugerir,
  TOPE_CARGA,
  vendedoresDeLaMesa,
  type AsignacionesDto,
  type AsignadaHoy,
  type Cambio,
  type ConfigVendedor,
  type EdificioCorto,
  type Miembro,
  type TarjetaAsignacion,
  type TarjetaAutomatica,
} from "@/lib/asignaciones";
import { ESTADOS_ABIERTOS } from "@/lib/ventas";
import { leerAsignacion } from "@/server/asignacion";
import { businessTimezone } from "@/server/analytics/period";
import { aplicarResponsable, nombreDelAgente } from "@/server/responsables";

/**
 * Asignaciones (solo admin, `claude/asignaciones.md`) — la mesa de reparto:
 * las abiertas sin nadie a cargo, las que asignó la regla en las últimas 24 h,
 * los vendedores con su carga y la sugerencia para cada tarjeta.
 */

export class AsignacionesError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
  }
}

type Fila = Record<string, unknown>;
const LIMITE_TARJETAS = 300;
const ISO = (col: SQL) => sql`to_char(${col}, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`;
const abiertas = sql.raw(`(${ESTADOS_ABIERTOS.map((e) => `'${e}'`).join(",")})`);

/** Medianoche de hoy en la zona del negocio, como instante UTC sin zona (como se guarda). */
const inicioDeHoy = (tz: string) => sql`(((date_trunc('day', now() at time zone ${tz})) at time zone ${tz}) at time zone 'UTC')`;

async function miembros(organizationId: string): Promise<Miembro[]> {
  return getDb()
    .select({ userId: schema.user.id, nombre: schema.user.name, role: schema.member.role })
    .from(schema.member)
    .innerJoin(schema.user, eq(schema.member.userId, schema.user.id))
    .where(scoped(schema.member.organizationId, organizationId));
}

export async function leerConfigVendedores(organizationId: string): Promise<ConfigVendedor[]> {
  const [fila] = await getDb()
    .select({ v: schema.ventasAjustes.asignacionVendedores })
    .from(schema.ventasAjustes)
    .where(eq(schema.ventasAjustes.organizationId, organizationId))
    .limit(1);
  const ok = configVendedoresSchema.safeParse(fila?.v ?? []);
  return ok.success ? ok.data : [];
}

/** Las columnas de una tarjeta, sobre la oportunidad `o`. */
function columnasTarjeta(organizationId: string) {
  return sql`
    o.id, o.nombre, o.tipo, o.origen, c.phone as telefono,
    ${ISO(sql`o.created_at`)} as creada,
    greatest(0, extract(epoch from ((now() at time zone 'UTC') - o.created_at)) / 60)::float as espera,
    (select array_agg(a.ambientes order by a.ambientes) from ${schema.oportunidadAmbiente} a
      where a.organization_id = ${organizationId} and a.oportunidad_id = o.id) as ambientes,
    array_remove(array[o.edificio_id] || coalesce((select array_agg(oe.edificio_id) from ${schema.oportunidadEdificio} oe
      where oe.organization_id = ${organizationId} and oe.oportunidad_id = o.id), '{}'), null) as edificio_ids,
    (select m.text from ${schema.message} m
      join ${schema.conversation} cv on cv.id = m.conversation_id
      where cv.organization_id = ${organizationId} and cv.contact_id = o.contact_id and cv.is_test = false
        and m.direction = 'in' and m.text is not null and m.text <> ''
      order by m.created_at desc limit 1) as ultimo`;
}

function tarjeta(f: Fila, edificios: Map<string, EdificioCorto>): TarjetaAsignacion & { edificioIds: string[] } {
  const edificioIds = Array.isArray(f.edificio_ids) ? (f.edificio_ids as string[]) : [];
  const primero = edificioIds.find((id) => edificios.has(id));
  const ultimo = typeof f.ultimo === "string" ? f.ultimo.replace(/\s+/g, " ").trim().slice(0, 160) : null;
  return {
    id: String(f.id),
    nombre: String(f.nombre ?? ""),
    tipo: (f.tipo as string | null) ?? null,
    edificio: primero ? edificios.get(primero)! : null,
    edificioIds,
    origen: (f.origen as string | null) ?? null,
    ambientes: Array.isArray(f.ambientes) ? (f.ambientes as unknown[]).map(Number) : [],
    telefono: (f.telefono as string | null) ?? null,
    ultimoMensaje: ultimo || null,
    creadaAt: String(f.creada),
    esperaMin: Math.round(Number(f.espera ?? 0)),
    sugerencia: null,
  };
}

const sinIds = <T extends { edificioIds: string[] }>({ edificioIds: _e, ...resto }: T) => resto;

export async function leerAsignaciones(organizationId: string, edificioId: string | null): Promise<AsignacionesDto> {
  const db = getDb();
  const tz = await businessTimezone(organizationId);
  const [listaEdificios, gente, config, regla] = await Promise.all([
    db
      .select({ id: schema.edificio.id, nombre: schema.edificio.nombre, color: schema.edificio.color })
      .from(schema.edificio)
      .where(scoped(schema.edificio.organizationId, organizationId))
      .orderBy(asc(schema.edificio.nombre)),
    miembros(organizationId),
    leerConfigVendedores(organizationId),
    leerAsignacion(organizationId),
  ]);
  const edificios = new Map(listaEdificios.map((e) => [e.id, e]));
  const delEdificio = (t: { edificioIds: string[] }) => !edificioId || t.edificioIds.includes(edificioId);

  const sinAsignarFilas = (await db.execute(sql`
    select ${columnasTarjeta(organizationId)}
    from ${schema.oportunidad} o
    left join ${schema.contact} c on c.id = o.contact_id
    where o.organization_id = ${organizationId}
      and o.responsable_user_id is null and o.responsable_ia = false
      and o.estado in ${abiertas}
    order by o.created_at asc
    limit ${LIMITE_TARJETAS}
  `)) as unknown as Fila[];

  const automaticasFilas = (await db.execute(sql`
    select * from (
      select distinct on (ev.oportunidad_id) ${columnasTarjeta(organizationId)},
        ev.datos, ${ISO(sql`ev.occurred_at`)} as asignada_at,
        o.responsable_user_id, o.responsable_ia, o.asignada_por, u.name as actual_nombre
      from ${schema.oportunidadEvento} ev
      join ${schema.oportunidad} o on o.id = ev.oportunidad_id and o.organization_id = ${organizationId}
      left join ${schema.contact} c on c.id = o.contact_id
      left join "user" u on u.id = o.responsable_user_id
      where ev.organization_id = ${organizationId}
        and ev.tipo = 'responsable' and ev.datos->>'como' = 'auto'
        and ev.occurred_at >= (now() at time zone 'UTC') - ${sql.raw(`interval '${HORAS_AUTOMATICAS} hours'`)}
      order by ev.oportunidad_id, ev.occurred_at desc
    ) t
    order by asignada_at desc
    limit ${LIMITE_TARJETAS}
  `)) as unknown as Fila[];

  const mesa = vendedoresDeLaMesa(gente, config).filter((v) => v.recibe);
  const ids = mesa.map((v) => v.userId);
  const enLista = ids.length ? sql.join(ids.map((id) => sql`${id}`), sql`, `) : sql`null`;

  const [cargas, visitas, hoy] = ids.length
    ? await Promise.all([
        db.execute(sql`
          select o.responsable_user_id as uid,
            count(*) filter (where o.estado in ${abiertas})::int as abiertas,
            count(*) filter (where o.estado in ${abiertas} and o.primer_contacto_at is null)::int as sin_contactar
          from ${schema.oportunidad} o
          where o.organization_id = ${organizationId} and o.responsable_user_id in (${enLista})
          group by 1
        `) as unknown as Promise<Fila[]>,
        db.execute(sql`
          select o.responsable_user_id as uid, count(distinct b.id)::int as n
          from ${schema.booking} b
          join ${schema.oportunidad} o on o.organization_id = b.organization_id and o.contact_id = b.contact_id
          where b.organization_id = ${organizationId} and b.kind = 'session' and b.is_test = false
            and b.status in ('agendada', 'realizada')
            and b.scheduled_at >= ${inicioDeHoy(tz)} and b.scheduled_at < ${inicioDeHoy(tz)} + interval '1 day'
            and o.responsable_user_id in (${enLista})
          group by 1
        `) as unknown as Promise<Fila[]>,
        db.execute(sql`
          select o.id, o.nombre, o.responsable_user_id as uid, o.asignada_por, ${ISO(sql`o.responsable_desde`)} as at,
            coalesce(o.edificio_id, (select oe.edificio_id from ${schema.oportunidadEdificio} oe
              where oe.organization_id = ${organizationId} and oe.oportunidad_id = o.id limit 1)) as edificio_id
          from ${schema.oportunidad} o
          where o.organization_id = ${organizationId} and o.responsable_user_id in (${enLista})
            and o.responsable_desde >= ${inicioDeHoy(tz)}
          order by o.responsable_desde desc
          limit 1000
        `) as unknown as Promise<Fila[]>,
      ])
    : [[], [], []];

  const porUid = <T>(filas: Fila[], f: (x: Fila) => T) => new Map(filas.map((x) => [String(x.uid), f(x)]));
  const carga = porUid(cargas, (x) => ({ abiertas: Number(x.abiertas), sinContactar: Number(x.sin_contactar) }));
  const visitasHoy = porUid(visitas, (x) => Number(x.n));
  const asignadas = new Map<string, AsignadaHoy[]>();
  for (const f of hoy) {
    const uid = String(f.uid);
    const lista = asignadas.get(uid) ?? [];
    lista.push({
      id: String(f.id),
      nombre: String(f.nombre ?? ""),
      edificio: f.edificio_id ? (edificios.get(String(f.edificio_id)) ?? null) : null,
      auto: f.asignada_por === "auto",
      at: String(f.at),
    });
    asignadas.set(uid, lista);
  }

  const vendedores = mesa.map((v) => {
    const c = carga.get(v.userId) ?? { abiertas: 0, sinContactar: 0 };
    return {
      userId: v.userId,
      nombre: v.nombre,
      tecla: v.tecla,
      abiertas: c.abiertas,
      sinContactar: c.sinContactar,
      visitasHoy: visitasHoy.get(v.userId) ?? 0,
      carga: cargaDe(c.abiertas),
      asignadasHoy: asignadas.get(v.userId) ?? [],
    };
  });

  const sinAsignar = sinAsignarFilas.map((f) => tarjeta(f, edificios)).filter(delEdificio);
  const sugerencias = sugerir(
    sinAsignar,
    vendedores,
    regla.porEdificio,
    (id) => edificios.get(id)?.nombre ?? null
  );
  for (const t of sinAsignar) t.sugerencia = sugerencias.get(t.id) ?? null;

  const agente = await nombreDelAgente(organizationId);
  const automaticas: TarjetaAutomatica[] = automaticasFilas
    .map((f) => ({ f, t: tarjeta(f, edificios) }))
    .filter(({ t }) => delEdificio(t))
    .map(({ f, t }) => {
      const hacia = ((f.datos as { hacia?: { userId?: string | null; ia?: boolean; nombre?: string | null } } | null)?.hacia ?? {});
      const auto = { userId: hacia.userId ?? null, ia: Boolean(hacia.ia), nombre: hacia.nombre ?? (hacia.ia ? `${agente} (IA)` : "—") };
      const actualIa = Boolean(f.responsable_ia);
      const actual = {
        userId: (f.responsable_user_id as string | null) ?? null,
        ia: actualIa,
        nombre: actualIa ? `${agente} (IA)` : ((f.actual_nombre as string | null) ?? null),
      };
      const corregida = f.asignada_por !== "auto" || actual.userId !== auto.userId || actual.ia !== auto.ia;
      return { ...sinIds(t), asignadaAt: String(f.asignada_at), auto, actual, corregida };
    });

  const inicio = Date.now() - HORAS_AUTOMATICAS * 3_600_000;
  return {
    sinAsignar: sinAsignar.map(sinIds),
    automaticas,
    vendedores,
    edificios: listaEdificios,
    tope: TOPE_CARGA,
    resumen: {
      sinAsignar: sinAsignar.length,
      masViejaMin: sinAsignar[0]?.esperaMin ?? null,
      automaticasHoy: automaticas.filter((a) => Date.parse(a.asignadaAt) >= inicio).length,
    },
  };
}

/** Para la pastilla del menú. */
export async function contarSinAsignar(organizationId: string): Promise<number> {
  const [f] = (await getDb().execute(sql`
    select count(*)::int as n from ${schema.oportunidad} o
    where o.organization_id = ${organizationId}
      and o.responsable_user_id is null and o.responsable_ia = false
      and o.estado in ${abiertas}
  `)) as unknown as Fila[];
  return Number(f?.n ?? 0);
}

/** Asigna en lote a una persona del equipo; devuelve cómo estaban (para deshacer). */
export async function asignarEnLote(
  organizationId: string,
  actorUserId: string,
  oportunidadIds: readonly string[],
  userId: string
): Promise<Cambio[]> {
  if (!(await miembros(organizationId)).some((m) => m.userId === userId)) {
    throw new AsignacionesError(422, "persona_desconocida", "Esa persona no es del equipo");
  }
  const cambios: Cambio[] = [];
  for (const id of new Set(oportunidadIds)) {
    const r = await aplicarResponsable({
      organizationId,
      oportunidadId: id,
      destino: { userId, ia: false },
      como: "manual",
      actor: { fuente: "persona", userId: actorUserId },
    });
    if (r?.cambio) cambios.push({ id, anterior: r.anterior });
  }
  return cambios;
}

/** Vuelve cada oportunidad a como estaba (a quien ya no es del equipo, a sin asignar). */
export async function deshacerAsignaciones(
  organizationId: string,
  actorUserId: string,
  cambios: readonly Cambio[]
): Promise<number> {
  const equipo = new Set((await miembros(organizationId)).map((m) => m.userId));
  let n = 0;
  for (const c of cambios) {
    const valido = !c.anterior.userId || equipo.has(c.anterior.userId);
    const anterior = valido
      ? { ...c.anterior, asignadaPorUserId: c.anterior.asignadaPorUserId && equipo.has(c.anterior.asignadaPorUserId) ? c.anterior.asignadaPorUserId : null }
      : { userId: null, ia: false, asignadaPor: null, asignadaPorUserId: null, desde: null };
    const r = await aplicarResponsable({
      organizationId,
      oportunidadId: c.id,
      destino: { userId: anterior.userId, ia: anterior.ia },
      como: "deshacer",
      actor: { fuente: "persona", userId: actorUserId },
      restaurar: anterior,
    });
    if (r?.cambio) n += 1;
  }
  return n;
}

/* ------------------------------------------------------------------
 * Ajustes → Ventas → Asignaciones: quién recibe y en qué orden
 * ------------------------------------------------------------------ */

export type VendedorAjuste = { userId: string; nombre: string; role: string; recibe: boolean; tecla: number | null };

export async function leerVendedoresAjuste(organizationId: string): Promise<VendedorAjuste[]> {
  const [gente, config] = await Promise.all([miembros(organizationId), leerConfigVendedores(organizationId)]);
  return vendedoresDeLaMesa(gente, config);
}

/** Guarda el orden y quién recibe. Solo gente del equipo (quien ya no está, se descarta). */
export async function guardarVendedoresAjuste(organizationId: string, config: ConfigVendedor[]): Promise<VendedorAjuste[]> {
  const equipo = new Set((await miembros(organizationId)).map((m) => m.userId));
  const vistos = new Set<string>();
  const limpio = config.filter((c) => equipo.has(c.userId) && !vistos.has(c.userId) && vistos.add(c.userId));
  const valores = { asignacionVendedores: limpio, updatedAt: new Date() };
  await getDb()
    .insert(schema.ventasAjustes)
    .values({ organizationId, ...valores })
    .onConflictDoUpdate({ target: schema.ventasAjustes.organizationId, set: valores });
  return leerVendedoresAjuste(organizationId);
}
