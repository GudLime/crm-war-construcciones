import { parsePhoneNumberFromString } from "libphonenumber-js";

/**
 * Para mostrar: `5491151191447` → `+54 9 11 5119-1447`.
 *
 * Aparte de `telefono.ts` a propósito: mostrar alcanza con la metadata chica
 * de libphonenumber, y este formato se usa en casi todas las pantallas. La
 * normalización (que necesita la metadata completa) solo la cargan las
 * pantallas donde se escribe un teléfono.
 */
export function formatearTelefono(telefono: string | null | undefined): string {
  if (!telefono) return "Sin teléfono";
  const digitos = telefono.replace(/^\+/, "");
  const n = parsePhoneNumberFromString(`+${digitos}`);
  return n ? n.formatInternational() : `+${digitos}`;
}
