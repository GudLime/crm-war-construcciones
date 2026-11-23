import { z } from "zod";
import { parseBody, withAuth } from "@/lib/api";
import { recordarPestana } from "@/server/resultados-pestanas";

export const dynamic = "force-dynamic";

const pedido = z.object({ tipo: z.enum(["fechas", "edificios"]), id: z.string().min(1).max(40).nullable() });

/** Recordar la última pestaña elegida de una fila (por persona). */
export const PUT = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, pedido);
  if (!body.ok) return body.response;
  await recordarPestana(session, body.data.tipo, body.data.id);
  return Response.json({ ok: true });
});
