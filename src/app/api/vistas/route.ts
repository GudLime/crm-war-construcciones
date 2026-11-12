import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { esAdmin } from "@/lib/auth/roles";
import { PAGINAS_CON_VISTAS, vistaEntradaSchema } from "@/lib/vistas";
import { crearVista, listarVistas } from "@/server/vistas";

export const dynamic = "force-dynamic";

const pagina = z.enum(PAGINAS_CON_VISTAS);

/** Las vistas guardadas de una página (del equipo y propias), la última usada y quién mira. */
export const GET = withAuth(async (session, req: Request) => {
  const p = pagina.safeParse(new URL(req.url).searchParams.get("pagina"));
  if (!p.success) return apiError(422, "invalid_body", "Página desconocida");
  const q = { organizationId: session.organizationId, userId: session.userId };
  return Response.json({ ...(await listarVistas(q, p.data)), yo: session.userId, admin: esAdmin(session.role) });
});

const crearSchema = vistaEntradaSchema.extend({ pagina, compartida: z.boolean().default(false) });

export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, crearSchema);
  if (!body.ok) return body.response;
  const { pagina: p, ...datos } = body.data;
  const vista = await crearVista({ organizationId: session.organizationId, userId: session.userId }, p, datos);
  return Response.json({ vista }, { status: 201 });
});
