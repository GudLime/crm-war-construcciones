import { parseBody, withAdmin } from "@/lib/api";
import { deshacerSchema } from "@/lib/asignaciones";
import { deshacerAsignaciones } from "@/server/asignaciones";

export const dynamic = "force-dynamic";

/** Vuelve cada oportunidad a como estaba `{ cambios: [{ id, anterior }] }`. */
export const POST = withAdmin(async (session, req: Request) => {
  const body = await parseBody(req, deshacerSchema);
  if (!body.ok) return body.response;
  const deshechas = await deshacerAsignaciones(session.organizationId, session.userId, body.data.cambios);
  return Response.json({ deshechas });
});
