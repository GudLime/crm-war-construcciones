import { apiError, parseBody, withAdmin } from "@/lib/api";
import { asignacionSchema } from "@/lib/asignacion";
import { AsignacionError, guardarAsignacion, leerAsignacion } from "@/server/asignacion";
import { listarResponsables, nombreDelAgente } from "@/server/responsables";
import { listarEdificios } from "@/server/ventas";

export const dynamic = "force-dynamic";

/** 0051 — Ajustes → Ventas: a quién va cada lead de Meta según el edificio. */
export const GET = withAdmin(async (session) => {
  const org = session.organizationId;
  const [asignacion, edificios, equipo, agente] = await Promise.all([
    leerAsignacion(org),
    listarEdificios(org),
    listarResponsables(org),
    nombreDelAgente(org),
  ]);
  return Response.json({
    asignacion,
    edificios: edificios.map((e) => ({ id: e.id, nombre: e.nombre })),
    equipo,
    agente,
  });
});

export const PUT = withAdmin(async (session, req: Request) => {
  const body = await parseBody(req, asignacionSchema);
  if (!body.ok) return body.response;
  try {
    return Response.json({ asignacion: await guardarAsignacion(session.organizationId, body.data) });
  } catch (err) {
    if (err instanceof AsignacionError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});
