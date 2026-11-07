import { apiError, parseBody, withAuth } from "@/lib/api";
import { canConfigure } from "@/lib/auth/roles";
import { importarLote, loteSchema } from "@/server/importar-notion";

export const dynamic = "force-dynamic";

/**
 * War — Importación de Notion, de a un lote por pedido (la pantalla manda el
 * archivo en partes). `aplicar: false` prueba sin guardar nada. Solo quien
 * administra.
 */
export const POST = withAuth(async (session, req: Request) => {
  if (!canConfigure(session.role)) return apiError(403, "forbidden", "Solo quien administra importa datos");
  const body = await parseBody(req, loteSchema);
  if (!body.ok) return body.response;
  return Response.json({ informe: await importarLote(session.organizationId, body.data) });
});
