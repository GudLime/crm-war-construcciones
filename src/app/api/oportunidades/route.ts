import { apiError, parseBody, withAuth } from "@/lib/api";
import { valorEsCalculado } from "@/server/motor/interes";
import {
  crearOportunidad,
  listarOportunidades,
  oportunidadSchema,
  VentasError,
} from "@/server/ventas";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session) => {
  const [oportunidades, valorCalculado] = await Promise.all([
    listarOportunidades(session.organizationId),
    // 0049 — Con interés encadenado, el Valor es el promedio de las unidades.
    valorEsCalculado(session.organizationId).catch(() => false),
  ]);
  return Response.json({ oportunidades, valorCalculado });
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
