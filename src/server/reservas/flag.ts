/**
 * 071 — Si esta instancia toma reservas (restaurante) o no.
 *
 * Mismo patrón que la agenda (015, ADR-001): el código viaja siempre en main
 * y una variable de despliegue decide si existe. Sin `RESERVAS`, ni la vista
 * del día, ni Ajustes → Reservas, ni sus rutas (404). La migración 0055 se
 * aplica igual: las tablas vacías son inertes.
 */
import { parseAgendaFlag } from "@/server/agenda/flag";

export function reservasEnabled(): boolean {
  return parseAgendaFlag(process.env.RESERVAS);
}

/** 404 y no 403: si la instancia no toma reservas, el endpoint no existe. */
export function reservasDisabledResponse(): Response {
  return new Response(null, { status: 404 });
}
