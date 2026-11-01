import { apiError, parseBody, withAuth } from "@/lib/api";
import { crearDepartamento, departamentoSchema, VentasError } from "@/server/ventas";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export const POST = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, departamentoSchema);
  if (!body.ok) return body.response;
  try {
    const departamento = await crearDepartamento(session.organizationId, id, body.data);
    return Response.json({ departamento }, { status: 201 });
  } catch (err) {
    if (err instanceof VentasError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});
