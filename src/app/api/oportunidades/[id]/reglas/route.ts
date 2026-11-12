import { z } from "zod";
import { parseBody, withAuth } from "@/lib/api";
import { respuestaDeError } from "@/server/motor/api";
import { aplicarRegla, reglasPendientes } from "@/server/motor/oportunidad";
import { alcanceDe, noEncontrado, puedeVerOportunidad } from "@/server/acceso";

/**
 * 070 — Reglas de etapa con más de un candidato: la pantalla pregunta cuáles.
 * GET `?etapa=reservo`: las pendientes. POST: aplica una regla a los registros
 * elegidos (Reservó → estas dos unidades, Reservado).
 */

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const cuerpoSchema = z.object({
  regla: z.string().min(1),
  registros: z.array(z.string().min(1)).min(1).max(200),
});

export const GET = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  if (!(await puedeVerOportunidad(alcanceDe(session), id))) return noEncontrado("Esa oportunidad");
  const etapa = new URL(req.url).searchParams.get("etapa") ?? "";
  try {
    return Response.json({ pendientes: etapa ? await reglasPendientes(session.organizationId, id, etapa) : [] });
  } catch (err) {
    return respuestaDeError(err);
  }
});

export const POST = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  if (!(await puedeVerOportunidad(alcanceDe(session), id))) return noEncontrado("Esa oportunidad");
  const body = await parseBody(req, cuerpoSchema);
  if (!body.ok) return body.response;
  try {
    const aplicados = await aplicarRegla(session.organizationId, id, body.data.regla, body.data.registros, {
      tipo: "usuario",
      id: session.userId,
    });
    return Response.json({ aplicados });
  } catch (err) {
    return respuestaDeError(err);
  }
});
