import type { PaginaNotion } from "@/lib/notion-sync";

/**
 * War — Cliente mínimo de la API de Notion (solo lectura). La llave es
 * `NOTION_TOKEN` (una integración interna con «Read content»); nunca sale a
 * los logs. Respeta el límite de Notion (~3 pedidos por segundo) y reintenta
 * los 429 y 5xx. Un fallo de Notion jamás toca la operación del CRM: la
 * sincronización se corta y queda para la próxima.
 */

const BASE = "https://api.notion.com/v1";
const VERSION = "2025-09-03";
const PAUSA_MS = 340;
const INTENTOS = 5;

export class NotionError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

export function tokenNotion(): string | null {
  const t = process.env.NOTION_TOKEN?.trim();
  return t && t.length >= 20 && !t.startsWith("REEMPLAZA") ? t : null;
}

let ultimo = 0;
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function pedir<T>(ruta: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = tokenNotion();
  if (!token) throw new NotionError("Falta NOTION_TOKEN", 0);
  for (let intento = 1; ; intento++) {
    const espera = ultimo + PAUSA_MS - Date.now();
    if (espera > 0) await esperar(espera);
    ultimo = Date.now();
    let r: Response;
    try {
      r = await fetch(`${BASE}${ruta}`, {
        method: init.method ?? "GET",
        headers: {
          authorization: `Bearer ${token}`,
          "notion-version": VERSION,
          "content-type": "application/json",
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      if (intento >= INTENTOS) throw new NotionError(`Notion no respondió: ${err instanceof Error ? err.message : err}`, 0);
      await esperar(1000 * intento);
      continue;
    }
    if (r.ok) return (await r.json()) as T;
    if ((r.status === 429 || r.status >= 500) && intento < INTENTOS) {
      const tras = Number(r.headers.get("retry-after"));
      await esperar(Number.isFinite(tras) && tras > 0 ? tras * 1000 : 1500 * intento);
      continue;
    }
    const detalle = await r.text().catch(() => "");
    let mensaje = detalle.slice(0, 300);
    try {
      mensaje = (JSON.parse(detalle) as { message?: string }).message ?? mensaje;
    } catch {
      // texto plano
    }
    throw new NotionError(`Notion ${r.status} en ${ruta.split("?")[0]}: ${mensaje}`, r.status);
  }
}

type Respuesta = { results: PaginaNotion[]; has_more: boolean; next_cursor: string | null };

/** Todas las páginas de una base (data source), con un filtro opcional. */
export async function consultarBase(dataSourceId: string, filter?: unknown): Promise<PaginaNotion[]> {
  const todas: PaginaNotion[] = [];
  let cursor: string | null = null;
  do {
    const body: Record<string, unknown> = { page_size: 100 };
    if (filter) body.filter = filter;
    if (cursor) body.start_cursor = cursor;
    const r: Respuesta = await pedir<Respuesta>(`/data_sources/${dataSourceId}/query`, { method: "POST", body });
    todas.push(...r.results.filter((p) => !p.archived && !p.in_trash));
    cursor = r.has_more ? r.next_cursor : null;
  } while (cursor);
  return todas;
}

/** Las editadas desde una fecha. */
export function editadasDesde(dataSourceId: string, desde: Date): Promise<PaginaNotion[]> {
  return consultarBase(dataSourceId, {
    timestamp: "last_edited_time",
    last_edited_time: { on_or_after: desde.toISOString() },
  });
}

/** Una página suelta; null si no existe o la integración no la ve. */
export async function leerPagina(id: string): Promise<PaginaNotion | null> {
  try {
    const p = await pedir<PaginaNotion>(`/pages/${id}`);
    return p.archived || p.in_trash ? null : p;
  } catch (err) {
    if (err instanceof NotionError && (err.status === 404 || err.status === 400)) return null;
    throw err;
  }
}

/** Los usuarios del espacio (para el Responsable). Sin permiso de usuarios, vacío. */
export async function usuarios(): Promise<Map<string, string>> {
  const nombres = new Map<string, string>();
  let cursor: string | null = null;
  try {
    do {
      const q: string = cursor ? `?page_size=100&start_cursor=${encodeURIComponent(cursor)}` : "?page_size=100";
      const r = await pedir<{ results: { id: string; name?: string | null }[]; has_more: boolean; next_cursor: string | null }>(
        `/users${q}`
      );
      for (const u of r.results) if (u.name) nombres.set(u.id, u.name);
      cursor = r.has_more ? r.next_cursor : null;
    } while (cursor);
  } catch (err) {
    if (!(err instanceof NotionError) || err.status !== 403) throw err;
  }
  return nombres;
}
