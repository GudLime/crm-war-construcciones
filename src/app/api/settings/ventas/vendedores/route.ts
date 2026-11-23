import { z } from "zod";
import { parseBody, withAdmin } from "@/lib/api";
import { configVendedoresSchema } from "@/lib/asignaciones";
import { guardarVendedoresAjuste, leerVendedoresAjuste } from "@/server/asignaciones";

export const dynamic = "force-dynamic";

/** Asignaciones — quién recibe en la mesa de reparto y en qué orden (define su tecla). */
export const GET = withAdmin(async (session) => {
  return Response.json({ vendedores: await leerVendedoresAjuste(session.organizationId) });
});

export const PUT = withAdmin(async (session, req: Request) => {
  const body = await parseBody(req, z.object({ vendedores: configVendedoresSchema }));
  if (!body.ok) return body.response;
  return Response.json({ vendedores: await guardarVendedoresAjuste(session.organizationId, body.data.vendedores) });
});
