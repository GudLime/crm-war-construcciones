import { z } from "zod";
import { apiError, parseBody, withAdmin } from "@/lib/api";
import { canConfigure } from "@/lib/auth/roles";
import { describirObjeto } from "@/server/motor/api";
import { cambiarVisibilidadAgente } from "@/server/motor/agente";
import { cargarMotor } from "@/server/motor/metadatos";

/**
 * Motor — qué ve el agente de un objeto: el interruptor del objeto y el ícono
 * de IA de cada columna. Solo quien administra. No cambia la estructura (eso
 * vive en la configuración del cliente), solo la visibilidad.
 *
 * PATCH { visible?: boolean, campos?: { <clave>: boolean } } → { objeto }
 */

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ objeto: string }> };

const cambioSchema = z
  .object({
    visible: z.boolean().optional(),
    campos: z.record(z.string().min(1).max(64), z.boolean()).optional(),
  })
  .refine((c) => c.visible !== undefined || Object.keys(c.campos ?? {}).length > 0, {
    message: "Nada para cambiar",
  });

export const PATCH = withAdmin(async (session, req: Request, ctx: Params) => {
  if (!canConfigure(session.role)) {
    return apiError(403, "forbidden", "Solo quien administra decide qué ve el agente");
  }
  const { objeto: clave } = await ctx.params;
  const body = await parseBody(req, cambioSchema);
  if (!body.ok) return body.response;
  const ok = await cambiarVisibilidadAgente(session.organizationId, clave, body.data);
  if (!ok) return apiError(404, "objeto_desconocido", `No existe el objeto «${clave}»`);
  const motor = await cargarMotor(session.organizationId);
  const objeto = motor.objetos.get(clave);
  if (!objeto) return apiError(404, "objeto_desconocido", `No existe el objeto «${clave}»`);
  return Response.json({ objeto: describirObjeto(motor, objeto) });
});
