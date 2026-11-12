import { apiError, parseBody, withAdmin, withAuth } from "@/lib/api";
import { canConfigure } from "@/lib/auth/roles";
import {
  crearOrigen,
  listarOrigenes,
  listarOrigenesConUsos,
  ordenarOrigenes,
  OrigenError,
  ordenSchema,
  origenSchema,
} from "@/server/origenes";

export const dynamic = "force-dynamic";

/**
 * War — Orígenes de las oportunidades. Los lee todo el equipo (el desplegable
 * de Oportunidades); `?usos=1` suma cuántas oportunidades usa cada uno.
 */
export const GET = withAuth(async (session, req: Request) => {
  const conUsos = new URL(req.url).searchParams.get("usos") === "1";
  const origenes = conUsos
    ? await listarOrigenesConUsos(session.organizationId)
    : await listarOrigenes(session.organizationId);
  return Response.json({ origenes, puedeEditar: canConfigure(session.role) });
});

/** Crear: solo quien configura. */
export const POST = withAdmin(async (session, req: Request) => {
  if (!canConfigure(session.role)) {
    return apiError(403, "forbidden", "Solo quien administra crea orígenes");
  }
  const body = await parseBody(req, origenSchema);
  if (!body.ok) return body.response;
  try {
    const origen = await crearOrigen(session.organizationId, body.data);
    return Response.json({ origen }, { status: 201 });
  } catch (err) {
    if (err instanceof OrigenError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});

/** Reordenar: `{ ids }` en el orden en que se ven. Solo quien configura. */
export const PUT = withAdmin(async (session, req: Request) => {
  if (!canConfigure(session.role)) {
    return apiError(403, "forbidden", "Solo quien administra ordena los orígenes");
  }
  const body = await parseBody(req, ordenSchema);
  if (!body.ok) return body.response;
  return Response.json({ origenes: await ordenarOrigenes(session.organizationId, body.data.ids) });
});
