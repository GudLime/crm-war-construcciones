import { apiError, parseBody, withAuth } from "@/lib/api";
import { alcanceDe, prohibido, puedeVerOportunidad, tareaVisible } from "@/server/acceso";
import { crearTarea, esEstadoTarea, listarTareas, tareaSchema, VentasError } from "@/server/ventas";

export const dynamic = "force-dynamic";

/**
 * Visibilidad por rol: el operador recibe sus tareas y las visitas de todos;
 * `editable` dice cuáles puede cambiar (las ajenas son solo lectura).
 */
export const GET = withAuth(async (session, req: Request) => {
  const estado = new URL(req.url).searchParams.get("estado");
  const filtro = esEstadoTarea(estado) ? estado : undefined;
  const a = alcanceDe(session);
  const tareas = await listarTareas(session.organizationId, filtro, tareaVisible(a));
  return Response.json({
    tareas: tareas.map((t) => ({ ...t, editable: a.admin || t.responsableId === session.userId })),
  });
});

export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, tareaSchema);
  if (!body.ok) return body.response;
  const a = alcanceDe(session);
  // El operador crea tareas para sí mismo y de sus oportunidades.
  if (!a.admin) {
    if (body.data.responsableId && body.data.responsableId !== session.userId) {
      return prohibido("Solo un admin asigna tareas a otra persona");
    }
    if (body.data.oportunidadId && !(await puedeVerOportunidad(a, body.data.oportunidadId))) {
      return prohibido("Esa oportunidad no es tuya");
    }
  }
  try {
    const tarea = await crearTarea(
      session.organizationId,
      a.admin ? body.data : { ...body.data, responsableId: session.userId },
      session.userId
    );
    return Response.json({ tarea }, { status: 201 });
  } catch (err) {
    if (err instanceof VentasError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});
