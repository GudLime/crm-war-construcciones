import { apiError, withAdmin, withAuth } from "@/lib/api";
import { canConfigure } from "@/lib/auth/roles";
import { leerAdjunto, QuickReplyError, quitarAdjunto } from "@/server/quick-replies";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; adjuntoId: string }> };

/** 0067 — El archivo de la respuesta: lo baja el compositor para mandarlo. */
export const GET = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id, adjuntoId } = await ctx.params;
  try {
    const { data, adjunto } = await leerAdjunto(session.organizationId, id, adjuntoId);
    return new Response(new Uint8Array(data), {
      headers: {
        "content-type": adjunto.mime,
        "content-length": String(data.length),
        "content-disposition": `inline; filename="${encodeURIComponent(adjunto.nombre)}"`,
        "x-content-type-options": "nosniff",
        "cache-control": "private, max-age=300",
      },
    });
  } catch (err) {
    if (err instanceof QuickReplyError) return apiError(err.status, err.code, err.message);
    return apiError(404, "not_found", "Ese archivo no está");
  }
});

export const DELETE = withAdmin(async (session, _req: Request, ctx: Params) => {
  if (!canConfigure(session.role)) {
    return apiError(403, "forbidden", "Solo quien administra edita respuestas rápidas");
  }
  const { id, adjuntoId } = await ctx.params;
  try {
    return Response.json({ respuesta: await quitarAdjunto(session.organizationId, id, adjuntoId) });
  } catch (err) {
    if (err instanceof QuickReplyError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});
