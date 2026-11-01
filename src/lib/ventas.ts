/**
 * Vocabulario de Ventas de la constructora. Vive en `lib/` para que la
 * pantalla y la API hablen de los mismos valores sin arrastrar la base.
 *
 * Los metros totales no se persisten: se calculan. Así un departamento no
 * puede mostrar un total que no cierre con sus tres superficies.
 */

export const ESTADOS_EDIFICIO = [
  { value: "en_construccion", label: "En construcción" },
  { value: "terminado", label: "Terminado" },
  { value: "en_pozo", label: "En pozo" },
  { value: "a_construir", label: "A construir" },
] as const;

export const ESTADOS_UNIDAD = [
  { value: "disponible", label: "Disponible" },
  { value: "consultar", label: "Consultar disponibilidad" },
  { value: "reservado", label: "Reservado" },
  { value: "vendido", label: "Vendido" },
] as const;

export const TIPOLOGIAS = [
  { value: "1_ambiente", label: "1 ambiente" },
  { value: "2_ambientes", label: "2 ambientes" },
  { value: "3_ambientes", label: "3 ambientes" },
  { value: "4_ambientes", label: "4 ambientes" },
  { value: "triplex", label: "Triplex" },
] as const;

/** Origen de la oportunidad: las fuentes del tablero de Notion. */
export const ORIGENES_OPORTUNIDAD = [
  "Newsletter",
  "MercadoLibre",
  "Argenprop",
  "Zonaprop",
  "Página Web",
  "Google Ads",
  "Referido",
  "Cartel",
  "Meta Ads",
  "Facebook",
  "Instagram",
  "Cartel Showroom",
  "Inmobiliaria",
  "Google",
  "Mail",
  "Tik Tok",
] as const;

export const ESTADOS_OPORTUNIDAD = [
  { value: "recibido", label: "Recibido" },
  { value: "no_responde", label: "No responde" },
  { value: "en_charlas", label: "En charlas" },
  { value: "conoce_informacion", label: "Conoce información" },
  { value: "visito", label: "Visitó" },
  { value: "reservo", label: "Reservó" },
  { value: "compro", label: "Compró" },
  { value: "no_calificado", label: "No calificado" },
  { value: "perdido", label: "Perdido" },
] as const;

export const TIPOS_OPORTUNIDAD = [
  { value: "venta", label: "Venta" },
  { value: "alquiler", label: "Alquiler" },
  { value: "inmobiliaria", label: "Inmobiliaria" },
] as const;

export const MOTIVOS_CIERRE = [
  "Compró",
  "Compró en otro lado",
  "Compró con una inmobiliaria",
  "Presupuesto insuficiente",
  "Busca menos metros",
  "Busca más metros",
  "Busca de pozo",
  "Busca terminado",
  "No le gusta la zona",
  "No tenemos disponibilidad",
  "No tenemos el producto que busca",
  "No responde",
  "Solo pidió info",
  "Pausó la búsqueda",
  "Depende de la venta",
] as const;

/** Lo que una persona del equipo hace a mano. La IA no crea ni cierra estas. */
export const TIPOS_TAREA = [
  { value: "llamada", label: "Llamada" },
  { value: "visita", label: "Visita" },
  { value: "mensaje", label: "Mensaje" },
  { value: "reunion", label: "Reunión" },
  { value: "correo", label: "Correo" },
] as const;

export const ESTADOS_TAREA = [
  { value: "realizar", label: "Realizar" },
  { value: "no_responde", label: "No responde" },
  { value: "listo", label: "Listo" },
] as const;

export type EstadoEdificio = (typeof ESTADOS_EDIFICIO)[number]["value"];
export type EstadoUnidad = (typeof ESTADOS_UNIDAD)[number]["value"];
export type Tipologia = (typeof TIPOLOGIAS)[number]["value"];
export type OrigenOportunidad = (typeof ORIGENES_OPORTUNIDAD)[number];
export type EstadoOportunidad = (typeof ESTADOS_OPORTUNIDAD)[number]["value"];
export type TipoOportunidad = (typeof TIPOS_OPORTUNIDAD)[number]["value"];
export type TipoTarea = (typeof TIPOS_TAREA)[number]["value"];
export type EstadoTarea = (typeof ESTADOS_TAREA)[number]["value"];

const valores = <T extends readonly { value: string }[] | readonly string[]>(opciones: T) =>
  opciones.map((o) => (typeof o === "string" ? o : o.value));

export const VALORES_ESTADO_EDIFICIO = valores(ESTADOS_EDIFICIO);
export const VALORES_ESTADO_UNIDAD = valores(ESTADOS_UNIDAD);
export const VALORES_TIPOLOGIA = valores(TIPOLOGIAS);
export const VALORES_ORIGEN = valores(ORIGENES_OPORTUNIDAD);
export const VALORES_ESTADO_OPORTUNIDAD = valores(ESTADOS_OPORTUNIDAD);
export const VALORES_TIPO_OPORTUNIDAD = valores(TIPOS_OPORTUNIDAD);
export const VALORES_MOTIVO = valores(MOTIVOS_CIERRE);
export const VALORES_TIPO_TAREA = valores(TIPOS_TAREA);
export const VALORES_ESTADO_TAREA = valores(ESTADOS_TAREA);

export function etiqueta(
  opciones: readonly { value: string; label: string }[],
  value: string | null | undefined
): string {
  if (!value) return "—";
  return opciones.find((o) => o.value === value)?.label ?? value;
}

export type Superficies = {
  cubiertos: number | null;
  semicubiertos: number | null;
  descubiertos: number | null;
};

/** Suma las superficies cargadas. Sin ninguna, no hay total (no es cero). */
export function metrosTotales(m: Superficies): number | null {
  const partes = [m.cubiertos, m.semicubiertos, m.descubiertos].filter(
    (n): n is number => n != null && Number.isFinite(n)
  );
  if (partes.length === 0) return null;
  const suma = partes.reduce((a, b) => a + b, 0);
  return Math.round(suma * 100) / 100;
}

/**
 * El interés de una oportunidad es un edificio, un departamento, o ninguno.
 * Si hay departamento, el edificio es el suyo: no se puede interesar en una
 * unidad de otro edificio.
 */
export function resolverInteres(input: {
  edificioId: string | null;
  departamento: { id: string; edificioId: string } | null;
}): { ok: true; edificioId: string | null; departamentoId: string | null } | { ok: false; error: string } {
  if (input.departamento) {
    if (input.edificioId && input.edificioId !== input.departamento.edificioId) {
      return { ok: false, error: "El departamento no pertenece a ese edificio" };
    }
    return {
      ok: true,
      edificioId: input.departamento.edificioId,
      departamentoId: input.departamento.id,
    };
  }
  return { ok: true, edificioId: input.edificioId, departamentoId: null };
}

export function metrosTexto(n: number | null): string {
  if (n == null) return "—";
  return `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(n)} m²`;
}
