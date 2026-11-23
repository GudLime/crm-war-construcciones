import { apiError, parseBody, withAdmin } from "@/lib/api";
import { asignarSchema } from "@/lib/asignaciones";
import { AsignacionesError, asignarEnLote, leerAsignaciones } from "@/server/asignaciones";

export const dynamic = "force-dynamic";

/** La mesa de reparto: sin asignar, automáticas de las últimas 24 h y vendedores. `?edificio=` filtra. */
export const GET = withAdmin(async (session, req: Request) => {
  const edificio = new URL(req.url).searchParams.get("edificio")?.trim() || null;
  return Response.json(await leerAsignaciones(session.organizationId, edificio));
});

/** Asigna en lote `{ oportunidadIds, userId }`; devuelve `cambios` para deshacer. */
export const POST = withAdmin(async (session, req: Request) => {
  const body = await parseBody(req, asignarSchema);
  if (!body.ok) return body.response;
  try {
    const cambios = await asignarEnLote(session.organizationId, session.userId, body.data.oportunidadIds, body.data.userId);
    return Response.json({ cambios });
  } catch (err) {
    if (err instanceof AsignacionesError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});
