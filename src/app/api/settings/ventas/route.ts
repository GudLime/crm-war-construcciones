import { apiError, parseBody, withAuth } from "@/lib/api";
import { canConfigure } from "@/lib/auth/roles";
import { ajustesVentasSchema } from "@/lib/ventas-ajustes";
import { guardarAjustesVentas, leerAjustesVentas } from "@/server/oportunidad-historial";

export const dynamic = "force-dynamic";

/** War — Ajustes → Ventas: los lee cualquiera del equipo. */
export const GET = withAuth(async (session) => {
  return Response.json({
    ajustes: await leerAjustesVentas(session.organizationId),
    puedeEditar: canConfigure(session.role),
  });
});

/** Los cambia solo quien administra. */
export const PUT = withAuth(async (session, req: Request) => {
  if (!canConfigure(session.role)) {
    return apiError(403, "forbidden", "Solo quien administra cambia estos ajustes");
  }
  const body = await parseBody(req, ajustesVentasSchema);
  if (!body.ok) return body.response;
  return Response.json({ ajustes: await guardarAjustesVentas(session.organizationId, body.data) });
});
