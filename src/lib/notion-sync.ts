import type { EstadoOportunidad } from "@/lib/ventas";

/**
 * War — Lo puro de la sincronización Notion → CRM: leer las propiedades de
 * una página de la API de Notion y las reglas de «gana lo más reciente».
 * Sin base ni red: se prueba sola (`tests/unit/war-notion-sync.test.ts`).
 */

/** Una página tal como la devuelve la API (`/v1/data_sources/{id}/query`). */
export type PaginaNotion = {
  id: string;
  created_time: string;
  last_edited_time: string;
  archived?: boolean;
  in_trash?: boolean;
  properties: Record<string, PropiedadNotion>;
};

export type PropiedadNotion = { type: string } & Record<string, unknown>;

/** Sin guiones: así se guarda la clave (`pagina:<id>`). */
export const idPlano = (id: string): string => id.replace(/-/g, "").toLowerCase();

/** Las claves con las que una página pudo quedar anotada. */
export function clavesDePagina(id: string): string[] {
  const plano = idPlano(id);
  const conGuiones = plano.length === 32
    ? `${plano.slice(0, 8)}-${plano.slice(8, 12)}-${plano.slice(12, 16)}-${plano.slice(16, 20)}-${plano.slice(20)}`
    : plano;
  return [...new Set([`pagina:${plano}`, plano, conGuiones])];
}

function textoDe(partes: unknown): string | null {
  if (!Array.isArray(partes)) return null;
  const t = partes
    .map((p) => (p && typeof p === "object" && "plain_text" in p ? String((p as { plain_text: unknown }).plain_text ?? "") : ""))
    .join("")
    .trim();
  return t || null;
}

/** El valor de una propiedad, en texto (título, texto, selección, estado, teléfono, correo, número). */
export function texto(p: PropiedadNotion | undefined): string | null {
  if (!p) return null;
  switch (p.type) {
    case "title":
      return textoDe(p.title);
    case "rich_text":
      return textoDe(p.rich_text);
    case "select":
    case "status": {
      const v = p[p.type] as { name?: string } | null;
      return v?.name?.trim() || null;
    }
    case "phone_number":
    case "email":
    case "url": {
      const v = p[p.type];
      return typeof v === "string" && v.trim() ? v.trim() : null;
    }
    case "number": {
      const v = p.number;
      return typeof v === "number" ? String(v) : null;
    }
    case "formula": {
      const f = p.formula as { type?: string; string?: string | null; number?: number | null } | null;
      if (f?.type === "string") return f.string?.trim() || null;
      if (f?.type === "number" && typeof f.number === "number") return String(f.number);
      return null;
    }
    default:
      return null;
  }
}

export function numero(p: PropiedadNotion | undefined): number | null {
  return p?.type === "number" && typeof p.number === "number" ? p.number : null;
}

export function fecha(p: PropiedadNotion | undefined): string | null {
  if (!p) return null;
  if (p.type === "date") return (p.date as { start?: string } | null)?.start ?? null;
  if (p.type === "created_time" || p.type === "last_edited_time") {
    const v = p[p.type];
    return typeof v === "string" ? v : null;
  }
  return null;
}

export function relacion(p: PropiedadNotion | undefined): string[] {
  if (p?.type !== "relation" || !Array.isArray(p.relation)) return [];
  return (p.relation as { id?: string }[]).map((r) => (r.id ? idPlano(r.id) : "")).filter(Boolean);
}

/** Personas: ids y, si la integración puede ver usuarios, sus nombres. */
export function personas(p: PropiedadNotion | undefined): { id: string; nombre: string | null }[] {
  if (p?.type !== "people" || !Array.isArray(p.people)) return [];
  return (p.people as { id?: string; name?: string | null }[])
    .filter((u) => u.id)
    .map((u) => ({ id: u.id!, nombre: u.name?.trim() || null }));
}

export function casilla(p: PropiedadNotion | undefined): boolean {
  return p?.type === "checkbox" && p.checkbox === true;
}

/** La fecha de Notion (ISO, a veces solo el día) a un instante. */
export function instante(s: string | null | undefined): Date | null {
  if (!s) return null;
  // Un día solo («2026-11-20») es en la zona del negocio, no en UTC.
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T12:00:00-03:00` : s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/* ------------------------------------------------------------------
 * Catálogos
 * ------------------------------------------------------------------ */

const plano = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** «No responde» no es una etapa del CRM: es la cuenta de intentos (`intentos_sin_respuesta`). */
export type EstadoNotion = EstadoOportunidad | "no_responde";

const ESTADOS: Record<string, EstadoNotion> = {
  recibido: "recibido",
  "no responde": "no_responde",
  "en charlas": "en_charlas",
  "conoce informacion": "conoce_informacion",
  visito: "visito",
  reservo: "reservo",
  compro: "compro",
  "no calificado": "no_calificado",
  perdido: "perdido",
};

export function estadoDeNotion(s: string | null): EstadoNotion | null {
  return s ? (ESTADOS[plano(s)] ?? null) : null;
}

export function tipoOportunidadDeNotion(s: string | null): "venta" | "alquiler" | "inmobiliaria" | null {
  const t = s ? plano(s) : "";
  return t === "venta" || t === "alquiler" || t === "inmobiliaria" ? t : null;
}

export type TipoTareaNotion = "llamada" | "visita" | "mensaje" | "reunion" | "correo";

export function tipoTareaDeNotion(s: string | null): TipoTareaNotion | null {
  const t = s ? plano(s) : "";
  if (t === "llamada" || t === "visita" || t === "mensaje" || t === "reunion" || t === "correo") return t;
  return null;
}

export type EstadoTareaNotion = "realizar" | "no_responde" | "listo" | "eliminar";

export function estadoTareaDeNotion(s: string | null): EstadoTareaNotion | null {
  const t = s ? plano(s) : "";
  if (t === "realizar") return "realizar";
  if (t === "no responde") return "no_responde";
  if (t === "listo") return "listo";
  if (t === "eliminar") return "eliminar";
  return null;
}

/** Tipo de contacto de Notion → la lista del contacto (v4). */
export function tipoContactoDeNotion(s: string | null): string | null {
  const t = s ? plano(s) : "";
  if (t === "cliente") return "cliente";
  if (t === "inmobiliaria") return "inmobiliaria";
  if (t === "proveedor") return "proveedor";
  return null;
}

/** El estado de una tarea del CRM ↔ el de una cita de la Agenda. */
export const ESTADO_CITA: Record<"realizar" | "no_responde" | "listo", "agendada" | "realizada" | "no_show"> = {
  realizar: "agendada",
  listo: "realizada",
  no_responde: "no_show",
};

/* ------------------------------------------------------------------
 * Gana lo más reciente
 * ------------------------------------------------------------------ */

/**
 * ¿Lo de Notion es más nuevo que lo último que pasó en el CRM? Sin cambio
 * en el CRM (null) gana Notion. Igualdad: no se toca (ya se aplicó).
 */
export function ganaNotion(notionAt: Date | null, crmAt: Date | null): boolean {
  if (!notionAt) return false;
  if (!crmAt) return true;
  return notionAt.getTime() > crmAt.getTime();
}

/** Mismo título: sin mayúsculas, tildes ni espacios de más. */
export function mismoTitulo(a: string | null | undefined, b: string | null | undefined): boolean {
  const n = (s: string | null | undefined) => plano(s ?? "").replace(/\s+/g, " ");
  return n(a) === n(b);
}

/** Misma fecha de tarea: al minuto, o las dos sin fecha. */
export function mismaFecha(a: Date | null, b: Date | null): boolean {
  if (!a || !b) return !a && !b;
  return Math.abs(a.getTime() - b.getTime()) < 60_000;
}
