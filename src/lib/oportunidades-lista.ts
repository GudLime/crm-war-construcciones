import { ESTADOS_OPORTUNIDAD, ordenarTipologiasUnidad, type EstadoOportunidad } from "@/lib/ventas";

/**
 * La lista de oportunidades: columnas, orden y anchos (lo puro, sin React,
 * para probarlo como tabla). La página guarda en su estado qué columnas se
 * ven, por cuál se ordena y cuánto mide cada una.
 */

export type FormaDeVer = "lista" | "mosaico" | "pipeline";

export type ClaveColumna =
  | "nombre"
  | "origen"
  | "interes"
  | "ambientes"
  | "tipologia"
  | "departamento"
  | "estado"
  | "ultima"
  | "valor";

export type Columna = {
  clave: ClaveColumna;
  titulo: string;
  /** Ancho original en px (doble clic en el borde vuelve acá). */
  ancho: number;
  /** «Oportunidad» no se oculta. */
  fija?: boolean;
  /** Texto del menú: «Ascendente · {criterio}». */
  criterioAsc: string;
  criterioDesc: string;
  alinear?: "derecha";
};

export const COLUMNAS: readonly Columna[] = [
  { clave: "nombre", titulo: "Oportunidad", ancho: 240, fija: true, criterioAsc: "A → Z", criterioDesc: "Z → A" },
  { clave: "origen", titulo: "Origen", ancho: 180, criterioAsc: "A → Z", criterioDesc: "Z → A" },
  { clave: "interes", titulo: "Interés", ancho: 150, criterioAsc: "A → Z", criterioDesc: "Z → A" },
  { clave: "ambientes", titulo: "Ambientes", ancho: 110, criterioAsc: "menor primero", criterioDesc: "mayor primero" },
  { clave: "tipologia", titulo: "Tipología", ancho: 140, criterioAsc: "1A → 4B", criterioDesc: "4B → 1A" },
  { clave: "departamento", titulo: "Departamento", ancho: 130, criterioAsc: "A → Z", criterioDesc: "Z → A" },
  { clave: "estado", titulo: "Estado", ancho: 190, criterioAsc: "orden del embudo", criterioDesc: "embudo al revés" },
  { clave: "ultima", titulo: "Última interacción", ancho: 150, criterioAsc: "más vieja primero", criterioDesc: "más nueva primero" },
  { clave: "valor", titulo: "Valor", ancho: 130, alinear: "derecha", criterioAsc: "menor primero", criterioDesc: "mayor primero" },
];

/** Departamento arranca oculta: se prende desde «Columnas». */
export const OCULTAS_POR_DEFECTO: readonly ClaveColumna[] = ["departamento"];

export const ANCHO_MINIMO = 70;

export type Orden = { columna: ClaveColumna; dir: "asc" | "desc" } | null;

/** Lo que la lista necesita de cada oportunidad para ordenar. */
export type FilaOrdenable = {
  nombre: string;
  origen: string | null;
  edificios: { nombre: string }[];
  edificioNombre: string | null;
  ambientes: readonly number[];
  tipologiasUnidad: readonly string[];
  unidad: string | null;
  estado: EstadoOportunidad;
  ultimaInteraccion: string;
  valorCents: number | null;
};

const ORDEN_ESTADO = new Map<string, number>(ESTADOS_OPORTUNIDAD.map((e, i) => [e.value, i]));

const comparaTexto = new Intl.Collator("es", { numeric: true, sensitivity: "base" }).compare;

/** La clave de orden de una fila en una columna; null = sin dato (va siempre al final). */
function claveDe(f: FilaOrdenable, c: ClaveColumna): string | number | null {
  switch (c) {
    case "nombre":
      return f.nombre;
    case "origen":
      return f.origen || null;
    case "interes":
      return f.edificios[0]?.nombre ?? f.edificioNombre ?? null;
    case "ambientes":
      return f.ambientes.length ? Math.min(...f.ambientes) : null;
    case "tipologia":
      return ordenarTipologiasUnidad(f.tipologiasUnidad)[0] ?? null;
    case "departamento":
      return f.unidad || null;
    case "estado":
      return ORDEN_ESTADO.get(f.estado) ?? 99;
    case "ultima":
      return new Date(f.ultimaInteraccion).getTime();
    case "valor":
      return f.valorCents;
  }
}

/** Ordena sin tocar el arreglo. Los vacíos van al final en los dos sentidos. */
export function ordenar<T extends FilaOrdenable>(filas: readonly T[], orden: Orden): T[] {
  if (!orden) return [...filas];
  const signo = orden.dir === "asc" ? 1 : -1;
  return [...filas].sort((a, b) => {
    const x = claveDe(a, orden.columna);
    const y = claveDe(b, orden.columna);
    if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
    const r = typeof x === "number" && typeof y === "number" ? x - y : comparaTexto(String(x), String(y));
    return r * signo;
  });
}

/** Ancho nuevo al arrastrar: nunca menos que el mínimo. */
export function anchoArrastrado(inicial: number, deltaX: number): number {
  return Math.max(ANCHO_MINIMO, Math.round(inicial + deltaX));
}

/** Pipeline: una columna por etapa abierta del camino (Recibido…Compró). */
export function columnasPipeline<T extends { estado: EstadoOportunidad; valorCents: number | null }>(
  filas: readonly T[],
  etapas: readonly EstadoOportunidad[]
): { estado: EstadoOportunidad; items: T[]; total: number }[] {
  return etapas.map((estado) => {
    const items = filas.filter((f) => f.estado === estado);
    return { estado, items, total: items.reduce((s, f) => s + (f.valorCents ?? 0), 0) };
  });
}
