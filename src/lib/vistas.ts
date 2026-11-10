import { z } from "zod";

/**
 * Vistas guardadas (D5): los filtros de una página con nombre, como pestañas
 * estilo Notion. Lo puro: el formato de los filtros, aplicarlos a una fila y
 * saber si lo que se ve difiere de la vista elegida.
 */

export const PAGINAS_CON_VISTAS = ["oportunidades"] as const;
export type PaginaConVistas = (typeof PAGINAS_CON_VISTAS)[number];

/** El responsable «yo» se resuelve con quien mira; «sin» = sin asignar. */
export const RESPONSABLE_YO = "yo";
export const RESPONSABLE_SIN = "sin";

export const filtrosSchema = z
  .object({
    responsables: z.array(z.string().min(1).max(60)).max(50).optional(),
    edificios: z.array(z.string().min(1).max(60)).max(100).optional(),
    origenes: z.array(z.string().min(1).max(120)).max(100).optional(),
    estados: z.array(z.string().min(1).max(40)).max(20).optional(),
    tipologias: z.array(z.string().min(1).max(40)).max(20).optional(),
    paraCerrar: z.boolean().optional(),
  })
  .strict();

export type Filtros = z.infer<typeof filtrosSchema>;

export const ordenSchema = z
  .object({ columna: z.string().min(1).max(40), dir: z.enum(["asc", "desc"]) })
  .nullable();

export const vistaEntradaSchema = z.object({
  nombre: z.string().trim().min(1, "Poné un nombre").max(60),
  filtros: filtrosSchema.default({}),
  orden: ordenSchema.optional(),
  columnas: z.array(z.string().min(1).max(40)).max(40).nullable().optional(),
  anchos: z.record(z.string().max(40), z.number().int().min(40).max(2000)).nullable().optional(),
});

export type VistaDto = {
  id: string;
  nombre: string;
  /** Del equipo (la ven todos) o solo de quien la guardó. */
  compartida: boolean;
  filtros: Filtros;
  orden: { columna: string; dir: "asc" | "desc" } | null;
  /** Columnas ocultas. */
  columnas: string[] | null;
  anchos: Record<string, number> | null;
  /** Las de fábrica no se editan ni se borran. */
  deFabrica?: boolean;
};

/** Las pestañas que trae toda instancia. */
export const VISTAS_DE_FABRICA: VistaDto[] = [
  { id: "todas", nombre: "Todas", compartida: true, filtros: {}, orden: null, columnas: null, anchos: null, deFabrica: true },
  {
    id: "para-cerrar",
    nombre: "Para cerrar",
    compartida: true,
    filtros: { paraCerrar: true },
    orden: null,
    columnas: null,
    anchos: null,
    deFabrica: true,
  },
];

/** Lo que el filtro necesita de una oportunidad. */
export type FilaFiltrable = {
  estado: string;
  origen: string | null;
  edificioId: string | null;
  edificios: { id: string }[];
  /** 0047 — Unidades tipo de interés («1A»). */
  tipologiasUnidad: readonly string[];
  paraCerrar: boolean;
  responsableId?: string | null;
};

const vacio = (a: readonly unknown[] | undefined) => !a || a.length === 0;

export function cumpleFiltros(f: FilaFiltrable, filtros: Filtros, yo: string | null): boolean {
  if (filtros.paraCerrar && !f.paraCerrar) return false;
  if (!vacio(filtros.estados) && !filtros.estados!.includes(f.estado)) return false;
  if (!vacio(filtros.origenes) && !filtros.origenes!.includes(f.origen ?? "")) return false;
  if (!vacio(filtros.edificios)) {
    const ids = f.edificios.length ? f.edificios.map((e) => e.id) : f.edificioId ? [f.edificioId] : [];
    if (!ids.some((id) => filtros.edificios!.includes(id))) return false;
  }
  if (!vacio(filtros.tipologias) && !f.tipologiasUnidad.some((t) => filtros.tipologias!.includes(t))) return false;
  if (!vacio(filtros.responsables)) {
    const quien = f.responsableId ?? null;
    const ok = filtros.responsables!.some((r) =>
      r === RESPONSABLE_SIN ? quien === null : r === RESPONSABLE_YO ? quien !== null && quien === yo : quien === r
    );
    if (!ok) return false;
  }
  return true;
}

/** Sin claves vacías, para comparar y guardar. */
export function limpiarFiltros(f: Filtros): Filtros {
  const out: Filtros = {};
  for (const [k, v] of Object.entries(f) as [keyof Filtros, unknown][]) {
    if (Array.isArray(v) ? v.length > 0 : v === true) (out as Record<string, unknown>)[k] = Array.isArray(v) ? [...v].sort() : v;
  }
  return out;
}

const ordenado = (o: Record<string, unknown> | null | undefined) =>
  JSON.stringify(o ? Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b))) : null);

/** ¿Lo que se ve es distinto de la vista? (filtros, orden, columnas ocultas y anchos) */
export function difiereDe(
  vista: Pick<VistaDto, "filtros" | "orden" | "columnas" | "anchos">,
  actual: Pick<VistaDto, "filtros" | "orden" | "columnas" | "anchos">
): boolean {
  if (ordenado(limpiarFiltros(vista.filtros)) !== ordenado(limpiarFiltros(actual.filtros))) return true;
  if (JSON.stringify(vista.orden ?? null) !== JSON.stringify(actual.orden ?? null)) return true;
  const cols = (c: string[] | null) => JSON.stringify(c ? [...c].sort() : null);
  if (vista.columnas !== null && cols(vista.columnas) !== cols(actual.columnas)) return true;
  if (vista.anchos !== null && ordenado(vista.anchos) !== ordenado(actual.anchos)) return true;
  return false;
}
