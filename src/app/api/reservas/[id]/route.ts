import { z } from "zod";
import { parseBody, withAuth } from "@/lib/api";
import { conReservas } from "@/server/reservas/http";
import { cambiarSector } from "@/server/reservas/servicio";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const schema = z.object({ sector: z.string().trim().min(1).max(40) });

/** 071 — Cambiar el sector de una reserva (si ahí entran sus mesas). El estado va por la oportunidad. */
export const PATCH = withAuth(async (session, req: Request, ctx: Params) =>
  conReservas(async () => {
    const { id } = await ctx.params;
    const body = await parseBody(req, schema);
    if (!body.ok) return body.response;
    await cambiarSector(session.organizationId, id, body.data.sector);
    return Response.json({ ok: true });
  })
);
