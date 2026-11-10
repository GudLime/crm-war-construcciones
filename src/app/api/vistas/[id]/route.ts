import { apiError, parseBody, withAuth } from "@/lib/api";
import { vistaEntradaSchema } from "@/lib/vistas";
import { borrarVista, editarVista, VistaError } from "@/server/vistas";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export const PATCH = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, vistaEntradaSchema.partial());
  if (!body.ok) return body.response;
  try {
    const q = { organizationId: session.organizationId, userId: session.userId };
    return Response.json({ vista: await editarVista(q, id, body.data) });
  } catch (err) {
    if (err instanceof VistaError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});

export const DELETE = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  try {
    await borrarVista({ organizationId: session.organizationId, userId: session.userId }, id);
    return new Response(null, { status: 204 });
  } catch (err) {
    if (err instanceof VistaError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});
