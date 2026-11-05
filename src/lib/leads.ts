import { ORIGENES_OPORTUNIDAD } from "@/lib/ventas";

/**
 * War — Reglas puras de los leads que llegan por Make (formularios de Meta,
 * portales). Sin base de datos, para poder probarlas como tabla.
 */

export type OrigenOportunidad = (typeof ORIGENES_OPORTUNIDAD)[number];

function plano(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

/** "meta ads", "META_ADS", "Meta Ads" → "Meta Ads". Lo que no está en la lista: null. */
export function origenCanonico(raw: string | null | undefined): OrigenOportunidad | null {
  if (!raw) return null;
  const buscado = plano(raw);
  if (!buscado) return null;
  return ORIGENES_OPORTUNIDAD.find((o) => plano(o) === buscado) ?? null;
}

const ORIGENES_DE_ANUNCIO: readonly OrigenOportunidad[] = [
  "Meta Ads",
  "Google Ads",
  "Facebook",
  "Instagram",
  "Tik Tok",
];

/** La fuente del contacto (`contact.source`) que corresponde a un origen. */
export function fuenteDelContacto(origen: OrigenOportunidad): "anuncio" | "referido" | "otro" {
  if (ORIGENES_DE_ANUNCIO.includes(origen)) return "anuncio";
  if (origen === "Referido") return "referido";
  return "otro";
}

export type OportunidadAbierta = {
  id: string;
  /** Edificios de interés de la oportunidad. */
  edificioIds: readonly string[];
};

/**
 * ¿A qué oportunidad abierta se suma un lead nuevo? `abiertas` viene de la
 * más reciente a la más vieja.
 *
 * - Con edificio: a la abierta de ESE edificio. Si no hay, a una abierta que
 *   todavía no tenga edificio (la que abrió el WhatsApp que llegó antes que
 *   el formulario). Si tampoco, ninguna: se abre una nueva.
 * - Sin edificio: a la abierta más reciente, si hay.
 */
export function oportunidadParaElLead(
  abiertas: readonly OportunidadAbierta[],
  edificioId: string | null
): string | null {
  if (!edificioId) return abiertas[0]?.id ?? null;
  const mismoEdificio = abiertas.find((o) => o.edificioIds.includes(edificioId));
  if (mismoEdificio) return mismoEdificio.id;
  const sinEdificio = abiertas.find((o) => o.edificioIds.length === 0);
  return sinEdificio?.id ?? null;
}

/** "Juan", "Pérez", "Juan Pérez" → el nombre a mostrar. */
export function nombreDelLead(input: {
  nombreCompleto?: string | null;
  nombre?: string | null;
  apellido?: string | null;
}): string | null {
  const completo = input.nombreCompleto?.replace(/\s+/g, " ").trim();
  if (completo) return completo.slice(0, 120);
  const partes = [input.nombre, input.apellido]
    .map((p) => p?.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return partes.length ? partes.join(" ").slice(0, 120) : null;
}
