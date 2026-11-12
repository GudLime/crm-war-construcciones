import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { VALORES_ESTADO_OPORTUNIDAD, VALORES_MOTIVO, type EstadoOportunidad } from "@/lib/ventas";
import { cambiarEstadoOportunidad } from "@/server/oportunidad-historial";
import { avisarConversaciones } from "@/server/oportunidades";
import { alcanceDe, noEncontrado, puedeVerOportunidad } from "@/server/acceso";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const schema = z.object({
  estado: z.enum(VALORES_ESTADO_OPORTUNIDAD as [EstadoOportunidad, ...EstadoOportunidad[]]),
  motivoCierre: z
    .enum(VALORES_MOTIVO as unknown as [string, ...string[]])
    .nullable()
    .optional(),
});

/** War — Cambiar el estado desde la barra de avance: pasa por el historial. */
export const PATCH = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  if (!(await puedeVerOportunidad(alcanceDe(session), id))) return noEncontrado("Esa oportunidad");
  const body = await parseBody(req, schema);
  if (!body.ok) return body.response;
  const fila = await cambiarEstadoOportunidad({
    organizationId: session.organizationId,
    oportunidadId: id,
    destino: body.data.estado,
    motivoCierre: body.data.motivoCierre,
    actor: { fuente: "persona", userId: session.userId },
  });
  if (!fila) return apiError(404, "not_found", "Esa oportunidad no existe");
  if (fila.contactId) await avisarConversaciones(session.organizationId, fila.contactId);
  return Response.json({ estado: fila.estado, motivoCierre: fila.motivoCierre });
});
