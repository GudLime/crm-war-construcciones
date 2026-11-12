import { apiError, withAuth } from "@/lib/api";
import { canConfigure } from "@/lib/auth/roles";
import { obtenerDetalleOportunidad } from "@/server/oportunidad-detalle";
import { VentasError } from "@/server/ventas";
import { alcanceDe, noEncontrado, puedeVerOportunidad } from "@/server/acceso";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** War — Todo lo de la página de una oportunidad, en una sola ida. */
export const GET = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  if (!(await puedeVerOportunidad(alcanceDe(session), id))) return noEncontrado("Esa oportunidad");
  try {
    const quien = { ...session, configura: canConfigure(session.role) };
    return Response.json(await obtenerDetalleOportunidad(quien, id));
  } catch (err) {
    if (err instanceof VentasError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});
