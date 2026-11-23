import { apiError } from "@/lib/api";
import { ReservaError } from "@/server/reservas/servicio";
import { reservasDisabledResponse, reservasEnabled } from "@/server/reservas/flag";

/**
 * 071 — Envoltura de las rutas de reservas: 404 si la instancia no toma
 * reservas, y los `ReservaError` como respuesta con su código.
 */
export async function conReservas(fn: () => Promise<Response>): Promise<Response> {
  if (!reservasEnabled()) return reservasDisabledResponse();
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ReservaError) return apiError(err.status, err.code, err.message);
    throw err;
  }
}
