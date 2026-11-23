import { z } from "zod";
import { parseBody, withAuth } from "@/lib/api";
import { esAdmin } from "@/lib/auth/roles";
import { noEncontrado } from "@/server/acceso";
import { resultadoDeLlamada } from "@/server/llamadas";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const schema = z.object({
  resultado: z.enum(["atendio", "no_atendio"]),
  comentario: z.string().trim().max(4000).nullable().optional(),
});

/** Cómo salió una llamada: `{ resultado: "atendio" | "no_atendio", comentario? }`. */
export const POST = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, schema);
  if (!body.ok) return body.response;
  const r = await resultadoDeLlamada({
    organizationId: session.organizationId,
    tareaId: id,
    userId: session.userId,
    admin: esAdmin(session.role),
    ...body.data,
  });
  if (!r) return noEncontrado("Esa tarea");
  return Response.json(r);
});
