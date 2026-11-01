import { apiError, parseBody, withAuth } from "@/lib/api";
import {
  borrarEdificio,
  edificioSchema,
  editarEdificio,
  obtenerEdificio,
  VentasError,
} from "@/server/ventas";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export const GET = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  try {
    return Response.json(await obtenerEdificio(session.organizationId, id));
  } catch (err) {
    if (err instanceof VentasError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});

export const PATCH = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, edificioSchema);
  if (!body.ok) return body.response;
  try {
    return Response.json({ edificio: await editarEdificio(session.organizationId, id, body.data) });
  } catch (err) {
    if (err instanceof VentasError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});

export const DELETE = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  try {
    await borrarEdificio(session.organizationId, id);
    return new Response(null, { status: 204 });
  } catch (err) {
    if (err instanceof VentasError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});
