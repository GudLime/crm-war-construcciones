import { withAdmin } from "@/lib/api";
import { listarVersiones } from "@/server/agente/instrucciones-versiones";

export const dynamic = "force-dynamic";

/**
 * War — Las versiones anteriores de las instrucciones del agente, de la más
 * nueva a la más vieja. Para volver a una, la pantalla la guarda con
 * `PUT /api/agent/profile` (y la actual queda, a su vez, en el historial).
 */
export const GET = withAdmin(async (session) => {
  return Response.json({ versiones: await listarVersiones(session.organizationId) });
});
