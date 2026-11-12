import { apiError, parseBody, withAdmin } from "@/lib/api";
import { canConfigure } from "@/lib/auth/roles";
import {
  borrarRespuesta,
  editarRespuesta,
  QuickReplyError,
  respuestaSchema,
} from "@/server/quick-replies";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** 049 — Editar una respuesta rápida: solo quien configura. */
export const PATCH = withAdmin(async (session, req: Request, ctx: Params) => {
  if (!canConfigure(session.role)) {
    return apiError(403, "forbidden", "Solo quien administra edita respuestas rápidas");
  }
  const { id } = await ctx.params;
  const body = await parseBody(req, respuestaSchema);
  if (!body.ok) return body.response;
  try {
    return Response.json({ respuesta: await editarRespuesta(session.organizationId, id, body.data) });
  } catch (err) {
    if (err instanceof QuickReplyError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});

/** Borrar: solo quien configura. */
export const DELETE = withAdmin(async (session, _req: Request, ctx: Params) => {
  if (!canConfigure(session.role)) {
    return apiError(403, "forbidden", "Solo quien administra borra respuestas rápidas");
  }
  const { id } = await ctx.params;
  try {
    await borrarRespuesta(session.organizationId, id);
    return new Response(null, { status: 204 });
  } catch (err) {
    if (err instanceof QuickReplyError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});
