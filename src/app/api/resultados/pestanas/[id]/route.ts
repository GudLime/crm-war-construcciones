import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { borrarPestana, PestanaError, renombrarPestana } from "@/server/resultados-pestanas";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const cambio = z.object({ nombre: z.string().trim().min(1).max(60) });

export const PATCH = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, cambio);
  if (!body.ok) return body.response;
  try {
    await renombrarPestana(session, id, body.data.nombre);
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof PestanaError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});

export const DELETE = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  try {
    await borrarPestana(session, id);
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof PestanaError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});
