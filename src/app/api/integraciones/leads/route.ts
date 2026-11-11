import { apiError, parseBody } from "@/lib/api";
import { leadBodySchema as bodySchema, nombreDelLead } from "@/lib/leads";
import { origenCanonico } from "@/lib/origenes";
import { ambientesDeTexto } from "@/lib/ventas";
import { resolveInstanceOrg } from "@/server/bot/auth";
import { exigirLlaveLeads } from "@/server/integraciones/auth";
import { LeadError, recibirLead } from "@/server/integraciones/leads";
import { listarOrigenes } from "@/server/origenes";

export const dynamic = "force-dynamic";

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

/**
 * War — Entrada de leads para las automatizaciones (Make): formularios de
 * Meta Ads y portales. Un escenario por formulario manda su edificio y su
 * origen fijos. Idempotente por `leadId`. Header `X-API-Key: <LEADS_API_KEY>`.
 * Contrato: `docs/openapi-integraciones.json` · guía: `docs/integraciones-leads.md`.
 */
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

  // Los válidos son los de Configuración → Orígenes.
  const nombres = (await listarOrigenes(organizationId)).map((o) => o.nombre);
  const origen = origenCanonico(d.origen, nombres);
  if (!origen) {
    return apiError(
      422,
      "origen_desconocido",
      `Origen «${d.origen}» desconocido. Válidos: ${nombres.join(", ")}`
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
      ambientes: ambientesDeTexto(d.ambientes),
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
