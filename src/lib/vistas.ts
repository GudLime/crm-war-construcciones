import { z } from "zod";
import { situacionDe, type EstadoOportunidad } from "@/lib/ventas";

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
    /** 0047 — Ya no filtra (las tipologías pasaron a Unidades); se acepta para no romper vistas guardadas. */
    tipologias: z.array(z.string().min(1).max(40)).max(20).optional(),
    /** 0049 — Unidades de interés (ids). */
    unidades: z.array(z.string().min(1).max(60)).max(50).optional(),
    paraCerrar: z.boolean().optional(),
    /** Inicio — asignadas y todavía sin primer contacto. */
    sinPrimerContacto: z.boolean().optional(),
    /** Abiertas (Recibido…Visitó) o cerradas (Reservó, Compró, Perdido, No calificado). */
    situacion: z.enum(["abiertas", "cerradas"]).optional(),
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

const deFabrica = (id: string, nombre: string, filtros: Filtros): VistaDto => ({
  id,
  nombre,
  compartida: true,
  filtros,
  orden: null,
  columnas: null,
  anchos: null,
  deFabrica: true,
});

/** Las pestañas que trae toda instancia. La primera es la que se abre por defecto. */
export const VISTAS_DE_FABRICA: VistaDto[] = [
  deFabrica("abiertas", "Abiertas", { situacion: "abiertas" }),
  deFabrica("cerradas", "Cerradas", { situacion: "cerradas" }),
  deFabrica("para-cerrar", "Para cerrar", { situacion: "abiertas", paraCerrar: true }),
  deFabrica("todas", "Todas", {}),
];

/**
 * Las pestañas de fábrica según quién mira. Un admin ve todo, así que por
 * defecto arranca con lo suyo y lo sin asignar (para no perder leads nuevos);
 * «Todas» sigue mostrando las de todo el equipo. Un operador ya recibe solo lo
 * suyo del servidor: sus pestañas no filtran por responsable.
 */
export function vistasDeFabrica(admin: boolean): VistaDto[] {
  if (!admin) return VISTAS_DE_FABRICA;
  return VISTAS_DE_FABRICA.map((v) =>
    v.id === "todas" ? v : { ...v, filtros: { ...v.filtros, responsables: [RESPONSABLE_YO, RESPONSABLE_SIN] } }
  );
}

/**
 * Inicio — Filtros temporales que llegan por el link (`/oportunidades?responsable=yo&estado=visito`).
 * Se aplican como «Cambios sin guardar»: no pisan la última vista de la persona.
 * Sin ninguno reconocido, null. Por defecto miran las abiertas.
 */
export function filtrosDeLaUrl(params: URLSearchParams): Filtros | null {
  const lista = (clave: string) =>
    (params.get(clave) ?? "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  const si = (clave: string) => params.get(clave) === "1" || params.get(clave) === "true";
  const f: Filtros = {};
  const responsables = lista("responsable").map((r) => (r === "me" ? RESPONSABLE_YO : r));
  if (responsables.length) f.responsables = responsables.slice(0, 50);
  const estados = lista("estado");
  if (estados.length) f.estados = estados.slice(0, 20);
  const edificios = lista("edificio");
  if (edificios.length) f.edificios = edificios.slice(0, 100);
  const origenes = lista("origen");
  if (origenes.length) f.origenes = origenes.slice(0, 100);
  if (si("sinPrimerContacto")) f.sinPrimerContacto = true;
  if (si("paraCerrar")) f.paraCerrar = true;
  if (Object.keys(f).length === 0 && !params.has("situacion")) return null;
  const situacion = params.get("situacion");
  if (situacion !== "todas") f.situacion = situacion === "cerradas" ? "cerradas" : "abiertas";
  const ok = filtrosSchema.safeParse(f);
  return ok.success ? ok.data : null;
}

/** Qué hay que pedirle al servidor para una vista: solo abiertas, solo cerradas o todas. */
export function situacionACargar(filtros: Filtros): "abiertas" | "cerradas" | "todas" {
  return filtros.situacion ?? "todas";
}

/** Lo que el filtro necesita de una oportunidad. */
export type FilaFiltrable = {
  estado: EstadoOportunidad;
  origen: string | null;
  edificioId: string | null;
  edificios: { id: string }[];
  /** 0049 — Unidades de interés. */
  unidades: readonly { id: string }[];
  paraCerrar: boolean;
  responsableId?: string | null;
  /** Inicio — cuándo se le escribió por primera vez (ISO), o null. */
  primerContactoAt?: string | null;
};

const vacio = (a: readonly unknown[] | undefined) => !a || a.length === 0;

export function cumpleFiltros(f: FilaFiltrable, filtros: Filtros, yo: string | null): boolean {
  if (filtros.situacion && situacionDe(f.estado) !== filtros.situacion) return false;
  if (filtros.paraCerrar && !f.paraCerrar) return false;
  if (filtros.sinPrimerContacto && f.primerContactoAt) return false;
  if (!vacio(filtros.estados) && !filtros.estados!.includes(f.estado)) return false;
  if (!vacio(filtros.origenes) && !filtros.origenes!.includes(f.origen ?? "")) return false;
  if (!vacio(filtros.edificios)) {
    const ids = f.edificios.length ? f.edificios.map((e) => e.id) : f.edificioId ? [f.edificioId] : [];
    if (!ids.some((id) => filtros.edificios!.includes(id))) return false;
  }
  if (!vacio(filtros.unidades) && !f.unidades.some((u) => filtros.unidades!.includes(u.id))) return false;
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
    if (Array.isArray(v) ? v.length > 0 : v === true || typeof v === "string") {
      (out as Record<string, unknown>)[k] = Array.isArray(v) ? [...v].sort() : v;
    }
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
