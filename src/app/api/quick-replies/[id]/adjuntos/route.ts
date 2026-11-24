import { apiError, withAdmin } from "@/lib/api";
import { canConfigure } from "@/lib/auth/roles";
import { agregarAdjunto, QuickReplyError } from "@/server/quick-replies";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** 0067 — Sumar una foto o un video a la respuesta (multipart `file`): solo quien configura. */
export const POST = withAdmin(async (session, req: Request, ctx: Params) => {
  if (!canConfigure(session.role)) {
    return apiError(403, "forbidden", "Solo quien administra edita respuestas rápidas");
  }
  const { id } = await ctx.params;
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return apiError(422, "invalid", "Falta el archivo (campo `file`)");
  try {
    const respuesta = await agregarAdjunto(session.organizationId, id, {
      data: Buffer.from(await file.arrayBuffer()),
      mime: file.type || "application/octet-stream",
      nombre: file.name || "archivo",
    });
    return Response.json({ respuesta }, { status: 201 });
  } catch (err) {
    if (err instanceof QuickReplyError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});
