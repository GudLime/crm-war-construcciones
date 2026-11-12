import { z } from "zod";
import { planoOrigen } from "@/lib/origenes";

/**
 * 0051 — Asignación automática de los leads de Meta. Lo puro: qué cuenta como
 * «de Meta», a quién le toca según el edificio y el formato del ajuste. La parte
 * con base vive en `server/asignacion.ts`.
 *
 * Apagada por defecto. Encendida, una oportunidad que llega de Meta sin
 * responsable se asigna al destino de su edificio: una persona del equipo o la
 * IA. Si su edificio no está mapeado, queda sin asignar (la ve el admin).
 */

/** El destino «la IA»: la oportunidad la lleva el agente, no una persona. */
export const ASIGNAR_A_IA = "ia";

/** Los orígenes que cuentan como Meta (anuncios de Facebook e Instagram). */
const ORIGENES_DE_META = ["Meta Ads", "Facebook", "Instagram"].map(planoOrigen);

export function esDeMeta(origen: string | null | undefined): boolean {
  return Boolean(origen) && ORIGENES_DE_META.includes(planoOrigen(origen!));
}

export type Asignacion = {
  activa: boolean;
  /** Edificio → id de usuario o `ASIGNAR_A_IA`. */
  porEdificio: Record<string, string>;
};

export const ASIGNACION_POR_DEFECTO: Asignacion = { activa: false, porEdificio: {} };

export const asignacionSchema = z.object({
  activa: z.boolean(),
  porEdificio: z.record(z.string().min(1).max(60), z.string().min(1).max(60)).default({}),
});

/**
 * A quién le toca una oportunidad con estos edificios de interés (en orden:
 * el principal primero). El primero que esté mapeado decide; si ninguno, null.
 */
export function destinoPorEdificio(
  porEdificio: Readonly<Record<string, string>>,
  edificioIds: readonly string[]
): string | null {
  for (const id of edificioIds) {
    const destino = porEdificio[id];
    if (destino) return destino;
  }
  return null;
}
