import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { motivoDesconocido, motivoValido } from "@/server/motivos-cierre";
import {
  VALORES_ESTADO_OPORTUNIDAD,
  VALORES_TIPOLOGIA,
  type EstadoOportunidad,
  type Tipologia,
} from "@/lib/ventas";
import {
  abrirOportunidad,
  actualizarOportunidadDelChat,
  estadoComercialDelContacto,
} from "@/server/oportunidades";
import { VentasError } from "@/server/ventas";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 068 — El estado comercial de un contacto, para el panel del chat: su tipo,
 * la oportunidad abierta (con etapa e interés) y cuántas tuvo antes.
 */
export const GET = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const estado = await estadoComercialDelContacto(session.organizationId, id);
  if (!estado) return apiError(404, "not_found", "Contacto no encontrado");
  return Response.json(estado);
});

/** Abre una oportunidad nueva (solo para un Lead sin otra abierta). */
export const POST = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  try {
    await abrirOportunidad(session.organizationId, id, {
      fuente: "persona",
      userId: session.userId,
    });
    return Response.json(await estadoComercialDelContacto(session.organizationId, id), {
      status: 201,
    });
  } catch (err) {
    if (err instanceof VentasError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});

const patchSchema = z.object({
  oportunidadId: z.string().min(1),
  estado: z
    .enum(VALORES_ESTADO_OPORTUNIDAD as [EstadoOportunidad, ...EstadoOportunidad[]])
    .optional(),
  // War — configurables: se valida contra Ajustes → Motivos de cierre.
  motivoCierre: z.string().trim().min(1).max(80).nullable().optional(),
  edificioIds: z.array(z.string().min(1)).max(50).optional(),
  tipologias: z
    .array(z.enum(VALORES_TIPOLOGIA as [Tipologia, ...Tipologia[]]))
    .max(5)
    .optional(),
});

/** Lo que una persona cambia desde el chat: etapa, cierre e interés. */
export const PATCH = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;
  if (!(await motivoValido(session.organizationId, body.data.motivoCierre))) {
    const e = motivoDesconocido(body.data.motivoCierre!);
    return apiError(e.status, e.code, e.message);
  }
  try {
    await actualizarOportunidadDelChat({
      organizationId: session.organizationId,
      ...body.data,
      userId: session.userId,
    });
    return Response.json(await estadoComercialDelContacto(session.organizationId, id));
  } catch (err) {
    if (err instanceof VentasError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});
