import { withAuth } from "@/lib/api";
import { esAdmin } from "@/lib/auth/roles";
import { listarResponsables } from "@/server/responsables";

export const dynamic = "force-dynamic";

/** Quiénes pueden ser responsables de una oportunidad (el equipo) y si quien mira los puede asignar. */
export const GET = withAuth(async (session) => {
  return Response.json({
    responsables: await listarResponsables(session.organizationId),
    admin: esAdmin(session.role),
  });
});
