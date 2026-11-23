import { apiError, withAuth } from "@/lib/api";
import { alcanceDe, noEncontrado, puedeVerOportunidad } from "@/server/acceso";
import { crearDesdeSugerencia, SugerenciaError } from "@/server/sugerencias";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; plantillaId: string }> };

/** 0059 — Crear la tarea de una sugerencia, en un paso (la elige el vendedor). */
export const POST = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id, plantillaId } = await ctx.params;
  if (!(await puedeVerOportunidad(alcanceDe(session), id))) return noEncontrado("Esa oportunidad");
  try {
    return Response.json(await crearDesdeSugerencia(session.organizationId, id, plantillaId, session.userId), {
      status: 201,
    });
  } catch (err) {
    if (err instanceof SugerenciaError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});
