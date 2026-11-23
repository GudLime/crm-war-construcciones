import { parseBody, withAdmin } from "@/lib/api";
import { crearPlantilla, listarPlantillas, plantillaSchema } from "@/server/plantillas-tareas";

export const dynamic = "force-dynamic";

/** 0059 — Plantillas de tareas sugeridas (las arma el admin para todo el equipo). */
export const GET = withAdmin(async (session) => {
  return Response.json({ plantillas: await listarPlantillas(session.organizationId) });
});

export const POST = withAdmin(async (session, req: Request) => {
  const body = await parseBody(req, plantillaSchema);
  if (!body.ok) return body.response;
  return Response.json({ plantilla: await crearPlantilla(session.organizationId, body.data) }, { status: 201 });
});
