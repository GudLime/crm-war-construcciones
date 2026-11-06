import { apiError, parseBody, withAuth } from "@/lib/api";
import {
  crearOportunidad,
  listarOportunidades,
  oportunidadSchema,
  VentasError,
} from "@/server/ventas";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session) => {
  return Response.json({ oportunidades: await listarOportunidades(session.organizationId) });
});

export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, oportunidadSchema);
  if (!body.ok) return body.response;
  try {
    const oportunidad = await crearOportunidad(session.organizationId, body.data, session.userId);
    return Response.json({ oportunidad }, { status: 201 });
  } catch (err) {
    if (err instanceof VentasError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});
