import { apiError, withAuth } from "@/lib/api";
import { canConfigure } from "@/lib/auth/roles";
import { obtenerDetalleOportunidad } from "@/server/oportunidad-detalle";
import { VentasError } from "@/server/ventas";
import { alcanceDe, puedeVerOportunidad, sinPermisoDeOportunidad } from "@/server/acceso";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** War — Todo lo de la página de una oportunidad, en una sola ida. */
export const GET = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const alcance = alcanceDe(session);
  // v6 — Si existe pero no es suya, se dice de quién es (antes: «no existe»).
  if (!(await puedeVerOportunidad(alcance, id))) return sinPermisoDeOportunidad(alcance, id);
  try {
    const quien = { ...session, configura: canConfigure(session.role) };
    return Response.json(await obtenerDetalleOportunidad(quien, id));
  } catch (err) {
    if (err instanceof VentasError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});
