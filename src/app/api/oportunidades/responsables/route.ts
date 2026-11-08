import { withAuth } from "@/lib/api";
import { listarResponsables } from "@/server/responsables";

export const dynamic = "force-dynamic";

/** War — Quiénes pueden ser responsables de una oportunidad (el equipo). */
export const GET = withAuth(async (session) => {
  return Response.json({ responsables: await listarResponsables(session.organizationId) });
});
