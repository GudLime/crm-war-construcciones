import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { diaSemana, enZona, formaPara, sumarDias } from "@/lib/reservas";
import {
  PERSONAS_SI_NO_SE_SABE,
  instanteDeReserva,
  localDeInstante,
  nombreParaReserva,
  personasDeFicha,
} from "@/lib/reservas-bot";
import { labelInTz } from "@/lib/time/slots";
import type { AvailableSlot } from "@/server/agenda/availability";
import type { BookingPayload } from "@/server/agenda/http";
import { clearOffers, findOffered, getOffers, replaceOffers } from "@/server/agenda/offers";
import { armarHuecos, daysWithAgenda, type ConsultaDeHuecos, type SpreadSlot } from "@/server/agenda/spread";
import {
  ReservaError,
  diasConLugar,
  disponibilidad,
  leerConfiguracion,
  tomarCupo,
} from "@/server/reservas/servicio";

/**
 * 071 — El cerebro (Nea) consulta y reserva con el módulo de Reservas.
 *
 * Con `RESERVAS` encendida, `GET /api/bot/availability` y
 * `POST /api/bot/bookings` vienen acá en vez de a la agenda genérica. El
 * contrato con el cerebro NO cambia (`docs/openapi.json`): los mismos huecos
 * en UTC, la misma oferta registrada por conversación, 201 al crear y el
 * mismo sobre de error anidado con `slots` como hermano para volver a ofrecer.
 *
 * Lo que la agenda no pide y una mesa sí: la cantidad de personas. Sale de la
 * ficha (`personas`, ver `INSTRUCCIONES_RESERVAS`). Para ofrecer horarios sin
 * ese dato se calcula para 2; para reservar sin él no se adivina: `derivar`.
 */

type SlotOfrecido = { startUtc: string; label: string };

export class ErrorDelBot extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly slots: SlotOfrecido[] = []
  ) {
    super(message);
  }
}

export function respuestaDeError(err: unknown): Response {
  if (!(err instanceof ErrorDelBot)) throw err;
  return Response.json({ error: { code: err.code, message: err.message }, slots: err.slots }, { status: err.status });
}

async function laConversacion(organizationId: string, conversationId: string) {
  const [fila] = await getDb()
    .select({
      contactId: schema.conversation.contactId,
      isTest: schema.conversation.isTest,
      ficha: schema.contact.ficha,
      nombre: schema.contact.name,
    })
    .from(schema.conversation)
    .innerJoin(schema.contact, eq(schema.contact.id, schema.conversation.contactId))
    .where(scoped(schema.conversation.organizationId, organizationId, eq(schema.conversation.id, conversationId)))
    .limit(1);
  if (!fila) throw new ErrorDelBot(404, "not_found", "Conversación no encontrada");
  return fila;
}

type Configuracion = Awaited<ReturnType<typeof leerConfiguracion>>;

function derivar(config: Configuracion, personas: number): ErrorDelBot | null {
  if (personas > config.ajustes.maxPersonas) {
    return new ErrorDelBot(
      409,
      "derivar",
      `Son más de ${config.ajustes.maxPersonas} personas: la reserva la toma alguien del equipo`
    );
  }
  if (!formaPara(config.cupo, personas)) {
    return new ErrorDelBot(409, "derivar", `No hay mesas para ${personas} personas: la reserva la toma alguien del equipo`);
  }
  return null;
}

/** Ese día abre (tiene horarios y no está cerrado): para distinguir «cerrado» de «lleno». */
function turnosDelDia(config: Configuracion, fecha: string): number {
  if (config.cierres.some((c) => c.fecha === fecha)) return 0;
  const dia = diaSemana(fecha);
  return config.horarios.filter((h) => h.activo && h.diaSemana === dia).length;
}

/** Los huecos libres para `personas`, con la forma de la agenda (`armarHuecos`). */
async function huecos(
  organizationId: string,
  config: Configuracion,
  q: { date: string | null; limit: number; perDay: number; days: number; personas: number; now: Date }
): Promise<{ slots: SpreadSlot[]; query: ConsultaDeHuecos }> {
  const { ajustes } = config;
  const zona = ajustes.zonaHoraria;
  const aSlot = (fecha: string, hora: string): AvailableSlot | null => {
    const startUtc = instanteDeReserva(fecha, hora, zona);
    if (!startUtc) return null;
    const endUtc = new Date(Date.parse(startUtc) + ajustes.duracionMinutos * 60_000).toISOString();
    return { startUtc, endUtc, label: labelInTz(startUtc, zona) };
  };

  const hoy = enZona(q.now, zona).fecha;
  const horizonte = sumarDias(hoy, ajustes.anticipacionDias);
  let todos: AvailableSlot[] = [];
  let candidatosDelDia = 0;
  if (q.date) {
    if (q.date >= hoy && q.date <= horizonte) {
      const d = await disponibilidad(organizationId, { fecha: q.date, personas: q.personas, ahora: q.now });
      const date = q.date;
      todos = d.horarios.filter((h) => h.hayLugar).flatMap((h) => aSlot(date, h.hora) ?? []);
      candidatosDelDia = turnosDelDia(config, q.date);
    }
  } else {
    const r = await diasConLugar(organizationId, { personas: q.personas, ahora: q.now, dias: q.days });
    todos = r.dias.flatMap((d) => d.horarios.flatMap((h) => aSlot(d.fecha, h) ?? []));
  }
  return armarHuecos({
    todos,
    timezone: zona,
    now: q.now,
    maxDaysAhead: ajustes.anticipacionDias,
    limit: q.limit,
    perDay: q.perDay,
    days: q.days,
    date: q.date,
    candidatosDelDia,
  });
}

const formaDelContrato = (s: SpreadSlot) => ({
  startUtc: s.startUtc,
  endUtc: s.endUtc,
  label: s.label,
  dayIso: s.dayIso,
  dayLabel: s.dayLabel,
  time: s.time,
});

export async function huecosParaElBot(
  organizationId: string,
  input: { conversationId: string; date: string | null; limit: number; perDay: number; days: number; now?: Date }
) {
  const conv = await laConversacion(organizationId, input.conversationId);
  const config = await leerConfiguracion(organizationId);
  const personas = personasDeFicha(conv.ficha) ?? PERSONAS_SI_NO_SE_SABE;
  const tope = derivar(config, personas);
  if (tope) throw tope;

  const { slots, query } = await huecos(organizationId, config, { ...input, personas, now: input.now ?? new Date() });
  // Igual que la agenda: la oferta vigente es la última, pero una consulta por
  // día que no encontró nada no borra lo que ya se había ofrecido.
  if (!input.date || slots.length > 0) {
    await replaceOffers(
      organizationId,
      input.conversationId,
      slots.map((s) => ({ startUtc: s.startUtc, label: s.label }))
    );
  }
  return { slots: slots.map(formaDelContrato), diasConAgenda: daysWithAgenda(slots), query };
}

/**
 * Ese horario ya no tiene lugar: alternativas frescas del mismo día (o, si no
 * queda ninguna, el reparto de los próximos), registradas como la nueva oferta.
 */
async function sinLugar(
  organizationId: string,
  conversationId: string,
  config: Configuracion,
  fecha: string,
  personas: number,
  now: Date
): Promise<ErrorDelBot> {
  const base = { limit: 12, perDay: 3, days: 5, personas, now };
  let { slots } = await huecos(organizationId, config, { ...base, date: fecha });
  if (!slots.length) ({ slots } = await huecos(organizationId, config, { ...base, date: null }));
  const oferta = slots.map((s) => ({ startUtc: s.startUtc, label: s.label }));
  await replaceOffers(organizationId, conversationId, oferta);
  return new ErrorDelBot(409, "slot_taken", "Ese horario ya no tiene lugar", slots.map(formaDelContrato));
}

export async function reservarDesdeElBot(
  organizationId: string,
  input: { conversationId: string; startUtc: string; notes: string | null; now?: Date }
): Promise<BookingPayload> {
  const now = input.now ?? new Date();
  const conv = await laConversacion(organizationId, input.conversationId);
  if (Number.isNaN(Date.parse(input.startUtc))) throw new ErrorDelBot(422, "invalid_body", "Instante inválido");

  // La regla innegociable: solo se reserva lo que se ofreció.
  const ofertas = await getOffers(organizationId, input.conversationId);
  if (!findOffered(ofertas, input.startUtc)) {
    throw new ErrorDelBot(409, "slot_not_offered", "Ese horario no se ofreció en esta conversación", ofertas);
  }

  const config = await leerConfiguracion(organizationId);
  const zona = config.ajustes.zonaHoraria;
  const local = localDeInstante(input.startUtc, zona);
  if (!local) throw new ErrorDelBot(422, "invalid_body", "Instante inválido");

  const personas = personasDeFicha(conv.ficha);
  if (personas === null) {
    throw new ErrorDelBot(
      409,
      "derivar",
      "Falta la cantidad de personas en la ficha (clave personas): la reserva la termina alguien del equipo"
    );
  }
  const tope = derivar(config, personas);
  if (tope) throw tope;
  const label = labelInTz(input.startUtc, zona);

  // Laboratorio: una conversación de prueba nunca ocupa cupo. Se contesta como
  // si reservara, con las mismas reglas, sin crear nada.
  if (conv.isTest) {
    const d = await disponibilidad(organizationId, { fecha: local.fecha, personas, ahora: now });
    if (!d.horarios.some((h) => h.hora === local.hora && h.hayLugar)) {
      throw await sinLugar(organizationId, input.conversationId, config, local.fecha, personas, now);
    }
    await clearOffers(organizationId, input.conversationId);
    return { bookingId: `prueba_${randomBytes(9).toString("base64url")}`, meetingLink: null, linkPending: false, label };
  }

  try {
    const reserva = await tomarCupo(organizationId, {
      contactId: conv.contactId,
      fecha: local.fecha,
      hora: local.hora,
      personas,
      nombre: nombreParaReserva(conv.ficha, conv.nombre),
      canal: "whatsapp",
      observaciones: input.notes?.trim() || null,
      actor: { fuente: "ia" },
      ahora: now,
    });
    await clearOffers(organizationId, input.conversationId);
    return { bookingId: reserva.id, meetingLink: null, linkPending: false, label };
  } catch (err) {
    if (!(err instanceof ReservaError)) throw err;
    if (err.code === "sin_lugar" || err.code === "fuera_de_horario") {
      throw await sinLugar(organizationId, input.conversationId, config, local.fecha, personas, now);
    }
    if (err.code === "derivar") throw new ErrorDelBot(409, "derivar", err.message);
    throw new ErrorDelBot(err.status, err.code === "invalid_body" ? "invalid_body" : err.code, err.message);
  }
}
