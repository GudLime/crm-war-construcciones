import { z } from "zod";
import { apiError, parseBody, withAdmin } from "@/lib/api";
import { ASIGNAR_A_IA } from "@/lib/asignacion";
import { MAX_AMBIENTES } from "@/lib/ventas";
import { VentasError } from "@/server/ventas";
import { abrirOportunidad, oportunidadAbierta, sumarInteres } from "@/server/oportunidades";
import { cambiarResponsable } from "@/server/responsables";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const cuerpoSchema = z.object({
  /** Una persona del equipo o `"ia"` (el agente). */
  userId: z.string().min(1),
  /** Si el contacto no tiene una abierta: la que se crea al asignar. */
  crear: z
    .object({
      tipo: z.enum(["venta", "alquiler"]),
      edificioIds: z.array(z.string().min(1)).max(10).default([]),
      ambientes: z.array(z.number().int().min(1).max(MAX_AMBIENTES)).max(MAX_AMBIENTES).default([]),
    })
    .optional(),
});

/**
 * v7 — Desde la Bandeja (clic derecho en un chat, solo el admin): asigna la
 * oportunidad abierta del contacto a una persona o al agente. Sin abierta y
 * sin `crear`, 409 `sin_oportunidad`: la pantalla pide edificio y tipología
 * y vuelve a llamar con `crear`.
 */
export const POST = withAdmin(async (session, req: Request, ctx: Params) => {
  const { id: contactId } = await ctx.params;
  const body = await parseBody(req, cuerpoSchema);
  if (!body.ok) return body.response;
  const org = session.organizationId;
  try {
    let op = await oportunidadAbierta(org, contactId);
    if (!op) {
      if (!body.data.crear) {
        return apiError(409, "sin_oportunidad", "Este contacto no tiene una oportunidad abierta");
      }
      op = await abrirOportunidad(org, contactId, { fuente: "persona", userId: session.userId }, body.data.crear.tipo);
      if (body.data.crear.edificioIds.length || body.data.crear.ambientes.length) {
        await sumarInteres(org, op.id, body.data.crear.edificioIds, body.data.crear.ambientes);
      }
    }
    const ok = await cambiarResponsable(org, op.id, body.data.userId === ASIGNAR_A_IA ? ASIGNAR_A_IA : body.data.userId, session.userId);
    if (!ok) return apiError(422, "invalid_body", "Esa persona no es del equipo");
    return Response.json({ oportunidadId: op.id });
  } catch (err) {
    if (err instanceof VentasError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});
