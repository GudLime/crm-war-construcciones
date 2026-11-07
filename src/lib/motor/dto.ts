import type { TipoCampo } from "./config";

/**
 * Motor — lo que las pantallas reciben de la API. Compartido entre servidor y
 * cliente: sin dependencias de base.
 */

export type CampoDto = {
  clave: string;
  nombre: string;
  tipo: TipoCampo;
  obligatorio: boolean;
  /** Los calculados no se editan. */
  editable: boolean;
  opciones: { valor: string; nombre: string }[] | null;
  visibleLista: boolean;
  visibleAgente: boolean;
};

/** Una relación uno a muchos vista desde un lado. */
export type RelacionDto = {
  clave: string;
  /** Clave del objeto del otro lado. */
  objeto: string;
  /** Cómo se llama la relación desde este lado («Unidades», «Edificio»). */
  nombre: string;
  obligatoria: boolean;
};

export type ObjetoDto = {
  clave: string;
  nombre: string;
  nombrePlural: string;
  icono: string;
  titulo: string[];
  visibleAgente: boolean;
  campos: CampoDto[];
  /** Relaciones uno a muchos que llegan a este objeto: sus padres. */
  padres: RelacionDto[];
  /** Relaciones uno a muchos que salen de este objeto: sus hijos. */
  hijos: RelacionDto[];
};

export type RegistroDto = {
  id: string;
  titulo: string;
  valores: Record<string, string | number | boolean | string[] | null>;
  padres: Record<string, string | null>;
  creadoEn: string | null;
};

/** Para el menú: un objeto por entrada. */
export type ObjetoMenuDto = { clave: string; nombrePlural: string; icono: string };

/** Errores del motor → código HTTP. */
export const STATUS_ERROR: Record<string, number> = {
  objeto_desconocido: 404,
  no_encontrado: 404,
  invalido: 422,
  padre_desconocido: 422,
  duplicado: 409,
  en_uso: 409,
};
