/**
 * War — Motivos de cierre de las oportunidades, configurables (Ajustes →
 * Motivos de cierre). La oportunidad guarda el nombre como texto: renombrar
 * acá lo arrastra a las oportunidades; borrar no les toca nada.
 */

export type MotivoCierreDto = {
  id: string;
  nombre: string;
  orden: number;
  /** Solo en Ajustes: cuántas oportunidades lo tienen. */
  usos?: number;
};

/**
 * Los de Notion (27), en el orden con que arranca cada organización. La
 * migración `war_0001_motivos_cierre` los crea en las que ya existen; una nueva
 * los recibe al abrir la lista por primera vez.
 */
export const MOTIVOS_POR_DEFECTO: readonly string[] = [
  "Compró",
  "Compró en otro lado",
  "Compró con una inmobiliaria",
  "Presupuesto insuficiente",
  "Crédito hipotecario",
  "Cuotas a largo plazo",
  "Ofrece propiedad en forma de pago",
  "Busca menos metros",
  "Busca más metros",
  "Busca de pozo",
  "Busca terminado",
  "Busca con amenities",
  "Busca sin amenities",
  "Busca alquiler",
  "No le gusta la zona",
  "No tenemos disponibilidad",
  "No tenemos el producto que busca",
  "No responde",
  "Número incorrecto",
  "Solo pidió info",
  "Confunde el anuncio",
  "Pausó la búsqueda",
  "Depende de la venta",
  "Incertidumbre",
  "Incertidumbre política",
  "Proveedor",
  "Chusma de barrio",
];

export const NOMBRE_MOTIVO_MAX = 80;
export const TOPE_MOTIVOS = 80;

export function normalizarNombreMotivo(nombre: string): string {
  return nombre.replace(/\s+/g, " ").trim();
}

/** Para comparar sin mayúsculas, tildes ni espacios: «Busca de Pozo» = «busca de pozo». */
export function planoMotivo(nombre: string): string {
  return normalizarNombreMotivo(nombre)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ]/g, "");
}
