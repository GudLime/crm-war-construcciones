/**
 * War — Datos personales del contacto (punto 5 de la checklist de Notion).
 * Viven en `contacto_datos` y `contacto_pariente`, aparte de `contact`.
 */

export type ParienteDto = { contactId: string; nombre: string; telefono: string | null; relacion: string | null };

export type DatosContactoDto = {
  dni: string | null;
  cuil: string | null;
  /** AAAA-MM-DD. */
  nacimiento: string | null;
  direccion: string | null;
  genero: "mujer" | "hombre" | null;
  newsletter: boolean;
  googleContactId: string | null;
  parientes: ParienteDto[];
};

export const GENEROS = [
  { value: "mujer", label: "Mujer" },
  { value: "hombre", label: "Hombre" },
] as const;

/** Solo dígitos: «20-12345678-9» y «20123456789» son el mismo CUIL. */
export function soloDigitos(s: string | null | undefined): string | null {
  const d = (s ?? "").replace(/\D/g, "");
  return d || null;
}

/** «20123456789» → «20-12345678-9» para mostrar. */
export function formatearCuil(cuil: string | null): string | null {
  const d = soloDigitos(cuil);
  if (!d) return null;
  return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : d;
}

/** «12345678» → «12.345.678» para mostrar. */
export function formatearDni(dni: string | null): string | null {
  const d = soloDigitos(dni);
  if (!d) return null;
  return d.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Lo que trae Notion en «Género» (con valores basura de una IA vieja) → mujer/hombre o nada. */
export function generoDesdeTexto(s: string | null | undefined): "mujer" | "hombre" | null {
  const t = (s ?? "").trim().toLowerCase().replace(/^género:\s*/, "");
  if (t === "mujer") return "mujer";
  if (t === "hombre") return "hombre";
  return null;
}
