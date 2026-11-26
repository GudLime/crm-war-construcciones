/**
 * 071 — Lo puro de reservar desde el cerebro (Nea) con el módulo de Reservas:
 * la conversión entre el instante que viaja por el contrato (`startUtc`) y la
 * fecha y hora del restaurante, y lo que el CRM lee de la ficha.
 *
 * El contrato con el cerebro (`docs/openapi.json`) no cambia: el cerebro sigue
 * hablando en instantes UTC, y el CRM traduce a la fecha y hora locales que
 * entiende el servicio de reservas.
 */

import { zonedWallClockToUtc } from "@/lib/time/slots";

/** Fecha y hora del restaurante → instante UTC en ISO. `null` si no son válidas. */
export function instanteDeReserva(fecha: string, hora: string, zona: string): string | null {
  // Date.UTC acomoda en silencio un 2026-13-40: se descarta antes.
  const d = new Date(`${fecha}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== fecha) return null;
  return zonedWallClockToUtc(fecha, hora, zona)?.toISOString() ?? null;
}

/** Instante → fecha y hora del restaurante («2026-12-04», «20:00»). `null` si no es un instante. */
export function localDeInstante(startUtc: string, zona: string): { fecha: string; hora: string } | null {
  const d = new Date(startUtc);
  if (Number.isNaN(d.getTime())) return null;
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: zona,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const p = (t: Intl.DateTimeFormatPartTypes) => partes.find((x) => x.type === t)?.value ?? "";
  return { fecha: `${p("year")}-${p("month")}-${p("day")}`, hora: `${p("hour")}:${p("minute")}` };
}

/** Cuántas personas se asumen al ofrecer horarios si la ficha todavía no lo dice. */
export const PERSONAS_SI_NO_SE_SABE = 2;

const EN_NOTAS = /(\d{1,3})\s*(?:personas?|comensales|pax|adultos)\b/i;

function entero(v: unknown): number | null {
  if (typeof v === "number" && Number.isInteger(v)) return v;
  if (typeof v === "string") {
    const m = /\d{1,3}/.exec(v);
    if (m) return Number(m[0]);
  }
  return null;
}

/**
 * Cuántas personas son, según la ficha que escribe el cerebro: la clave
 * `personas` (número o texto, «4» o «4 personas»), y si no está, algo como
 * «4 personas» en `notas`. `null` si no se sabe.
 */
export function personasDeFicha(ficha: Record<string, unknown> | null | undefined): number | null {
  if (!ficha) return null;
  const directa = entero(ficha.personas ?? ficha.cantidad_personas ?? ficha.comensales);
  const valor = directa ?? (typeof ficha.notas === "string" ? Number(EN_NOTAS.exec(ficha.notas)?.[1] ?? NaN) : NaN);
  return Number.isInteger(valor) && valor >= 1 && valor <= 500 ? valor : null;
}

/** El nombre para la reserva: el de la ficha, si no el del contacto. */
export function nombreParaReserva(ficha: Record<string, unknown> | null | undefined, contacto: string | null): string {
  const deFicha = typeof ficha?.nombre === "string" ? ficha.nombre.trim() : "";
  return (deFicha || contacto?.trim() || "Sin nombre").slice(0, 120);
}

/**
 * Reglas que el CRM le suma a las instrucciones del agente cuando toma
 * reservas. Son contrato: las claves que nombran son las que lee
 * `personasDeFicha` y `nombreParaReserva`.
 */
export const INSTRUCCIONES_RESERVAS = `
## Reservas (reglas del CRM, no las cambies)

1. Antes de consultar horarios, guardá en la ficha la cantidad de personas con la clave "personas", solo el número. Si cambia, actualizala antes de volver a consultar.
2. Guardá el nombre para la reserva en la ficha con la clave "nombre".
3. Si el CRM no te deja consultar o reservar (por ejemplo, porque son más personas que el tope), pasá la conversación a alguien del equipo.
4. Cuando la persona pregunta por el restaurante (carta, horarios, dirección) o empieza a reservar, movela a la etapa siguiente que te ofrece el CRM.
`.trim();

export function conInstruccionesReservas(instrucciones: string | null): string {
  return instrucciones?.trim() ? `${instrucciones.trim()}\n\n${INSTRUCCIONES_RESERVAS}` : INSTRUCCIONES_RESERVAS;
}
