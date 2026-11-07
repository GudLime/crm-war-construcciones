import { gte, inArray, isNotNull, lt, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import {
  BLOQUES_ESTADISTICAS,
  calcularEstadisticas,
  type BloqueEstadisticas,
  type Dimension,
  type EstadisticasOportunidadesDto,
  type MovimientoParaEstadisticas,
  type OportunidadParaEstadisticas,
  type ValorDimension,
} from "@/lib/estadisticas-oportunidades";
import { TIPOS_OPORTUNIDAD, etiqueta, type EstadoOportunidad } from "@/lib/ventas";
import type { ResolvedPeriod } from "@/server/analytics/period";
import { notLabContact } from "@/server/analytics/shared";
import type { CampoMeta } from "@/lib/motor/valores";
import { cargarMotor } from "@/server/motor/metadatos";
import { registrosPorIds } from "@/server/motor/registros";
import { leerConfigCliente } from "@/server/motor/sincronizar";

/**
 * Motor (paso 7) — estadísticas de oportunidades: la cohorte del período, sus
 * movimientos y las dimensiones para «Ver por» y filtros. Las dimensiones salen
 * solas de la estructura: origen y tipo (núcleo) y, por cada relación de la
 * oportunidad con un objeto del cliente, el registro vinculado, sus campos de
 * selección, booleanos, de texto o número con pocos valores, y sus padres
 * (unidad → edificio).
 */

const id = (nombre: string): SQL => sql`${sql.identifier(nombre)}`;
const LOTE = 1000;

function lotes<T>(lista: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < lista.length; i += LOTE) out.push(lista.slice(i, i + LOTE));
  return out;
}

async function cohorte(organizationId: string, period: ResolvedPeriod): Promise<OportunidadParaEstadisticas[]> {
  const filas = await getDb()
    .select({
      id: schema.oportunidad.id,
      estado: schema.oportunidad.estado,
      origen: schema.oportunidad.origen,
      tipo: schema.oportunidad.tipo,
      motivo: schema.oportunidad.motivoCierre,
    })
    .from(schema.oportunidad)
    .where(
      scoped(
        schema.oportunidad.organizationId,
        organizationId,
        gte(schema.oportunidad.createdAt, period.start),
        lt(schema.oportunidad.createdAt, period.end),
        // Una oportunidad sin contacto (cargada a mano) cuenta; una del Laboratorio, no.
        sql`(${schema.oportunidad.contactId} is null or ${notLabContact(schema.oportunidad.contactId)})`
      )
    );
  return filas.map((f) => ({ ...f, estado: f.estado as EstadoOportunidad }));
}

async function movimientos(organizationId: string, ids: string[]): Promise<MovimientoParaEstadisticas[]> {
  const out: MovimientoParaEstadisticas[] = [];
  for (const lote of lotes(ids)) {
    const filas = await getDb()
      .select({
        oportunidadId: schema.oportunidadEvento.oportunidadId,
        estadoHasta: schema.oportunidadEvento.estadoHasta,
        estadoDesde: schema.oportunidadEvento.estadoDesde,
        segundos: schema.oportunidadEvento.segundosEnEstadoAnterior,
      })
      .from(schema.oportunidadEvento)
      .where(
        scoped(
          schema.oportunidadEvento.organizationId,
          organizationId,
          inArray(schema.oportunidadEvento.oportunidadId, lote),
          inArray(schema.oportunidadEvento.tipo, ["estado", "cerrada", "reabierta"]),
          isNotNull(schema.oportunidadEvento.estadoHasta)
        )
      );
    out.push(...filas);
  }
  return out;
}

function dimensionesDelNucleo(ops: OportunidadParaEstadisticas[]): Dimension[] {
  const origen = new Map<string, ValorDimension[]>();
  const tipo = new Map<string, ValorDimension[]>();
  for (const o of ops) {
    if (o.origen?.trim()) origen.set(o.id, [{ clave: o.origen.trim(), nombre: o.origen.trim() }]);
    if (o.tipo) tipo.set(o.id, [{ clave: o.tipo, nombre: etiqueta(TIPOS_OPORTUNIDAD, o.tipo) }]);
  }
  return [
    { clave: "origen", nombre: "Origen", valores: origen },
    { clave: "tipo", nombre: "Tipo", valores: tipo },
  ];
}

/** El valor de un campo como grupo: clave estable y nombre para la pantalla. */
function valorDeCampo(campo: CampoMeta, valor: unknown): ValorDimension[] {
  if (valor === null || valor === undefined || valor === "") return [];
  if (campo.tipo === "booleano") return [{ clave: valor ? "true" : "false", nombre: valor ? "Sí" : "No" }];
  const lista = Array.isArray(valor) ? valor : [valor];
  return lista.map((v) => {
    const k = String(v);
    const nombre = campo.opciones?.find((o) => o.valor === k)?.nombre ?? k;
    return { clave: k, nombre };
  });
}

const TIPOS_AGRUPABLES = new Set(["seleccion", "seleccion_multiple", "booleano"]);
const TIPOS_CON_POCOS_VALORES = new Set(["texto", "numero"]);

async function dimensionesDelMotor(organizationId: string, ids: string[]): Promise<Dimension[]> {
  const motor = await cargarMotor(organizationId);
  const relaciones = motor.relaciones.filter(
    (r) => r.tipo === "muchos_a_muchos" && r.desde === "oportunidad" && r.tabla && motor.objetos.has(r.hacia)
  );
  if (!relaciones.length || !ids.length) return [];
  const out: Dimension[] = [];
  for (const r of relaciones) {
    const objeto = motor.objetos.get(r.hacia)!;
    // Oportunidad → registros vinculados.
    const vinculos = new Map<string, string[]>();
    for (const lote of lotes(ids)) {
      const filas = (await getDb().execute(
        sql`SELECT ${id(r.columnaDesde)} AS o, ${id(r.columnaHacia)} AS r FROM ${id(r.tabla as string)}
            WHERE organization_id = ${organizationId} AND ${id(r.columnaDesde)} IN (${sql.join(
              lote.map((x) => sql`${x}`),
              sql`, `
            )})`
      )) as unknown as { o: string; r: string }[];
      for (const f of filas) vinculos.set(String(f.o), [...(vinculos.get(String(f.o)) ?? []), String(f.r)]);
    }
    const registros = await registrosPorIds(organizationId, motor, r.hacia, [...vinculos.values()].flat());
    const porId = new Map(registros.map((x) => [x.id, x]));

    const porOportunidad = (valor: (regId: string) => ValorDimension[]) => {
      const m = new Map<string, ValorDimension[]>();
      for (const [op, regs] of vinculos) {
        const vals = new Map<string, ValorDimension>();
        for (const rid of regs) for (const v of valor(rid)) vals.set(v.clave, v);
        if (vals.size) m.set(op, [...vals.values()]);
      }
      return m;
    };

    // El registro vinculado (la unidad, el edificio).
    out.push({
      clave: r.clave,
      nombre: objeto.nombre,
      valores: porOportunidad((rid) => {
        const reg = porId.get(rid);
        return reg ? [{ clave: rid, nombre: reg.titulo || "(sin nombre)" }] : [];
      }),
    });

    // Sus campos.
    for (const c of objeto.campos) {
      if (!c.columna) continue;
      const pocos = TIPOS_CON_POCOS_VALORES.has(c.tipo);
      if (!TIPOS_AGRUPABLES.has(c.tipo) && !pocos) continue;
      out.push({
        clave: `${r.clave}.${c.clave}`,
        nombre: `${c.nombre} (${objeto.nombre.toLowerCase()})`,
        valores: porOportunidad((rid) => valorDeCampo(c, porId.get(rid)?.valores[c.clave])),
        pocosValores: pocos,
      });
    }

    // Sus padres (unidad → edificio).
    for (const p of motor.relaciones) {
      if (p.tipo !== "uno_a_muchos" || p.hacia !== r.hacia || !p.columna || !motor.objetos.has(p.desde)) continue;
      const padreIds = registros.map((x) => x.padres[p.clave]).filter((x): x is string => Boolean(x));
      const padres = new Map(
        (await registrosPorIds(organizationId, motor, p.desde, padreIds)).map((x) => [x.id, x.titulo])
      );
      out.push({
        clave: `${r.clave}.${p.clave}`,
        nombre: `${p.nombreHacia} (${objeto.nombre.toLowerCase()})`,
        valores: porOportunidad((rid) => {
          const pid = porId.get(rid)?.padres[p.clave];
          const t = pid ? padres.get(pid) : undefined;
          return pid && t !== undefined ? [{ clave: pid, nombre: t || "(sin nombre)" }] : [];
        }),
      });
    }
  }
  return out;
}

async function tableroDeLaConfiguracion(): Promise<{ bloques: BloqueEstadisticas[]; verPor: string | null }> {
  const r = await leerConfigCliente().catch(() => null);
  const e = r?.estado === "ok" ? r.config.estadisticas : undefined;
  return { bloques: e?.bloques ?? [...BLOQUES_ESTADISTICAS], verPor: e?.verPor ?? null };
}

export async function estadisticasOportunidades(
  organizationId: string,
  period: ResolvedPeriod,
  pedido: { verPor?: string | null; filtros: Record<string, string[]> }
): Promise<EstadisticasOportunidadesDto> {
  const [ops, tablero] = await Promise.all([cohorte(organizationId, period), tableroDeLaConfiguracion()]);
  const ids = ops.map((o) => o.id);
  const [movs, delMotor] = await Promise.all([
    movimientos(organizationId, ids),
    // Si el motor falla, las estadísticas del núcleo siguen andando.
    dimensionesDelMotor(organizationId, ids).catch((err) => {
      console.error("[estadisticas] no se pudieron armar las dimensiones del motor:", err);
      return [] as Dimension[];
    }),
  ]);
  return calcularEstadisticas({
    period: period.dto,
    bloques: tablero.bloques,
    oportunidades: ops,
    movimientos: movs,
    dimensiones: [...dimensionesDelNucleo(ops), ...delMotor],
    // `undefined` = primera carga: arranca con el de la configuración. `null`/"" = el usuario eligió «nada».
    verPor: pedido.verPor === undefined ? tablero.verPor : pedido.verPor || null,
    filtros: pedido.filtros,
  });
}
