import { eq } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { agendaDisabledResponse, agendaEnabled } from "@/server/agenda/flag";
import {
  cancelBooking,
  markBookingStatus,
  rescheduleBooking,
  retryMeetingLink,
  updateBookingDatos,
} from "@/server/agenda/service";
import { bookingErrorResponse } from "@/server/agenda/http";
import { getBookingItem } from "@/server/agenda/queries";
import { alcanceDe, prohibido, puedeEditarReunion } from "@/server/acceso";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reschedule"), startUtc: z.string().min(1), forzarHorario: z.boolean().optional() }),
  z.object({ action: z.literal("cancel") }),
  z.object({
    action: z.literal("status"),
    status: z.enum(["realizada", "no_show"]),
  }),
  z.object({ action: z.literal("retry_link") }),
  // v3 — Los datos de la ventana de la cita.
  z.object({
    action: z.literal("datos"),
    notes: z.string().max(4000).nullish(),
    modo: z.enum(["visita", "reunion"]).optional(),
    edificioId: z.string().min(1).nullable().optional(),
    ubicacion: z.string().trim().max(300).nullable().optional(),
    responsableId: z.string().min(1).nullable().optional(),
  }),
]);

/** v3 — Una cita para su ventana de detalle (la abre el widget del Inicio). */
export const GET = withAuth(async (session, _req: Request, ctx: Params) => {
  if (!agendaEnabled()) return agendaDisabledResponse();
  const { id } = await ctx.params;
  const cita = await getBookingItem(session.organizationId, id);
  if (!cita) return apiError(404, "not_found", "Esa cita no existe");
  return Response.json({ booking: cita, editable: await puedeEditarReunion(alcanceDe(session), id) });
});

/**
 * 015 — Reprogramar, cancelar (idempotente), marcar el resultado o reintentar
 * el enlace que el proveedor no entregó.
 */
export const PATCH = withAuth(async (session, req: Request, ctx: Params) => {
  if (!agendaEnabled()) return agendaDisabledResponse();
  const { id } = await ctx.params;
  if (!(await puedeEditarReunion(alcanceDe(session), id))) return prohibido("Esa visita es de otra persona: la podés ver, no cambiar");
  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;

  try {
    switch (body.data.action) {
      case "reschedule": {
        const result = await rescheduleBooking({
          organizationId: session.organizationId,
          bookingId: id,
          startUtc: body.data.startUtc,
          forzarHorario: body.data.forzarHorario === true,
        });
        return Response.json({ ok: true, label: result.label });
      }
      case "cancel": {
        await cancelBooking({
          organizationId: session.organizationId,
          bookingId: id,
        });
        return Response.json({ ok: true });
      }
      case "status": {
        await markBookingStatus({
          organizationId: session.organizationId,
          bookingId: id,
          status: body.data.status,
        });
        return Response.json({ ok: true });
      }
      case "datos": {
        const d = body.data;
        if (d.edificioId) {
          const [e] = await getDb()
            .select({ id: schema.edificio.id })
            .from(schema.edificio)
            .where(scoped(schema.edificio.organizationId, session.organizationId, eq(schema.edificio.id, d.edificioId)))
            .limit(1);
          if (!e) return apiError(422, "invalid_body", "Ese edificio no existe");
        }
        if (d.responsableId) {
          const [m] = await getDb()
            .select({ id: schema.member.id })
            .from(schema.member)
            .where(scoped(schema.member.organizationId, session.organizationId, eq(schema.member.userId, d.responsableId)))
            .limit(1);
          if (!m) return apiError(422, "invalid_body", "Esa persona no es del equipo");
        }
        await updateBookingDatos({
          organizationId: session.organizationId,
          bookingId: id,
          ...(d.notes !== undefined ? { notes: d.notes } : {}),
          ...(d.modo !== undefined ? { modo: d.modo } : {}),
          ...(d.edificioId !== undefined ? { edificioId: d.edificioId } : {}),
          ...(d.ubicacion !== undefined ? { ubicacion: d.ubicacion } : {}),
          ...(d.responsableId !== undefined ? { responsableUserId: d.responsableId } : {}),
        });
        return Response.json({ ok: true });
      }
      case "retry_link": {
        const result = await retryMeetingLink({
          organizationId: session.organizationId,
          bookingId: id,
        });
        return Response.json({
          ok: true,
          meetingLink: result.meetingLink,
          linkPending: result.linkPending,
        });
      }
    }
  } catch (err) {
    return bookingErrorResponse(err);
  }
});
