import { z } from "zod";
import { apiError, parseBody, withAdmin } from "@/lib/api";
import { cambiarResponsable } from "@/server/responsables";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Cambiar el responsable `{ userId }` (`"ia"` = el agente; `null` lo saca). Solo el admin reparte. */
export const PATCH = withAdmin(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, z.object({ userId: z.string().min(1).max(60).nullable() }));
  if (!body.ok) return body.response;
  const ok = await cambiarResponsable(session.organizationId, id, body.data.userId);
  if (!ok) return apiError(404, "not_found", "Esa oportunidad o ese usuario no existen");
  return Response.json({ responsableId: body.data.userId });
});
