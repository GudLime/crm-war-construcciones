import { and, eq } from "drizzle-orm";
import { withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { alcanceDe, noEncontrado, prohibido, puedeEditarReunion } from "@/server/acceso";
import { publish } from "@/server/events/bus";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 0054 — Confirmar una cita (Inicio · Visitas de hoy). La marca una persona
 * del equipo; no le manda nada al cliente. Idempotente: confirmar dos veces
 * deja la primera confirmación.
 */
export const POST = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  if (!(await puedeEditarReunion(alcanceDe(session), id))) {
    return prohibido("Esa visita es de otra persona: la podés ver, no confirmar");
  }
  const b = schema.booking;
  const [fila] = await getDb()
    .select({ id: b.id, confirmadaAt: b.confirmadaAt })
    .from(b)
    .where(and(eq(b.organizationId, session.organizationId), eq(b.id, id), eq(b.kind, "session")))
    .limit(1);
  if (!fila) return noEncontrado("Esa cita");
  if (!fila.confirmadaAt) {
    await getDb()
      .update(b)
      .set({ confirmadaAt: new Date(), confirmadaPorUserId: session.userId, updatedAt: new Date() })
      .where(and(eq(b.organizationId, session.organizationId), eq(b.id, id)));
    publish(session.organizationId, { type: "booking.updated", data: { bookingId: id } });
  }
  return Response.json({ ok: true });
});
