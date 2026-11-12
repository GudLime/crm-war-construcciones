import { withAuth } from "@/lib/api";
import { esAdmin } from "@/lib/auth/roles";
import { noEncontrado } from "@/server/acceso";
import { marcarTareaHecha } from "@/server/inicio";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Inicio · Tu día — Tildar una tarea: pasa a Listo. El operador, solo las suyas. */
export const POST = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const ok = await marcarTareaHecha(session.organizationId, id, session.userId, esAdmin(session.role));
  if (!ok) return noEncontrado("Esa tarea");
  return Response.json({ ok: true });
});
