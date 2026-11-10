/**
 * El color de cada edificio: una paleta fija (punto, fondo y texto) para sus
 * píldoras en la oportunidad, la lista y las tareas. Sin verdes: se confunden
 * con el color de marca y con el avance.
 */

export const COLORES_EDIFICIO = {
  violeta: { nombre: "Violeta", punto: "#7c3aed", fondo: "#ede9fe", texto: "#5b21b6" },
  naranja: { nombre: "Naranja", punto: "#ea580c", fondo: "#ffedd5", texto: "#9a3412" },
  azul: { nombre: "Azul", punto: "#2563eb", fondo: "#dbeafe", texto: "#1e40af" },
  rosa: { nombre: "Rosa", punto: "#db2777", fondo: "#fce7f3", texto: "#9d174d" },
  cian: { nombre: "Cian", punto: "#0891b2", fondo: "#cffafe", texto: "#155e75" },
  ambar: { nombre: "Ámbar", punto: "#d97706", fondo: "#fef3c7", texto: "#92400e" },
} as const;

export type ColorEdificio = keyof typeof COLORES_EDIFICIO;

export const VALORES_COLOR_EDIFICIO = Object.keys(COLORES_EDIFICIO) as ColorEdificio[];

const NEUTRO = { nombre: "Sin color", punto: "#94a3b8", fondo: "#f1f5f9", texto: "#334155" };

export function tonoDeEdificio(color: string | null | undefined) {
  return (color && COLORES_EDIFICIO[color as ColorEdificio]) || NEUTRO;
}

/** El color para un edificio nuevo: el menos usado, en el orden de la paleta. */
export function siguienteColor(usados: readonly (string | null)[]): ColorEdificio {
  const cuenta = new Map<ColorEdificio, number>(VALORES_COLOR_EDIFICIO.map((c) => [c, 0]));
  for (const u of usados) if (u && cuenta.has(u as ColorEdificio)) cuenta.set(u as ColorEdificio, cuenta.get(u as ColorEdificio)! + 1);
  let mejor = VALORES_COLOR_EDIFICIO[0]!;
  for (const c of VALORES_COLOR_EDIFICIO) if (cuenta.get(c)! < cuenta.get(mejor)!) mejor = c;
  return mejor;
}
