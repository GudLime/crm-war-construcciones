import { timingSafeEqual } from "node:crypto";
import { apiError } from "@/lib/api";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

/**
 * War — Autenticación de las automatizaciones (Make) que cargan leads.
 *
 * Llave propia (`LEADS_API_KEY`), separada de la del cerebro: si se filtra la
 * de Make, no habla por WhatsApp. Header `X-API-Key` o `Authorization:
 * Bearer`, comparación en tiempo constante. Sin llave (o con una corta) todo
 * responde 401.
 */

const MIN_KEY_LENGTH = 16;
const FALLOS = { windowMs: 60_000, max: 30 };
const PRESUPUESTO = { windowMs: 60_000, max: 300 };

export function llaveLeadsConfigurada(): boolean {
  const key = process.env.LEADS_API_KEY;
  return typeof key === "string" && key.length >= MIN_KEY_LENGTH;
}

function llaveDe(req: Request): string | null {
  const directa = req.headers.get("x-api-key");
  if (directa) return directa.trim();
  const auth = req.headers.get("authorization");
  const m = auth ? /^Bearer\s+(.+)$/i.exec(auth.trim()) : null;
  return m?.[1]?.trim() ?? null;
}

function llaveValida(dada: string | null): boolean {
  const esperada = process.env.LEADS_API_KEY;
  if (!esperada || !llaveLeadsConfigurada() || !dada) return false;
  const a = Buffer.from(dada);
  const b = Buffer.from(esperada);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** null = pasa; si no, la respuesta de rechazo. */
export function exigirLlaveLeads(req: Request): Response | null {
  if (!llaveValida(llaveDe(req))) {
    const fallos = checkRateLimit(`leads-api-fail:${clientIp(req.headers)}`, FALLOS);
    return fallos.allowed
      ? apiError(401, "unauthorized", "No autorizado")
      : apiError(429, "rate_limited", "Demasiados intentos fallidos");
  }
  const rl = checkRateLimit("leads-api", PRESUPUESTO);
  if (!rl.allowed) return apiError(429, "rate_limited", "Demasiadas solicitudes");
  return null;
}
