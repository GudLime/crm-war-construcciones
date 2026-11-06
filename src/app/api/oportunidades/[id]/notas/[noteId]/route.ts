import { apiError, withAuth } from "@/lib/api";
import { canConfigure } from "@/lib/auth/roles";
import { borrarNotaDeOportunidad, NotaError } from "@/server/notas";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; noteId: string }> };

/** War — Borrar una nota de la oportunidad: quien la escribió o quien administra. */
export const DELETE = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id, noteId } = await ctx.params;
  try {
    await borrarNotaDeOportunidad({ ...session, configura: canConfigure(session.role) }, id, noteId);
    return new Response(null, { status: 204 });
  } catch (err) {
    if (err instanceof NotaError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});
