/**
 * v2, punto 5 — Las tablas de trabajo diario como la de Oportunidades: orden
 * por columna, ocultar, ancho y mover de lugar arrastrando el título. Lo puro.
 */
export type OrdenTabla = { columna: string; dir: "asc" | "desc" } | null;

export type PrefTabla = {
  ocultas: string[];
  orden: OrdenTabla;
  anchos: Record<string, number>;
  /** El orden de las columnas (claves). Vacío = el de siempre. */
  posiciones: string[];
};

export const PREF_TABLA_VACIA: PrefTabla = { ocultas: [], orden: null, anchos: {}, posiciones: [] };
export const ANCHO_MINIMO_TABLA = 70;

/** Las columnas en el orden elegido: las conocidas primero, las nuevas al final, en su lugar de siempre. */
export function enPosicion<C extends { clave: string }>(columnas: readonly C[], posiciones: readonly string[]): C[] {
  if (!posiciones.length) return [...columnas];
  const porClave = new Map(columnas.map((c) => [c.clave, c]));
  const out: C[] = [];
  for (const k of posiciones) {
    const c = porClave.get(k);
    if (c && !out.includes(c)) out.push(c);
  }
  for (const c of columnas) if (!out.includes(c)) out.push(c);
  return out;
}

/** Mover `clave` a donde está `destino` (soltarla encima de otra columna). */
export function moverColumna(orden: readonly string[], clave: string, destino: string): string[] {
  if (clave === destino) return [...orden];
  const sin = orden.filter((k) => k !== clave);
  const i = sin.indexOf(destino);
  if (i < 0) return [...orden];
  const desde = orden.indexOf(clave);
  const hasta = orden.indexOf(destino);
  // Hacia la derecha queda después del destino; hacia la izquierda, antes.
  sin.splice(desde < hasta ? i + 1 : i, 0, clave);
  return sin;
}

const texto = new Intl.Collator("es", { sensitivity: "base", numeric: true });

/** Ordena por el valor de la columna; los vacíos siempre al final. */
export function ordenarFilas<T>(filas: readonly T[], orden: OrdenTabla, valorDe: (f: T, columna: string) => string | number | null): T[] {
  if (!orden) return [...filas];
  const signo = orden.dir === "asc" ? 1 : -1;
  return [...filas].sort((a, b) => {
    const x = valorDe(a, orden.columna);
    const y = valorDe(b, orden.columna);
    const vx = x === "" ? null : x;
    const vy = y === "" ? null : y;
    if (vx === null || vy === null) return vx === vy ? 0 : vx === null ? 1 : -1;
    const r = typeof vx === "number" && typeof vy === "number" ? vx - vy : texto.compare(String(vx), String(vy));
    return r * signo;
  });
}

/** Lee las preferencias guardadas tolerando basura. */
export function leerPrefTabla(crudo: unknown): PrefTabla {
  const p = (crudo ?? {}) as Partial<PrefTabla>;
  const lista = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const orden =
    p.orden && typeof p.orden === "object" && typeof p.orden.columna === "string" && (p.orden.dir === "asc" || p.orden.dir === "desc")
      ? { columna: p.orden.columna, dir: p.orden.dir }
      : null;
  const anchos: Record<string, number> = {};
  if (p.anchos && typeof p.anchos === "object") {
    for (const [k, v] of Object.entries(p.anchos)) if (typeof v === "number" && v >= ANCHO_MINIMO_TABLA && v < 2000) anchos[k] = v;
  }
  return { ocultas: lista(p.ocultas), orden, anchos, posiciones: lista(p.posiciones) };
}
