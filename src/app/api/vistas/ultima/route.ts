import { z } from "zod";
import { parseBody, withAuth } from "@/lib/api";
import { PAGINAS_CON_VISTAS } from "@/lib/vistas";
import { recordarUltima } from "@/server/vistas";

export const dynamic = "force-dynamic";

const schema = z.object({ pagina: z.enum(PAGINAS_CON_VISTAS), vistaId: z.string().min(1).max(60).nullable() });

/** Recuerda la última vista que usó quien mira, para abrirla al volver. */
export const PUT = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, schema);
  if (!body.ok) return body.response;
  await recordarUltima(
    { organizationId: session.organizationId, userId: session.userId },
    body.data.pagina,
    body.data.vistaId
  );
  return new Response(null, { status: 204 });
});
