/**
 * El color de cada edificio: una paleta (punto, fondo y texto) para sus
 * píldoras en la oportunidad, la lista y las tareas, o un color propio
 * (`#rrggbb`, del selector) del que se sacan el fondo claro y el texto oscuro.
 * La paleta no trae verdes plenos: se confunden con el avance (lima sí).
 */

export const COLORES_EDIFICIO = {
  violeta: { nombre: "Violeta", punto: "#7c3aed", fondo: "#ede9fe", texto: "#5b21b6" },
  naranja: { nombre: "Naranja", punto: "#ea580c", fondo: "#ffedd5", texto: "#9a3412" },
  azul: { nombre: "Azul", punto: "#2563eb", fondo: "#dbeafe", texto: "#1e40af" },
  rosa: { nombre: "Rosa", punto: "#db2777", fondo: "#fce7f3", texto: "#9d174d" },
  cian: { nombre: "Cian", punto: "#0891b2", fondo: "#cffafe", texto: "#155e75" },
  ambar: { nombre: "Ámbar", punto: "#d97706", fondo: "#fef3c7", texto: "#92400e" },
  rojo: { nombre: "Rojo", punto: "#dc2626", fondo: "#fee2e2", texto: "#991b1b" },
  indigo: { nombre: "Índigo", punto: "#4f46e5", fondo: "#e0e7ff", texto: "#3730a3" },
  turquesa: { nombre: "Turquesa", punto: "#0d9488", fondo: "#ccfbf1", texto: "#115e59" },
  fucsia: { nombre: "Fucsia", punto: "#c026d3", fondo: "#fae8ff", texto: "#86198f" },
  celeste: { nombre: "Celeste", punto: "#0284c7", fondo: "#e0f2fe", texto: "#075985" },
  amarillo: { nombre: "Amarillo", punto: "#ca8a04", fondo: "#fef9c3", texto: "#854d0e" },
  frambuesa: { nombre: "Frambuesa", punto: "#e11d48", fondo: "#ffe4e6", texto: "#9f1239" },
  lima: { nombre: "Lima", punto: "#65a30d", fondo: "#ecfccb", texto: "#3f6212" },
  marron: { nombre: "Marrón", punto: "#8b5e3c", fondo: "#f3e8dd", texto: "#5c3a1e" },
  pizarra: { nombre: "Gris oscuro", punto: "#475569", fondo: "#e2e8f0", texto: "#1e293b" },
} as const;

export type ColorEdificio = keyof typeof COLORES_EDIFICIO;

export const VALORES_COLOR_EDIFICIO = Object.keys(COLORES_EDIFICIO) as ColorEdificio[];

const NEUTRO: Tono = { nombre: "Sin color", punto: "#94a3b8", fondo: "#f1f5f9", texto: "#334155" };

/** Un color propio: `#rrggbb` (se guarda en minúsculas). */
export const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export type Tono = { nombre: string; punto: string; fondo: string; texto: string };

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const aHex = (c: readonly number[]) => `#${c.map((x) => Math.round(x).toString(16).padStart(2, "0")).join("")}`;
/** Mezcla `hex` con `hacia` en la proporción `p` (0 = el color, 1 = `hacia`). */
const mezclar = (hex: string, hacia: number, p: number) => aHex(rgb(hex).map((x) => x + (hacia - x) * p));

/** El tono de un color propio: el punto tal cual, el fondo casi blanco y el texto oscurecido. */
export function tonoDeHex(hex: string): Tono {
  const punto = hex.toLowerCase();
  return { nombre: punto, punto, fondo: mezclar(punto, 255, 0.86), texto: mezclar(punto, 0, 0.45) };
}

/** Matiz en grados (0–360) y saturación (0–1). */
function matiz(hex: string): { h: number; s: number } {
  const [r, g, b] = rgb(hex).map((x) => x / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return { h: 0, s: 0 };
  const l = (max + min) / 2;
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s };
}

/** Un verde claro (como el del avance): se avisa al elegirlo, no se prohíbe. */
export function esVerdoso(hex: string): boolean {
  if (!HEX_COLOR.test(hex)) return false;
  const { h, s } = matiz(hex);
  return s > 0.25 && h >= 95 && h <= 165;
}

export function tonoDeEdificio(color: string | null | undefined): Tono {
  if (!color) return NEUTRO;
  if (HEX_COLOR.test(color)) return tonoDeHex(color);
  return COLORES_EDIFICIO[color as ColorEdificio] ?? NEUTRO;
}

/** Lo que se puede guardar: una clave de la paleta o un `#rrggbb`. */
export function colorValido(color: string): boolean {
  return HEX_COLOR.test(color) || color in COLORES_EDIFICIO;
}

/** El color para un edificio nuevo: el menos usado, en el orden de la paleta. */
export function siguienteColor(usados: readonly (string | null)[]): ColorEdificio {
  const cuenta = new Map<ColorEdificio, number>(VALORES_COLOR_EDIFICIO.map((c) => [c, 0]));
  for (const u of usados) if (u && cuenta.has(u as ColorEdificio)) cuenta.set(u as ColorEdificio, cuenta.get(u as ColorEdificio)! + 1);
  let mejor = VALORES_COLOR_EDIFICIO[0]!;
  for (const c of VALORES_COLOR_EDIFICIO) if (cuenta.get(c)! < cuenta.get(mejor)!) mejor = c;
  return mejor;
}
