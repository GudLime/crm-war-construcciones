import { withAuth } from "@/lib/api";
import { esAdmin } from "@/lib/auth/roles";
import { listarEquipo } from "@/server/ventas";

export const dynamic = "force-dynamic";

/** El equipo de la organización (para elegir y filtrar responsables) y quién mira. */
export const GET = withAuth(async (session) => {
  return Response.json({
    equipo: await listarEquipo(session.organizationId),
    yo: session.userId,
    admin: esAdmin(session.role),
  });
});
