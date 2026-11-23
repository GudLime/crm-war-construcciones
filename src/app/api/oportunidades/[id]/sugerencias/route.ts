import { withAuth } from "@/lib/api";
import { esAdmin } from "@/lib/auth/roles";
import { alcanceDe, noEncontrado, puedeVerOportunidad } from "@/server/acceso";
import { sugerenciasDeOportunidad } from "@/server/sugerencias";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** 0059 — Las tareas sugeridas para la etapa en que está la oportunidad (máx. 3). */
export const GET = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  if (!(await puedeVerOportunidad(alcanceDe(session), id))) return noEncontrado("Esa oportunidad");
  const dto = await sugerenciasDeOportunidad(session.organizationId, id);
  if (!dto) return noEncontrado("Esa oportunidad");
  // El admin ve además el link a Configurar plantillas.
  return Response.json({ ...dto, admin: esAdmin(session.role) });
});
