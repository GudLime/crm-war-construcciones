import { apiError, withAuth } from "@/lib/api";
import { canConfigure } from "@/lib/auth/roles";
import { borrarNota, NotaError } from "@/server/notas";
import { alcanceDe, noEncontrado, puedeVerConversacion } from "@/server/acceso";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; noteId: string }> };

/** 050 — Borrar una nota: quien la escribió o quien administra. */
export const DELETE = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id, noteId } = await ctx.params;
  if (!(await puedeVerConversacion(alcanceDe(session), id))) return noEncontrado("Esa conversación");
  try {
    await borrarNota({ ...session, configura: canConfigure(session.role) }, id, noteId);
    return new Response(null, { status: 204 });
  } catch (err) {
    if (err instanceof NotaError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});
