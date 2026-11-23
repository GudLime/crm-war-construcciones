/**
 * Resultados — el embudo por etapa (spec `claude/resultados-rediseno.md` §3).
 * Lo puro: el % de cada etapa sobre la anterior y sobre el total, el color de
 * la etiqueta y la altura de cada banda (raíz cuadrada para que las últimas
 * etapas se vean; los números exactos van arriba).
 */

export type EtapaDelEmbudo = {
  estado: string;
  nombre: string;
  n: number;
  /** % sobre el total (la primera etapa), redondeado. */
  delTotal: number | null;
  /** % sobre la etapa anterior; null en la primera. */
  deLaAnterior: number | null;
  /** Alto de la banda en px (de 200 como máximo). */
  alto: number;
};

export const ALTO_MAXIMO = 200;
export const ALTO_MINIMO = 16;

export function etapasDelEmbudo(embudo: readonly { estado: string; nombre: string; llegaron: number }[]): EtapaDelEmbudo[] {
  const total = embudo[0]?.llegaron ?? 0;
  return embudo.map((e, i) => {
    const anterior = i > 0 ? embudo[i - 1]!.llegaron : null;
    return {
      estado: e.estado,
      nombre: e.nombre,
      n: e.llegaron,
      delTotal: total > 0 ? Math.round((e.llegaron / total) * 100) : null,
      deLaAnterior: anterior === null ? null : anterior > 0 ? Math.round((e.llegaron / anterior) * 100) : null,
      alto: total > 0 ? Math.max(ALTO_MINIMO, Math.round(ALTO_MAXIMO * Math.sqrt(e.llegaron / total))) : ALTO_MINIMO,
    };
  });
}

/** Verde desde 50%, ámbar entre 25% y 50%, rojo debajo de 25%. */
export function tonoDeAvance(pct: number | null): "verde" | "ambar" | "rojo" | null {
  if (pct === null) return null;
  if (pct >= 50) return "verde";
  if (pct >= 25) return "ambar";
  return "rojo";
}

/** «3,5%» con un decimal. */
export function conversionTotal(compraron: number, entraron: number): string {
  const v = entraron > 0 ? (compraron / entraron) * 100 : 0;
  return `${v.toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

/** El ciclo: la suma de los tiempos medianos por etapa (en días), o null. */
export function cicloPromedio(tiempos: readonly { medianaDias: number | null }[]): number | null {
  const v = tiempos.map((t) => t.medianaDias).filter((x): x is number => x !== null);
  return v.length ? Math.round(v.reduce((s, x) => s + x, 0)) : null;
}
