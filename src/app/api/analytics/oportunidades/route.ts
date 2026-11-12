import { apiError, withAuth } from "@/lib/api";
import { PeriodError, periodFromRequest } from "@/server/analytics/period";
import { estadisticasOportunidades } from "@/server/analytics/oportunidades";
import { alcanceDe, oportunidadVisible } from "@/server/acceso";

export const dynamic = "force-dynamic";

/**
 * Motor (paso 7) — estadísticas de oportunidades del período
 * (`?from=AAAA-MM-DD&to=AAAA-MM-DD`): embudo, tiempos por etapa, motivos de
 * pérdida y orígenes. `verPor=<dimensión>` agrupa (vacío = sin agrupar; sin el
 * parámetro, el de la configuración del cliente) y `f.<dimensión>=a,b` filtra.
 */
export const GET = withAuth(async (session, req: Request) => {
  const url = new URL(req.url);
  const filtros: Record<string, string[]> = {};
  for (const [k, v] of url.searchParams) {
    if (k.startsWith("f.") && v) filtros[k.slice(2)] = v.split(",").filter(Boolean).slice(0, 100);
  }
  try {
    const period = await periodFromRequest(session.organizationId, url);
    return Response.json(
      await estadisticasOportunidades(session.organizationId, period, {
        verPor: url.searchParams.has("verPor") ? url.searchParams.get("verPor") : undefined,
        filtros,
      }, oportunidadVisible(alcanceDe(session)))
    );
  } catch (err) {
    if (err instanceof PeriodError) return apiError(422, "invalid_period", err.message);
    throw err;
  }
});
