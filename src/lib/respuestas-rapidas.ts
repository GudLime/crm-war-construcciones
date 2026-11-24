/**
 * 049 — Respuestas rápidas: lo puro del menú «/» del compositor, para
 * probarlo sin navegador. Encontrar el `/atajo` que se está escribiendo,
 * filtrar la lista, reemplazarlo por el texto y rellenar `{nombre}`.
 */

/** 0067 — Una foto o un video que sale con la respuesta. */
export type AdjuntoRespuesta = { id: string; nombre: string; mime: string; bytes: number };

export type RespuestaRapida = {
  id: string;
  atajo: string;
  texto: string;
  /** 0067 — Fotos y videos (pueden faltar en datos viejos). */
  adjuntos?: AdjuntoRespuesta[];
};

/** 0067 — Cuántos archivos caben en una respuesta. */
export const TOPE_ADJUNTOS = 10;

export const ATAJO_MAX = 32;
export const TEXTO_MAX = 4096;
export const TOPE_RESPUESTAS = 200;
export const ATAJO_RE = /^[a-z0-9_-]{1,32}$/;

/** Sin acentos y en minúsculas: «Envío» y «envio» son lo mismo al buscar. */
export function plegar(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/**
 * Pura: el atajo como se guarda. Quita la `/` del inicio, los acentos y los
 * espacios (que pasan a `-`), y todo lo que no sea letra, número, `-` o `_`.
 * Puede devolver vacío: quien llama lo valida con `ATAJO_RE`.
 */
export function normalizarAtajo(entrada: string): string {
  return plegar(entrada.trim().replace(/^\/+/, ""))
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, ATAJO_MAX);
}

/**
 * Pura: el `/atajo` que se está escribiendo justo antes del cursor, si hay.
 * La `/` tiene que estar al inicio de la caja o después de un espacio: así
 * `3/4` o `https://…` no abren el menú.
 */
export function tokenRapido(
  texto: string,
  cursor: number
): { inicio: number; consulta: string } | null {
  const antes = texto.slice(0, cursor);
  const m = /(^|\s)\/([^\s/]{0,32})$/u.exec(antes);
  if (!m) return null;
  return { inicio: antes.length - m[2]!.length - 1, consulta: m[2]! };
}

/**
 * Pura: las respuestas que coinciden. Primero las que EMPIEZAN por la
 * consulta (lo que uno espera al teclear el atajo); después las que la
 * contienen en el atajo o en el texto. Sin consulta, todas por atajo.
 */
export function filtrarRespuestas(
  lista: readonly RespuestaRapida[],
  consulta: string
): RespuestaRapida[] {
  const q = plegar(consulta);
  const porAtajo = [...lista].sort((a, b) => a.atajo.localeCompare(b.atajo));
  if (!q) return porAtajo;
  const empiezan = porAtajo.filter((r) => r.atajo.startsWith(q));
  const contienen = porAtajo.filter(
    (r) => !r.atajo.startsWith(q) && (r.atajo.includes(q) || plegar(r.texto).includes(q))
  );
  return [...empiezan, ...contienen];
}

/**
 * Pura: el primer nombre de un contacto para `{nombre}`. Un nombre que no
 * tiene letras (un teléfono o un BSUID puestos como nombre) no cuenta.
 */
export function primerNombre(nombre: string | null | undefined): string {
  const primero = (nombre ?? "").trim().split(/\s+/)[0] ?? "";
  return /\p{L}/u.test(primero) && !primero.includes(":") ? primero : "";
}

/**
 * Pura: cambia `{nombre}` por el primer nombre. Sin nombre se quita con el
 * espacio de antes: «Hola {nombre}, ¿qué tal?» → «Hola, ¿qué tal?».
 */
export function rellenarVariables(texto: string, nombre: string | null | undefined): string {
  const primero = primerNombre(nombre);
  return primero
    ? texto.replace(/\{\s*nombre\s*\}/giu, primero)
    : texto.replace(/[ \t]*\{\s*nombre\s*\}/giu, "");
}

/** Pura: reemplaza el `/atajo` (de `inicio` al cursor) por la respuesta. */
export function aplicarRespuesta(
  texto: string,
  inicio: number,
  cursor: number,
  insercion: string
): { texto: string; cursor: number } {
  return {
    texto: texto.slice(0, inicio) + insercion + texto.slice(cursor),
    cursor: inicio + insercion.length,
  };
}
