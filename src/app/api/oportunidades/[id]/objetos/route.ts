import { z } from "zod";
import { parseBody, withAuth } from "@/lib/api";
import { respuestaDeError } from "@/server/motor/api";
import { vincularOportunidad, vinculosDeOportunidad } from "@/server/motor/oportunidad";

/**
 * 070 — Los objetos del cliente vinculados a una oportunidad (unidades,
 * tratamientos…). GET: por relación. PUT: deja vinculados exactamente los
 * registros que llegan. Sin configuración del cliente, la lista viene vacía.
 */

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const cuerpoSchema = z.object({
  relacion: z.string().min(1),
  registros: z.array(z.string().min(1)).max(200),
});

export const GET = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  try {
    return Response.json({ vinculos: await vinculosDeOportunidad(session.organizationId, id) });
  } catch (err) {
    return respuestaDeError(err);
  }
});

export const PUT = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, cuerpoSchema);
  if (!body.ok) return body.response;
  try {
    await vincularOportunidad(session.organizationId, id, body.data.relacion, body.data.registros);
    return Response.json({ vinculos: await vinculosDeOportunidad(session.organizationId, id) });
  } catch (err) {
    return respuestaDeError(err);
  }
});
