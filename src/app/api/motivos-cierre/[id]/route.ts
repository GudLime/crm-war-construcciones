import { apiError, parseBody, withAuth } from "@/lib/api";
import { canConfigure } from "@/lib/auth/roles";
import { borrarMotivo, editarMotivo, MotivoError, motivoSchema } from "@/server/motivos-cierre";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** War — Renombrar un motivo: arrastra a las oportunidades y al historial. */
export const PATCH = withAuth(async (session, req: Request, ctx: Params) => {
  if (!canConfigure(session.role)) return apiError(403, "forbidden", "Solo quien administra edita motivos");
  const { id } = await ctx.params;
  const body = await parseBody(req, motivoSchema);
  if (!body.ok) return body.response;
  try {
    return Response.json({ motivo: await editarMotivo(session.organizationId, id, body.data) });
  } catch (err) {
    if (err instanceof MotivoError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});

/** Borrar: las oportunidades que lo tenían lo conservan como texto. */
export const DELETE = withAuth(async (session, _req: Request, ctx: Params) => {
  if (!canConfigure(session.role)) return apiError(403, "forbidden", "Solo quien administra borra motivos");
  const { id } = await ctx.params;
  try {
    await borrarMotivo(session.organizationId, id);
    return new Response(null, { status: 204 });
  } catch (err) {
    if (err instanceof MotivoError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});
