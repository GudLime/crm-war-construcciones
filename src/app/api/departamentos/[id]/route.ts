import { apiError, parseBody, withAdmin } from "@/lib/api";
import { recalcularPorRegistro } from "@/server/motor/interes";
import {
  borrarDepartamento,
  departamentoSchema,
  editarDepartamento,
  VentasError,
} from "@/server/ventas";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export const PATCH = withAdmin(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, departamentoSchema);
  if (!body.ok) return body.response;
  try {
    const departamento = await editarDepartamento(session.organizationId, id, body.data);
    // Su precio o su estado cambian el Valor de las oportunidades que la miran.
    await recalcularPorRegistro(session.organizationId, "departamento", id);
    return Response.json({ departamento });
  } catch (err) {
    if (err instanceof VentasError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});

export const DELETE = withAdmin(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  try {
    await borrarDepartamento(session.organizationId, id);
    return new Response(null, { status: 204 });
  } catch (err) {
    if (err instanceof VentasError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});
