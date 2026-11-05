import { z } from "zod";
import { apiError, parseBody } from "@/lib/api";
import { nombreDelLead, origenCanonico } from "@/lib/leads";
import { ORIGENES_OPORTUNIDAD } from "@/lib/ventas";
import { resolveInstanceOrg } from "@/server/bot/auth";
import { exigirLlaveLeads } from "@/server/integraciones/auth";
import { LeadError, recibirLead } from "@/server/integraciones/leads";

export const dynamic = "force-dynamic";

const texto = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim())
  .optional()
  .nullable();

/**
 * War — Entrada de leads para las automatizaciones (Make): formularios de
 * Meta Ads y portales. Un escenario por formulario manda su edificio y su
 * origen fijos. Idempotente por `leadId`.
 *
 * Header: `X-API-Key: <LEADS_API_KEY>`.
 */
const bodySchema = z.object({
  leadId: z.union([z.string(), z.number()]).transform((v) => String(v).trim()).pipe(
    z.string().min(1, "Falta el leadId").max(200)
  ),
  origen: z.string().trim().min(1),
  edificio: texto,
  nombreCompleto: texto,
  nombre: texto,
  apellido: texto,
  telefono: texto,
  email: texto,
  campaignId: texto,
  campaignName: texto,
  adsetId: texto,
  adsetName: texto,
  adId: texto,
  adName: texto,
  formId: texto,
  formName: texto,
  plataforma: texto,
  /** Fecha del lead (ISO o epoch en segundos). Sin ella, ahora. */
  creadoEn: texto,
  /** Preguntas extra del formulario, tal cual. */
  respuestas: z.record(z.string(), z.unknown()).optional().nullable(),
});

function fecha(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const n = Number(raw);
  const d = Number.isFinite(n) && n > 0 ? new Date(n < 1e12 ? n * 1000 : n) : new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function emailValido(raw: string | null | undefined): string | null {
  const e = raw?.trim();
  return e && e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

export async function POST(req: Request) {
  const denegado = exigirLlaveLeads(req);
  if (denegado) return denegado;

  const organizationId = await resolveInstanceOrg();
  if (!organizationId) {
    return apiError(409, "no_org", "La instancia aún no tiene organización");
  }

  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;
  const d = body.data;

  const origen = origenCanonico(d.origen);
  if (!origen) {
    return apiError(
      422,
      "origen_desconocido",
      `Origen «${d.origen}» desconocido. Válidos: ${ORIGENES_OPORTUNIDAD.join(", ")}`
    );
  }

  try {
    const resultado = await recibirLead(organizationId, {
      leadId: d.leadId,
      origen,
      nombre: nombreDelLead(d),
      telefono: d.telefono || null,
      email: emailValido(d.email),
      edificio: d.edificio || null,
      campaignId: d.campaignId || null,
      campaignName: d.campaignName || null,
      adsetId: d.adsetId || null,
      adsetName: d.adsetName || null,
      adId: d.adId || null,
      adName: d.adName || null,
      formId: d.formId || null,
      formName: d.formName || null,
      plataforma: d.plataforma || null,
      recibidoAt: fecha(d.creadoEn),
      respuestas: d.respuestas ?? null,
    });
    return Response.json(resultado, { status: resultado.resultado === "nueva" ? 201 : 200 });
  } catch (err) {
    if (err instanceof LeadError) return apiError(err.status, err.code, err.message);
    console.error("[leads] error al recibir un lead:", err);
    return apiError(500, "internal", "Error interno");
  }
}
