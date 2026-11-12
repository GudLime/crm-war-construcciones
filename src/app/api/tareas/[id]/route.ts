import { apiError, parseBody, withAuth } from "@/lib/api";
import { esAdmin } from "@/lib/auth/roles";
import { borrarTarea, editarTarea, tareaSchema, VentasError } from "@/server/ventas";
import { accesoATarea, alcanceDe, noEncontrado, prohibido } from "@/server/acceso";

/** Visibilidad por rol: el operador cambia solo sus tareas (las visitas ajenas son de lectura). */
async function exigirEdicion(session: Parameters<Parameters<typeof withAuth>[0]>[0], id: string) {
  const acceso = await accesoATarea(alcanceDe(session), id);
  if (acceso === null) return noEncontrado("Esa tarea");
  if (acceso === "leer") return prohibido("Esa tarea es de otra persona: la podés ver, no cambiar");
  return null;
}

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export const PATCH = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const negado = await exigirEdicion(session, id);
  if (negado) return negado;
  const body = await parseBody(req, tareaSchema);
  if (!body.ok) return body.response;
  if (!esAdmin(session.role) && body.data.responsableId && body.data.responsableId !== session.userId) {
    return prohibido("Solo un admin pasa una tarea a otra persona");
  }
  try {
    return Response.json({ tarea: await editarTarea(session.organizationId, id, body.data, session.userId) });
  } catch (err) {
    if (err instanceof VentasError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});

export const DELETE = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const negado = await exigirEdicion(session, id);
  if (negado) return negado;
  try {
    await borrarTarea(session.organizationId, id);
    return new Response(null, { status: 204 });
  } catch (err) {
    if (err instanceof VentasError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});
