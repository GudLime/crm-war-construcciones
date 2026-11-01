import { apiError, parseBody, withAuth } from "@/lib/api";
import {
  borrarDepartamento,
  departamentoSchema,
  editarDepartamento,
  VentasError,
} from "@/server/ventas";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export const PATCH = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, departamentoSchema);
  if (!body.ok) return body.response;
  try {
    return Response.json({
      departamento: await editarDepartamento(session.organizationId, id, body.data),
    });
  } catch (err) {
    if (err instanceof VentasError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});

export const DELETE = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  try {
    await borrarDepartamento(session.organizationId, id);
    return new Response(null, { status: 204 });
  } catch (err) {
    if (err instanceof VentasError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});
