import { apiError, withAuth } from "@/lib/api";
import { esAdmin } from "@/lib/auth/roles";
import { filtrosDeRequest } from "@/server/analytics/filtros";
import { PeriodError, periodFromRequest } from "@/server/analytics/period";
import { visitasDelPeriodo } from "@/server/analytics/visitas";

export const dynamic = "force-dynamic";

/**
 * Resultados — Visitas del período (`desde`, `hasta`, `edificioIds`, `origen`,
 * `responsable`, `operacion`). El operador ve solo las de sus oportunidades.
 */
export const GET = withAuth(async (session, req: Request) => {
  const url = new URL(req.url);
  try {
    const period = await periodFromRequest(session.organizationId, url);
    return Response.json(
      await visitasDelPeriodo(session.organizationId, session.userId, esAdmin(session.role), period, filtrosDeRequest(url))
    );
  } catch (err) {
    if (err instanceof PeriodError) return apiError(422, "invalid_period", err.message);
    throw err;
  }
});
