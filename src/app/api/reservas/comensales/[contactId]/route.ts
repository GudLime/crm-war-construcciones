import { z } from "zod";
import { parseBody, withAuth } from "@/lib/api";
import { COMENSAL_VACIO } from "@/lib/reservas";
import { conReservas } from "@/server/reservas/http";
import { comensal, comensales, guardarAceptaPromociones, historialDe } from "@/server/reservas/comensales";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ contactId: string }> };

/** 071 — Una persona en un restaurante: sus números, su segmento y sus reservas. */
export const GET = withAuth(async (session, _req: Request, ctx: Params) =>
  conReservas(async () => {
    const { contactId } = await ctx.params;
    const [todos, historial] = await Promise.all([
      comensales(session.organizationId, [contactId]),
      historialDe(session.organizationId, contactId),
    ]);
    return Response.json({
      comensal: todos.porContacto[contactId] ?? { ...COMENSAL_VACIO, segmento: "nuevo" },
      umbral: todos.umbral,
      historial,
    });
  })
);

const schema = z.object({ aceptaPromociones: z.boolean() });

/** Marca si acepta promociones. */
export const PATCH = withAuth(async (session, req: Request, ctx: Params) =>
  conReservas(async () => {
    const { contactId } = await ctx.params;
    const body = await parseBody(req, schema);
    if (!body.ok) return body.response;
    await guardarAceptaPromociones(session.organizationId, contactId, body.data.aceptaPromociones);
    return Response.json({ comensal: await comensal(session.organizationId, contactId) });
  })
);
