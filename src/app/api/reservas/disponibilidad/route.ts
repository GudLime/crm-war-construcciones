import { apiError, withAuth } from "@/lib/api";
import { esFecha } from "@/lib/reservas";
import { conReservas } from "@/server/reservas/http";
import { diasConLugar, disponibilidad } from "@/server/reservas/servicio";

export const dynamic = "force-dynamic";

/**
 * 071 — Disponibilidad para `personas`: con `fecha`, los horarios de ese día
 * y si entra; sin fecha, los días de la anticipación con algún lugar.
 */
export const GET = withAuth(async (session, req: Request) =>
  conReservas(async () => {
    const url = new URL(req.url);
    const personas = Number(url.searchParams.get("personas"));
    if (!Number.isInteger(personas) || personas < 1) return apiError(422, "invalid_body", "Indicá cuántas personas");
    const fecha = url.searchParams.get("fecha");
    if (fecha) {
      if (!esFecha(fecha)) return apiError(422, "invalid_body", "Fecha inválida");
      return Response.json(await disponibilidad(session.organizationId, { fecha, personas }));
    }
    return Response.json(await diasConLugar(session.organizationId, { personas }));
  })
);
