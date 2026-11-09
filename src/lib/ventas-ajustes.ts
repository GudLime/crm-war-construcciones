import { z } from "zod";
import type { EstadoOportunidad } from "@/lib/ventas";

/**
 * War — Reglas puras de «sin respuesta», cierre por silencio y reapertura.
 * Sin base de datos, para poder probarlas como tabla. La parte con base vive
 * en `server/oportunidad-historial.ts`.
 */

export const MODOS_SIN_RESPUESTA = [
  { value: "cerrar", label: "Cerrar sola" },
  { value: "sugerir", label: "Sugerir el cierre" },
  { value: "apagado", label: "No hacer nada" },
] as const;
export type ModoSinRespuesta = (typeof MODOS_SIN_RESPUESTA)[number]["value"];

export type AjustesVentas = {
  /** Cuántas tandas de mensajes nuestros sin respuesta hacen falta. */
  sinRespuestaIntentos: number;
  /** Cuántos días desde el último intento, sin que conteste. */
  sinRespuestaDias: number;
  sinRespuestaModo: ModoSinRespuesta;
  /** Hasta cuántos días después de cerrada, un mensaje reabre la MISMA oportunidad. */
  reaperturaDias: number;
  /**
   * Si el agente atiende solo las conversaciones nuevas. Apagado, los contactos
   * llegan y se ven, pero la IA no contesta hasta que alguien la prenda en esa
   * conversación. Las que ya existen no cambian.
   */
  iaConversacionesNuevas: boolean;
};

export const AJUSTES_VENTAS_POR_DEFECTO: AjustesVentas = {
  sinRespuestaIntentos: 3,
  sinRespuestaDias: 7,
  sinRespuestaModo: "cerrar",
  reaperturaDias: 120,
  iaConversacionesNuevas: true,
};

export const ajustesVentasSchema = z.object({
  sinRespuestaIntentos: z.number().int().min(1).max(50),
  sinRespuestaDias: z.number().int().min(1).max(365),
  sinRespuestaModo: z.enum(["cerrar", "sugerir", "apagado"]),
  reaperturaDias: z.number().int().min(0).max(3650),
  iaConversacionesNuevas: z.boolean().default(true),
});

/** El motivo con que se cierra una oportunidad por falta de respuesta. */
export const MOTIVO_SIN_RESPUESTA = "No responde";

/**
 * Mensajes nuestros más juntos que esto cuentan como UN intento: Mateo suele
 * mandar dos o tres burbujas en el mismo turno, y eso no es insistir tres veces.
 */
export const VENTANA_TANDA_MS = 60 * 60 * 1000;

const DIA_MS = 24 * 60 * 60 * 1000;

export type Silencio = {
  intentosSinRespuesta: number;
  ultimoIntentoAt: Date | null;
  ultimaRespuestaAt: Date | null;
};

/** Cuántos intentos quedan después de uno nuevo en `at`. */
export function intentosTrasUnIntento(s: Silencio, at: Date): number {
  const respondioDespues =
    s.ultimaRespuestaAt && s.ultimoIntentoAt && s.ultimaRespuestaAt >= s.ultimoIntentoAt;
  if (respondioDespues || !s.ultimoIntentoAt) return s.intentosSinRespuesta + 1;
  const mismaTanda = at.getTime() - s.ultimoIntentoAt.getTime() < VENTANA_TANDA_MS;
  return mismaTanda ? Math.max(1, s.intentosSinRespuesta) : s.intentosSinRespuesta + 1;
}

/** ¿Cumple la condición para cerrarse (o sugerirlo) por falta de respuesta? */
export function cumpleSilencio(s: Silencio, ajustes: AjustesVentas, ahora: Date): boolean {
  if (s.intentosSinRespuesta < ajustes.sinRespuestaIntentos || !s.ultimoIntentoAt) return false;
  if (s.ultimaRespuestaAt && s.ultimaRespuestaAt >= s.ultimoIntentoAt) return false;
  return ahora.getTime() - s.ultimoIntentoAt.getTime() >= ajustes.sinRespuestaDias * DIA_MS;
}

/** ¿Un mensaje en `ahora` reabre esta oportunidad cerrada (en vez de abrir otra)? */
export function seReabre(
  op: { estado: EstadoOportunidad; cerradaAt: Date | null },
  ajustes: AjustesVentas,
  ahora: Date
): boolean {
  // Solo las perdidas: un «No calificado» lo decidió una persona y un
  // «Compró» que vuelve a escribir es otra conversación.
  if (op.estado !== "perdido" || !op.cerradaAt) return false;
  return ahora.getTime() - op.cerradaAt.getTime() <= ajustes.reaperturaDias * DIA_MS;
}

export type ResultadoCierre = "ganada" | "perdida" | "no_calificado";

export function resultadoDeCierre(estado: EstadoOportunidad): ResultadoCierre | null {
  if (estado === "compro") return "ganada";
  if (estado === "perdido") return "perdida";
  if (estado === "no_calificado") return "no_calificado";
  return null;
}

/** "Sin respuesta · 3 intentos · hace 4 días" (o null si respondió). */
export function textoSinRespuesta(s: Silencio, ahora: Date = new Date()): string | null {
  if (s.intentosSinRespuesta <= 0 || !s.ultimoIntentoAt) return null;
  if (s.ultimaRespuestaAt && s.ultimaRespuestaAt >= s.ultimoIntentoAt) return null;
  const dias = Math.floor((ahora.getTime() - s.ultimoIntentoAt.getTime()) / DIA_MS);
  const cuando = dias <= 0 ? "hoy" : dias === 1 ? "hace 1 día" : `hace ${dias} días`;
  const n = s.intentosSinRespuesta;
  return `Sin respuesta · ${n} ${n === 1 ? "intento" : "intentos"} · ${cuando}`;
}
