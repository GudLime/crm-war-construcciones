/**
 * Cambios 23/11, punto 8 — La lista de Contactos paginada: los parámetros que
 * entiende `GET /api/contacts?pagina=…` y cómo se leen (lo inválido se ignora).
 */
export const POR_PAGINA_CONTACTOS = 50;

export const ORDENES_CONTACTO = ["nombre", "telefono", "creado"] as const;
export type OrdenContacto = (typeof ORDENES_CONTACTO)[number];

const FUENTES = ["anuncio", "organico", "referido", "conocido", "otro", "desconocida"] as const;
export type FuenteFiltro = (typeof FUENTES)[number];
const TIPOS = ["lead", "comprador", "inmobiliaria", "proveedor", "propio", "sin"] as const;
export type TipoFiltro = (typeof TIPOS)[number];

export type FiltrosContactos = {
  pagina: number;
  porPagina: number;
  tipo: TipoFiltro | null;
  fuente: FuenteFiltro | null;
  agente: "con" | "sin" | null;
  archivados: boolean;
  orden: OrdenContacto;
  dir: "asc" | "desc";
};

const de = <T extends string>(lista: readonly T[], v: string | null): T | null =>
  v && (lista as readonly string[]).includes(v) ? (v as T) : null;

export function filtrosContactos(p: URLSearchParams): FiltrosContactos {
  const pagina = Math.max(1, Math.min(10_000, Number.parseInt(p.get("pagina") ?? "1", 10) || 1));
  const porPagina = Math.max(10, Math.min(200, Number.parseInt(p.get("porPagina") ?? "", 10) || POR_PAGINA_CONTACTOS));
  const [orden, dir] = (p.get("orden") ?? "").split(":");
  return {
    pagina,
    porPagina,
    tipo: de(TIPOS, p.get("tipo")),
    fuente: de(FUENTES, p.get("fuente")),
    agente: de(["con", "sin"] as const, p.get("agente")),
    archivados: p.get("archivados") === "solo",
    orden: de(ORDENES_CONTACTO, orden ?? null) ?? "nombre",
    dir: dir === "desc" ? "desc" : "asc",
  };
}

/** «Mostrando 1–50 de 1.284». */
export function rangoMostrado(pagina: number, porPagina: number, total: number): string {
  if (total === 0) return "Sin contactos";
  const desde = (pagina - 1) * porPagina + 1;
  const hasta = Math.min(total, pagina * porPagina);
  const n = (x: number) => x.toLocaleString("es-AR");
  return `Mostrando ${n(desde)}–${n(hasta)} de ${n(total)} contactos`;
}

/** Los números de página a mostrar: 1 … 4 5 6 … 26. */
export function paginasVisibles(actual: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set([1, total, actual - 1, actual, actual + 1].filter((x) => x >= 1 && x <= total));
  const orden = [...set].sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  orden.forEach((x, i) => {
    if (i > 0 && x - orden[i - 1]! > 1) out.push("…");
    out.push(x);
  });
  return out;
}
