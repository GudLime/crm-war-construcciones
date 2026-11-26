import { z } from "zod";
import { apiError, parseBody } from "@/lib/api";
import { requireBotKey, resolveInstanceOrg } from "@/server/bot/auth";
import { agendaDisabledResponse, agendaEnabled } from "@/server/agenda/flag";
import {
  createSessionBooking,
  rescheduleForConversation,
} from "@/server/agenda/service";
import { bookingErrorResponse, bookingPayload } from "@/server/agenda/http";
import { edificioPorNombreOId } from "@/server/agenda/availability";
import { reservasEnabled } from "@/server/reservas/flag";
import { reservarDesdeElBot, respuestaDeError } from "@/server/reservas/bot";

export const dynamic = "force-dynamic";

/**
 * 015 — Reservar y mover citas, para quien conduce la conversación.
 *
 * CONTRATO: crear responde **201**, mover responde **200**. No es purismo: en
 * un sistema real un cliente que validaba `status === 200` dejó a TODOS los
 * leads sin poder agendar durante horas, y los mocks no lo detectaron porque
 * respondían 200. Si escribes un cliente, acepta 2xx.
 *
 * Y el sobre del error va ANIDADO (`{"error":{"code":…}}`) con `slots` como
 * hermano: un mock con la forma plana escondió el camino de re-oferta durante
 * semanas en ese mismo sistema.
 *
 * 071 — Con `RESERVAS` encendida (aunque también esté `AGENDA`) reserva en el
 * módulo de Reservas con el mismo contrato (`src/server/reservas/bot.ts`).
 * Mover una reserva no va por acá: 409 `derivar` y la cambia alguien del equipo.
 */

const createSchema = z.object({
  conversationId: z.string().min(1),
  startUtc: z.string().min(1),
  notes: z.string().nullish(),
  /** v6 — La visita es a este edificio (id o nombre): se mide con SU horario de visitas. */
  edificio: z.string().trim().min(1).max(200).nullish(),
});

const rescheduleSchema = z.object({
  conversationId: z.string().min(1),
  startUtc: z.string().min(1),
});

export async function POST(req: Request) {
  const gate = await guard(req);
  if ("response" in gate) return gate.response;

  const body = await parseBody(req, createSchema);
  if (!body.ok) return body.response;

  if (reservasEnabled()) {
    try {
      const reserva = await reservarDesdeElBot(gate.organizationId, {
        conversationId: body.data.conversationId,
        startUtc: body.data.startUtc,
        notes: body.data.notes ?? null,
      });
      return Response.json(reserva, { status: 201 });
    } catch (err) {
      return respuestaDeError(err);
    }
  }

  try {
    const edificioId = body.data.edificio ? await edificioPorNombreOId(gate.organizationId, body.data.edificio) : null;
    const result = await createSessionBooking({
      organizationId: gate.organizationId,
      conversationId: body.data.conversationId,
      startUtc: body.data.startUtc,
      notes: body.data.notes ?? null,
      ...(edificioId ? { modo: "visita" as const, edificioId } : {}),
      source: "ai",
      // La regla innegociable: el agente solo reserva lo que ya ofreció.
      requireOffer: true,
    });
    return Response.json(bookingPayload(result), { status: 201 });
  } catch (err) {
    return bookingErrorResponse(err);
  }
}

export async function PATCH(req: Request) {
  const gate = await guard(req);
  if ("response" in gate) return gate.response;

  const body = await parseBody(req, rescheduleSchema);
  if (!body.ok) return body.response;

  if (reservasEnabled()) {
    return Response.json(
      { error: { code: "derivar", message: "Cambiar una reserva lo hace alguien del equipo" }, slots: [] },
      { status: 409 }
    );
  }

  try {
    const result = await rescheduleForConversation({
      organizationId: gate.organizationId,
      conversationId: body.data.conversationId,
      startUtc: body.data.startUtc,
    });
    // 200 y no 201: mover una cita no crea un recurso nuevo.
    return Response.json(bookingPayload(result));
  } catch (err) {
    return bookingErrorResponse(err);
  }
}

/* Cancelar NO existe por esta superficie a propósito: esa decisión es del
 * dueño del negocio, no del agente. El camino es el handoff. */

type Gate = { organizationId: string } | { response: Response };

async function guard(req: Request): Promise<Gate> {
  if (!agendaEnabled() && !reservasEnabled()) return { response: agendaDisabledResponse() };
  const denied = requireBotKey(req);
  if (denied) return { response: denied };
  const organizationId = await resolveInstanceOrg();
  if (!organizationId) {
    return {
      response: apiError(409, "no_org", "La instancia aún no tiene organización"),
    };
  }
  return { organizationId };
}

