import { apiError, withAuth } from "@/lib/api";
import { publish } from "@/server/events/bus";
import { TomarError, tomarDerivada } from "@/server/inicio";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Tomar una derivación de la IA (Inicio). Cualquiera del equipo puede: las
 * derivaciones son del equipo hasta que alguien las toma. Quien la toma pasa a
 * ver el chat; si la oportunidad no tenía una persona a cargo, también es suya.
 */
export const POST = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  try {
    const r = await tomarDerivada(session.organizationId, id, session.userId);
    publish(session.organizationId, { type: "conversation.updated", data: { conversation: { id } } });
    return Response.json(r);
  } catch (err) {
    if (err instanceof TomarError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});
