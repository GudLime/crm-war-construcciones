import { rate, type PeriodDto, type RateDto } from "@/lib/analytics";
import { CAMINO_OPORTUNIDAD, ESTADOS_OPORTUNIDAD, etiqueta, type EstadoOportunidad } from "@/lib/ventas";

/**
 * Motor (paso 7) — estadísticas de oportunidades con «Ver por» y filtros.
 * Puro: se prueba sin base.
 *
 * El período cuenta las oportunidades que ENTRARON en él (cohorte): de esas,
 * cuántas llegaron a cada etapa, cuánto tardaron en cada una, por qué se
 * perdieron y de qué origen vinieron. Así la conversión es real y no se mezcla
 * con lo que entró antes.
 *
 * «Ver por» separa todo en grupos según una dimensión (origen, tipo, o un
 * campo de los objetos vinculados: edificio, tipología…). Una oportunidad con
 * dos valores (dos edificios) suma en los dos grupos: la suma de los grupos
 * puede pasar el total y la pantalla lo avisa (`multiple`).
 */

export const BLOQUES_ESTADISTICAS = ["embudo", "tiempos", "motivos", "origenes"] as const;
export type BloqueEstadisticas = (typeof BLOQUES_ESTADISTICAS)[number];

/** Clave de valor para «no tiene»: se puede elegir en los filtros. */
export const SIN_VALOR = "__sin__";

/** Más de estos valores distintos y un campo de texto o número no sirve para agrupar. */
export const MAX_VALORES_DIMENSION = 25;

export type OportunidadParaEstadisticas = {
  id: string;
  estado: EstadoOportunidad;
  origen: string | null;
  tipo: string | null;
  motivo: string | null;
};

export type MovimientoParaEstadisticas = {
  oportunidadId: string;
  /** Estado al que llegó (eventos `estado`, `cerrada`, `reabierta`). */
  estadoHasta: string | null;
  /** Estado del que salió y cuánto estuvo en él. */
  estadoDesde: string | null;
  segundos: number | null;
};

export type ValorDimension = { clave: string; nombre: string };

/** Una forma de agrupar: el valor (o los valores) de cada oportunidad. */
export type Dimension = {
  clave: string;
  nombre: string;
  /** Oportunidad → sus valores. Sin entrada (o vacía) = «Sin …». */
  valores: Map<string, ValorDimension[]>;
  /** Dimensiones de texto o número: solo se ofrecen con pocos valores distintos. */
  pocosValores?: boolean;
};

export type OpcionDto = {
  clave: string;
  nombre: string;
  valores: { clave: string; nombre: string; n: number }[];
};

export type EtapaEmbudoDto = {
  estado: EstadoOportunidad;
  nombre: string;
  llegaron: number;
  /** De los que llegaron acá, qué parte pasó a la siguiente. */
  avance: RateDto | null;
};

export type TiempoEtapaDto = {
  estado: EstadoOportunidad;
  nombre: string;
  casos: number;
  promedioDias: number | null;
  medianaDias: number | null;
};

export type GrupoEstadisticasDto = {
  clave: string;
  nombre: string;
  entraron: number;
  compraron: number;
  perdidas: number;
  noCalificadas: number;
  abiertas: number;
  conversion: RateDto;
  embudo: EtapaEmbudoDto[];
  tiempos: TiempoEtapaDto[];
  motivos: { motivo: string; n: number }[];
  origenes: { origen: string; entraron: number; compraron: number; conversion: RateDto }[];
};

export type EstadisticasOportunidadesDto = {
  period: PeriodDto;
  bloques: BloqueEstadisticas[];
  opciones: OpcionDto[];
  verPor: string | null;
  filtros: Record<string, string[]>;
  total: GrupoEstadisticasDto;
  grupos: GrupoEstadisticasDto[];
  /** Alguna oportunidad suma en más de un grupo. */
  multiple: boolean;
  empty: boolean;
};

const DIA = 86_400;
const redondear = (n: number) => Math.round(n * 10) / 10;

function valoresDe(d: Dimension, oportunidadId: string): ValorDimension[] {
  const v = d.valores.get(oportunidadId);
  return v && v.length ? v : [{ clave: SIN_VALOR, nombre: `Sin ${d.nombre.toLowerCase()}` }];
}

/** Las dimensiones que se pueden ofrecer, con sus valores y cuántas oportunidades tiene cada uno. */
export function opcionesDeDimensiones(dimensiones: Dimension[], ids: string[]): OpcionDto[] {
  const out: OpcionDto[] = [];
  for (const d of dimensiones) {
    const conteo = new Map<string, { nombre: string; n: number }>();
    for (const id of ids) {
      for (const v of valoresDe(d, id)) {
        const c = conteo.get(v.clave) ?? { nombre: v.nombre, n: 0 };
        c.n += 1;
        conteo.set(v.clave, c);
      }
    }
    const reales = [...conteo.keys()].filter((k) => k !== SIN_VALOR).length;
    if (reales === 0) continue;
    if (d.pocosValores && reales > MAX_VALORES_DIMENSION) continue;
    out.push({
      clave: d.clave,
      nombre: d.nombre,
      valores: [...conteo.entries()]
        .map(([clave, c]) => ({ clave, nombre: c.nombre, n: c.n }))
        .sort((a, b) => (a.clave === SIN_VALOR ? 1 : b.clave === SIN_VALOR ? -1 : b.n - a.n || a.nombre.localeCompare(b.nombre, "es"))),
    });
  }
  return out;
}

/** Las oportunidades que pasan todos los filtros. */
export function aplicarFiltros(
  oportunidades: OportunidadParaEstadisticas[],
  dimensiones: Dimension[],
  filtros: Record<string, string[]>
): OportunidadParaEstadisticas[] {
  const activos = Object.entries(filtros)
    .map(([clave, aceptados]) => ({ d: dimensiones.find((x) => x.clave === clave), aceptados }))
    .filter((f): f is { d: Dimension; aceptados: string[] } => Boolean(f.d) && f.aceptados.length > 0);
  if (!activos.length) return oportunidades;
  return oportunidades.filter((o) =>
    activos.every(({ d, aceptados }) => valoresDe(d, o.id).some((v) => aceptados.includes(v.clave)))
  );
}

/** El paso más lejano del camino al que llegó cada oportunidad (-1 si ninguno). */
function pasoMaximo(o: OportunidadParaEstadisticas, movimientos: MovimientoParaEstadisticas[]): number {
  let max = CAMINO_OPORTUNIDAD.indexOf(o.estado);
  for (const m of movimientos) {
    const i = m.estadoHasta ? CAMINO_OPORTUNIDAD.indexOf(m.estadoHasta as EstadoOportunidad) : -1;
    if (i > max) max = i;
    // Si salió de un estado, también estuvo en él (los datos viejos pueden no tener el evento de llegada).
    const j = m.estadoDesde ? CAMINO_OPORTUNIDAD.indexOf(m.estadoDesde as EstadoOportunidad) : -1;
    if (j > max) max = j;
  }
  // Toda oportunidad arranca en Recibido.
  return Math.max(max, 0);
}

function mediana(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** Los números de un grupo de oportunidades. */
export function calcularGrupo(
  clave: string,
  nombre: string,
  oportunidades: OportunidadParaEstadisticas[],
  movimientosPorOportunidad: Map<string, MovimientoParaEstadisticas[]>
): GrupoEstadisticasDto {
  const llegaron = CAMINO_OPORTUNIDAD.map(() => 0);
  const segundos = new Map<string, number[]>();
  const motivos = new Map<string, number>();
  const origenes = new Map<string, { entraron: number; compraron: number }>();
  let compraron = 0;
  let perdidas = 0;
  let noCalificadas = 0;

  for (const o of oportunidades) {
    const movs = movimientosPorOportunidad.get(o.id) ?? [];
    const max = pasoMaximo(o, movs);
    for (let i = 0; i <= max; i++) llegaron[i]! += 1;
    for (const m of movs) {
      if (!m.estadoDesde || m.segundos === null || m.segundos < 0) continue;
      if (!CAMINO_OPORTUNIDAD.includes(m.estadoDesde as EstadoOportunidad)) continue;
      segundos.set(m.estadoDesde, [...(segundos.get(m.estadoDesde) ?? []), m.segundos]);
    }
    if (o.estado === "compro") compraron += 1;
    if (o.estado === "perdido" || o.estado === "no_calificado") {
      if (o.estado === "perdido") perdidas += 1;
      else noCalificadas += 1;
      const motivo = o.motivo?.trim() || (o.estado === "no_calificado" ? "No calificado (sin motivo)" : "Sin motivo");
      motivos.set(motivo, (motivos.get(motivo) ?? 0) + 1);
    }
    const origen = o.origen?.trim() || "Sin origen";
    const og = origenes.get(origen) ?? { entraron: 0, compraron: 0 };
    og.entraron += 1;
    if (o.estado === "compro") og.compraron += 1;
    origenes.set(origen, og);
  }

  const entraron = oportunidades.length;
  return {
    clave,
    nombre,
    entraron,
    compraron,
    perdidas,
    noCalificadas,
    abiertas: entraron - compraron - perdidas - noCalificadas,
    conversion: rate(compraron, entraron),
    embudo: CAMINO_OPORTUNIDAD.map((estado, i) => ({
      estado,
      nombre: etiqueta(ESTADOS_OPORTUNIDAD, estado),
      llegaron: llegaron[i]!,
      avance: i < CAMINO_OPORTUNIDAD.length - 1 ? rate(llegaron[i + 1]!, llegaron[i]!) : null,
    })),
    tiempos: CAMINO_OPORTUNIDAD.filter((e) => e !== "compro").map((estado) => {
      const lista = segundos.get(estado) ?? [];
      const prom = lista.length ? lista.reduce((a, b) => a + b, 0) / lista.length : null;
      const med = mediana(lista);
      return {
        estado,
        nombre: etiqueta(ESTADOS_OPORTUNIDAD, estado),
        casos: lista.length,
        promedioDias: prom === null ? null : redondear(prom / DIA),
        medianaDias: med === null ? null : redondear(med / DIA),
      };
    }),
    motivos: [...motivos.entries()]
      .map(([motivo, n]) => ({ motivo, n }))
      .sort((a, b) => b.n - a.n || a.motivo.localeCompare(b.motivo, "es")),
    origenes: [...origenes.entries()]
      .map(([origen, v]) => ({ origen, ...v, conversion: rate(v.compraron, v.entraron) }))
      .sort((a, b) => b.entraron - a.entraron || a.origen.localeCompare(b.origen, "es")),
  };
}

/** Todo junto: filtra, agrupa y calcula. */
export function calcularEstadisticas(input: {
  period: PeriodDto;
  bloques: BloqueEstadisticas[];
  oportunidades: OportunidadParaEstadisticas[];
  movimientos: MovimientoParaEstadisticas[];
  dimensiones: Dimension[];
  verPor: string | null;
  filtros: Record<string, string[]>;
}): EstadisticasOportunidadesDto {
  const opciones = opcionesDeDimensiones(
    input.dimensiones,
    input.oportunidades.map((o) => o.id)
  );
  const ofrecidas = new Set(opciones.map((o) => o.clave));
  const filtros = Object.fromEntries(Object.entries(input.filtros).filter(([k, v]) => ofrecidas.has(k) && v.length));
  const filtradas = aplicarFiltros(input.oportunidades, input.dimensiones, filtros);

  const movimientos = new Map<string, MovimientoParaEstadisticas[]>();
  for (const m of input.movimientos) movimientos.set(m.oportunidadId, [...(movimientos.get(m.oportunidadId) ?? []), m]);

  const total = calcularGrupo("total", "Total", filtradas, movimientos);
  const verPor = input.verPor && ofrecidas.has(input.verPor) ? input.verPor : null;
  const dim = verPor ? input.dimensiones.find((d) => d.clave === verPor) : undefined;

  const grupos: GrupoEstadisticasDto[] = [];
  let multiple = false;
  if (dim) {
    const porGrupo = new Map<string, { nombre: string; ops: OportunidadParaEstadisticas[] }>();
    for (const o of filtradas) {
      const vals = valoresDe(dim, o.id);
      if (new Set(vals.map((v) => v.clave)).size > 1) multiple = true;
      for (const v of vals) {
        const g = porGrupo.get(v.clave) ?? { nombre: v.nombre, ops: [] };
        if (!g.ops.includes(o)) g.ops.push(o);
        porGrupo.set(v.clave, g);
      }
    }
    for (const [clave, g] of porGrupo) grupos.push(calcularGrupo(clave, g.nombre, g.ops, movimientos));
    grupos.sort((a, b) =>
      a.clave === SIN_VALOR ? 1 : b.clave === SIN_VALOR ? -1 : b.entraron - a.entraron || a.nombre.localeCompare(b.nombre, "es")
    );
  }

  return {
    period: input.period,
    bloques: input.bloques,
    opciones,
    verPor,
    filtros,
    total,
    grupos,
    multiple,
    empty: input.oportunidades.length === 0,
  };
}
