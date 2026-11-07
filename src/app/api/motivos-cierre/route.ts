import { apiError, parseBody, withAuth } from "@/lib/api";
import { canConfigure } from "@/lib/auth/roles";
import {
  crearMotivo,
  listarMotivos,
  listarMotivosConUsos,
  MotivoError,
  motivoSchema,
  ordenarMotivos,
  ordenMotivosSchema,
} from "@/server/motivos-cierre";

export const dynamic = "force-dynamic";

/** War — Motivos de cierre. Los lee todo el equipo; `?usos=1` suma cuántas oportunidades tiene cada uno. */
export const GET = withAuth(async (session, req: Request) => {
  const conUsos = new URL(req.url).searchParams.get("usos") === "1";
  const motivos = conUsos
    ? await listarMotivosConUsos(session.organizationId)
    : await listarMotivos(session.organizationId);
  return Response.json({ motivos, puedeEditar: canConfigure(session.role) });
});

/** Crear: solo quien configura. */
export const POST = withAuth(async (session, req: Request) => {
  if (!canConfigure(session.role)) return apiError(403, "forbidden", "Solo quien administra crea motivos");
  const body = await parseBody(req, motivoSchema);
  if (!body.ok) return body.response;
  try {
    return Response.json({ motivo: await crearMotivo(session.organizationId, body.data) }, { status: 201 });
  } catch (err) {
    if (err instanceof MotivoError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});

/** Reordenar: `{ ids }` en el orden en que se ven. Solo quien configura. */
export const PUT = withAuth(async (session, req: Request) => {
  if (!canConfigure(session.role)) return apiError(403, "forbidden", "Solo quien administra ordena los motivos");
  const body = await parseBody(req, ordenMotivosSchema);
  if (!body.ok) return body.response;
  return Response.json({ motivos: await ordenarMotivos(session.organizationId, body.data.ids) });
});
