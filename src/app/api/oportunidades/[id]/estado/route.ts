import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { VALORES_ESTADO_OPORTUNIDAD, type EstadoOportunidad } from "@/lib/ventas";
import { motivoDesconocido, motivoValido } from "@/server/motivos-cierre";
import { cambiarEstadoOportunidad } from "@/server/oportunidad-historial";
import { avisarConversaciones } from "@/server/oportunidades";
import { alcanceDe, noEncontrado, puedeVerOportunidad } from "@/server/acceso";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const schema = z.object({
  estado: z.enum(VALORES_ESTADO_OPORTUNIDAD as [EstadoOportunidad, ...EstadoOportunidad[]]),
  // War — configurables: se valida contra Ajustes → Motivos de cierre.
  motivoCierre: z.string().trim().min(1).max(80).nullable().optional(),
});

/** War — Cambiar el estado desde la barra de avance: pasa por el historial. */
export const PATCH = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  if (!(await puedeVerOportunidad(alcanceDe(session), id))) return noEncontrado("Esa oportunidad");
  const body = await parseBody(req, schema);
  if (!body.ok) return body.response;
  if (!(await motivoValido(session.organizationId, body.data.motivoCierre))) {
    const e = motivoDesconocido(body.data.motivoCierre!);
    return apiError(e.status, e.code, e.message);
  }
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
