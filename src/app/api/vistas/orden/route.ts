import { z } from "zod";
import { parseBody, withAuth } from "@/lib/api";
import { PAGINAS_CON_VISTAS } from "@/lib/vistas";
import { guardarOrden } from "@/server/vistas";

export const dynamic = "force-dynamic";

const schema = z.object({
  pagina: z.enum(PAGINAS_CON_VISTAS),
  ids: z.array(z.string().min(1).max(60)).max(200),
});

/** v6 — Guarda el orden de las pestañas de quien mira (cada persona el suyo). */
export const PUT = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, schema);
  if (!body.ok) return body.response;
  await guardarOrden(
    { organizationId: session.organizationId, userId: session.userId },
    body.data.pagina,
    body.data.ids
  );
  return new Response(null, { status: 204 });
});
