/**
 * Color por etapa de la oportunidad (cambios 23/11, punto 5): el mismo en todo
 * el sistema — barra de avance, píldora de estado, columnas del Pipeline,
 * fondo de cada ítem en Oportunidades, Resultados e Inicio.
 *
 * - `solido`: la etapa actual, el punto, la banda del embudo.
 * - `tinte` / `texto`: la píldora y las etapas ya pasadas.
 * - `lavado`: el fondo muy claro de la fila o la tarjeta.
 * - `sobreSolido`: el texto encima del sólido.
 *
 * Una etapa que no está acá (un cliente con etapas propias) usa el neutro.
 */
export type ColorEtapa = { solido: string; tinte: string; texto: string; lavado: string; sobreSolido: string };

const GRIS: ColorEtapa = { solido: "#64748b", tinte: "#f1f5f9", texto: "#334155", lavado: "#f8fafc", sobreSolido: "#ffffff" };

export const COLOR_ETAPA: Readonly<Record<string, ColorEtapa>> = {
  recibido: { solido: "#16a34a", tinte: "#dcfce7", texto: "#166534", lavado: "#f4fcf6", sobreSolido: "#ffffff" },
  en_charlas: { solido: "#38bdf8", tinte: "#e0f2fe", texto: "#075985", lavado: "#f3faff", sobreSolido: "#0c4a6e" },
  conoce_informacion: { solido: "#facc15", tinte: "#fef9c3", texto: "#854d0e", lavado: "#fefdf0", sobreSolido: "#422006" },
  visito: { solido: "#dc2626", tinte: "#fee2e2", texto: "#991b1b", lavado: "#fef6f6", sobreSolido: "#ffffff" },
  reservo: { solido: "#7c3aed", tinte: "#ede9fe", texto: "#5b21b6", lavado: "#f8f6ff", sobreSolido: "#ffffff" },
  compro: { solido: "#db2777", tinte: "#fce7f3", texto: "#9d174d", lavado: "#fdf5f9", sobreSolido: "#ffffff" },
  perdido: GRIS,
  no_calificado: GRIS,
};

export function colorDeEtapa(estado: string | null | undefined): ColorEtapa {
  return (estado && COLOR_ETAPA[estado]) || GRIS;
}

/** Las variables CSS para `.fondo-etapa` / `.pildora-etapa` (globals.css), que resuelven el modo oscuro. */
export function varsDeEtapa(estado: string | null | undefined): Record<string, string> {
  const c = colorDeEtapa(estado);
  return { "--et-solido": c.solido, "--et-tinte": c.tinte, "--et-texto": c.texto, "--et-lavado": c.lavado };
}
