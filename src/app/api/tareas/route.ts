import { apiError, parseBody, withAuth } from "@/lib/api";
import { crearTarea, esEstadoTarea, listarTareas, tareaSchema, VentasError } from "@/server/ventas";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session, req: Request) => {
  const estado = new URL(req.url).searchParams.get("estado");
  const filtro = esEstadoTarea(estado) ? estado : undefined;
  return Response.json({ tareas: await listarTareas(session.organizationId, filtro) });
});

export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, tareaSchema);
  if (!body.ok) return body.response;
  try {
    const tarea = await crearTarea(session.organizationId, body.data);
    return Response.json({ tarea }, { status: 201 });
  } catch (err) {
    if (err instanceof VentasError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});
