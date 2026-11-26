import { and, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import {
  addDaysISO,
  eachDateInRange,
  expandWorkingDayToUtc,
  labelInTz,
  overlaps,
  todayInTz,
  weekdayKeyOf,
  zonedWallClockToUtc,
  type SlotUtc,
} from "@/lib/time/slots";
import { getSettings, normalizeWeeklyHours, type CalendarSettings, type WeeklyHours } from "@/server/agenda/settings";

/**
 * 015 — Motor de disponibilidad:
 *   horario semanal del negocio − citas activas − bloqueos manuales.
 *
 * Limitación v1 documentada (Constitución VII): NO lee calendarios externos.
 * Es una decisión, no un olvido: meter al proveedor en este camino acoplaría su
 * latencia y sus caídas a la pantalla que más se usa. Los compromisos de fuera
 * se reflejan con bloqueos manuales.
 */

export type AvailableSlot = SlotUtc & { label: string };

/**
 * PURA: expande el horario semanal a slots candidatos en UTC. Sin BD, sin
 * reloj — se testea sola (tests/unit/availability.test.ts).
 */
export function buildCandidateSlots(
  settings: CalendarSettings,
  fromISO: string,
  toISO: string
): SlotUtc[] {
  const tz = settings.timezone;
  const candidates: SlotUtc[] = [];
  for (const date of eachDateInRange(fromISO, toISO)) {
    const weekday = weekdayKeyOf(date, tz);
    if (!weekday) continue;
    const intervals = settings.weeklyHours[weekday] ?? [];
    if (intervals.length === 0) continue; // día cerrado
    candidates.push(
      ...expandWorkingDayToUtc(
        date,
        intervals,
        tz,
        settings.slotMinutes,
        settings.bufferMinutes
      )
    );
  }
  return candidates;
}

/**
 * PURA: descarta lo que ya pasó (con aviso mínimo) y lo que se solapa con algo
 * ocupado, ordena y etiqueta.
 */
export function filterFreeSlots(
  candidates: SlotUtc[],
  busy: SlotUtc[],
  opts: { now: Date; minNoticeHours: number; timezone: string }
): AvailableSlot[] {
  const minStartMs = opts.now.getTime() + opts.minNoticeHours * 3_600_000;
  return candidates
    .filter((c) => Date.parse(c.startUtc) >= minStartMs)
    .filter(
      (c) =>
        !busy.some((b) => overlaps(c.startUtc, c.endUtc, b.startUtc, b.endUtc))
    )
    .sort((a, b) => Date.parse(a.startUtc) - Date.parse(b.startUtc))
    .map((c) => ({ ...c, label: labelInTz(c.startUtc, opts.timezone) }));
}

export async function computeAvailability(
  organizationId: string,
  opts?: {
    fromISO?: string;
    toISO?: string;
    excludeBookingId?: string;
    now?: Date;
    settings?: CalendarSettings;
    /** 0069 — Citas en paralelo: las otras citas no ocupan (los bloqueos sí). */
    soloBloqueos?: boolean;
  }
): Promise<AvailableSlot[]> {
  const settings = opts?.settings ?? (await getSettings(organizationId));
  const now = opts?.now ?? new Date();
  const tz = settings.timezone;

  const from = opts?.fromISO ?? todayInTz(now, tz);
  const to = opts?.toISO ?? addDaysISO(from, settings.maxDaysAhead);

  const candidates = buildCandidateSlots(settings, from, to);
  if (candidates.length === 0) return [];

  const busy = await getBusyIntervals(organizationId, {
    fromUtc: zonedWallClockToUtc(from, "00:00", tz) ?? new Date(0),
    toUtc:
      zonedWallClockToUtc(addDaysISO(to, 1), "00:00", tz) ??
      new Date(now.getTime() + 86_400_000 * 61),
    excludeBookingId: opts?.excludeBookingId,
    soloBloqueos: opts?.soloBloqueos,
  });

  return filterFreeSlots(candidates, busy, {
    now,
    minNoticeHours: settings.minNoticeHours,
    timezone: tz,
  });
}

/**
 * Re-valida que un instante concreto siga libre. Se llama AL CONFIRMAR, nunca
 * al ofrecer. `excludeBookingId` permite reprogramar sin que la propia cita se
 * bloquee a sí misma.
 *
 * Solo recalcula ±1 día alrededor del instante pedido.
 *
 * OJO: esto reduce la ventana de la carrera, no la cierra — entre este SELECT
 * y el INSERT cabe otra confirmación. Quien cierra de verdad es el índice
 * único parcial de `booking` (research D7); esto existe para dar una respuesta
 * útil (con alternativas) en el caso normal.
 */
export async function findSlot(
  organizationId: string,
  whenISO: string,
  opts?: { excludeBookingId?: string; now?: Date; settings?: CalendarSettings; soloBloqueos?: boolean }
): Promise<AvailableSlot | null> {
  const target = Date.parse(whenISO);
  if (Number.isNaN(target)) return null;

  const settings = opts?.settings ?? (await getSettings(organizationId));
  const dayInTz = todayInTz(new Date(target), settings.timezone);

  const slots = await computeAvailability(organizationId, {
    fromISO: addDaysISO(dayInTz, -1),
    toISO: addDaysISO(dayInTz, 1),
    excludeBookingId: opts?.excludeBookingId,
    now: opts?.now,
    settings,
    soloBloqueos: opts?.soloBloqueos,
  });
  return slots.find((s) => Date.parse(s.startUtc) === target) ?? null;
}

async function getBusyIntervals(
  organizationId: string,
  input: { fromUtc: Date; toUtc: Date; excludeBookingId?: string; soloBloqueos?: boolean }
): Promise<SlotUtc[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: schema.booking.id,
      scheduledAt: schema.booking.scheduledAt,
      durationMinutes: schema.booking.durationMinutes,
    })
    .from(schema.booking)
    .where(
      scoped(
        schema.booking.organizationId,
        organizationId,
        and(
          // Canceladas y no-show liberan el hueco.
          inArray(schema.booking.status, ["agendada", "realizada"]),
          // Sandbox: una cita de prueba no consume la agenda real.
          eq(schema.booking.isTest, false),
          ...(input.soloBloqueos ? [eq(schema.booking.kind, "block")] : []),
          gte(schema.booking.scheduledAt, input.fromUtc),
          lte(schema.booking.scheduledAt, input.toUtc)
        )
      )
    );

  return rows
    .filter((r) => r.id !== input.excludeBookingId)
    .map((r) => ({
      startUtc: r.scheduledAt.toISOString(),
      endUtc: new Date(
        r.scheduledAt.getTime() + r.durationMinutes * 60_000
      ).toISOString(),
    }));
}

/**
 * v6 — El horario de visitas propio de un edificio (normalizado), o null si
 * usa el de la agenda.
 */
export async function horarioDeEdificio(
  organizationId: string,
  edificioId: string
): Promise<{ nombre: string; horario: WeeklyHours | null } | null> {
  const [f] = await getDb()
    .select({ nombre: schema.edificio.nombre, horario: schema.edificio.horarioVisitas })
    .from(schema.edificio)
    .where(and(eq(schema.edificio.organizationId, organizationId), eq(schema.edificio.id, edificioId)))
    .limit(1);
  if (!f) return null;
  const horario = f.horario ? normalizeWeeklyHours(f.horario) : null;
  return { nombre: f.nombre, horario: horario && Object.keys(horario).length ? horario : null };
}

/**
 * v6 — ¿Ese instante está libre, aunque caiga fuera del horario? Lo que
 * confirma una persona fuera de horario solo respeta los bloqueos (y las
 * otras citas, si no hay citas en paralelo). Dura lo de un turno.
 */
export async function huecoLibre(
  organizationId: string,
  startUtc: string,
  settings: CalendarSettings,
  opts: { soloBloqueos?: boolean; excludeBookingId?: string } = {}
): Promise<AvailableSlot | null> {
  const inicio = Date.parse(startUtc);
  if (Number.isNaN(inicio)) return null;
  const fin = new Date(inicio + settings.slotMinutes * 60_000).toISOString();
  const inicioIso = new Date(inicio).toISOString();
  const ocupado = await getBusyIntervals(organizationId, {
    fromUtc: new Date(inicio - 24 * 3_600_000),
    toUtc: new Date(inicio + 24 * 3_600_000),
    soloBloqueos: opts.soloBloqueos,
    excludeBookingId: opts.excludeBookingId,
  });
  if (ocupado.some((b) => overlaps(inicioIso, fin, b.startUtc, b.endUtc))) return null;
  return { startUtc: inicioIso, endUtc: fin, label: labelInTz(inicioIso, settings.timezone) };
}

/** v6 — El edificio que nombra el agente (su id o su nombre, sin distinguir mayúsculas). */
export async function edificioPorNombreOId(organizationId: string, valor: string): Promise<string | null> {
  const v = valor.trim();
  if (!v) return null;
  const [f] = await getDb()
    .select({ id: schema.edificio.id })
    .from(schema.edificio)
    .where(
      and(
        eq(schema.edificio.organizationId, organizationId),
        or(eq(schema.edificio.id, v), sql`lower(${schema.edificio.nombre}) = lower(${v})`)
      )
    )
    .limit(1);
  return f?.id ?? null;
}
