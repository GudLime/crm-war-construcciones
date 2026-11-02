/**
 * Forma mínima de un correo (algo@algo.algo), para avisar en el formulario
 * antes de mandar. Es un chequeo de forma, no de existencia: el servidor
 * vuelve a validar con Zod.
 */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Vacío cuenta como válido: el correo del contacto es opcional. */
export function emailOpcionalValido(valor: string): boolean {
  const v = valor.trim();
  return v === "" || EMAIL_RE.test(v);
}
