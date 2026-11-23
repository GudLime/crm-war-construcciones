import { apiError, withAuth } from "@/lib/api";
import { alcanceDe, noEncontrado, puedeVerOportunidad } from "@/server/acceso";
import { descartarSugerencia, restaurarSugerencia, SugerenciaError } from "@/server/sugerencias";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; plantillaId: string }> };

/** 0059 — Descartar una sugerencia (vale mientras siga en esta etapa). */
export const POST = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id, plantillaId } = await ctx.params;
  if (!(await puedeVerOportunidad(alcanceDe(session), id))) return noEncontrado("Esa oportunidad");
  try {
    await descartarSugerencia(session.organizationId, id, plantillaId, session.userId);
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof SugerenciaError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});

/** Volver a mostrarla. */
export const DELETE = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id, plantillaId } = await ctx.params;
  if (!(await puedeVerOportunidad(alcanceDe(session), id))) return noEncontrado("Esa oportunidad");
  await restaurarSugerencia(session.organizationId, id, plantillaId);
  return Response.json({ ok: true });
});
