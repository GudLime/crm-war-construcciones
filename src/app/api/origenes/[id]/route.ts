import { apiError, parseBody, withAuth } from "@/lib/api";
import { canConfigure } from "@/lib/auth/roles";
import { borrarOrigen, editarOrigen, OrigenError, origenSchema } from "@/server/origenes";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** War — Editar nombre e ícono. Renombrar arrastra a las oportunidades. */
export const PATCH = withAuth(async (session, req: Request, ctx: Params) => {
  if (!canConfigure(session.role)) {
    return apiError(403, "forbidden", "Solo quien administra edita orígenes");
  }
  const { id } = await ctx.params;
  const body = await parseBody(req, origenSchema);
  if (!body.ok) return body.response;
  try {
    return Response.json({ origen: await editarOrigen(session.organizationId, id, body.data) });
  } catch (err) {
    if (err instanceof OrigenError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});

/** Borrar: las oportunidades que lo tenían lo conservan como texto. */
export const DELETE = withAuth(async (session, _req: Request, ctx: Params) => {
  if (!canConfigure(session.role)) {
    return apiError(403, "forbidden", "Solo quien administra borra orígenes");
  }
  const { id } = await ctx.params;
  try {
    await borrarOrigen(session.organizationId, id);
    return new Response(null, { status: 204 });
  } catch (err) {
    if (err instanceof OrigenError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});
