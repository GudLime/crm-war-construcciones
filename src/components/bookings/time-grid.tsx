"use client";

import { useEffect, useMemo, useRef } from "react";
import { AlertTriangle, Sparkles } from "lucide-react";
import {
  bookingSegments,
  dayHeading,
  hhmm,
  layoutOverlaps,
  offHoursBands,
  workingBands,
  type DaySegment,
} from "@/lib/time/calendar";
import type { WeeklyHours } from "@/server/agenda/settings";
import { cn } from "@/lib/utils";
import { bookingTitle, bookingTone, hasDeliveryIssue, type Booking } from "./booking-look";

/**
 * 215 — La rejilla de horas de las vistas Día y Semana, como Google Calendar:
 * cada cita ocupa el alto de su duración, lo que se solapa se reparte el
 * ancho, lo no hábil se sombrea y una línea marca la hora actual.
 *
 * Todo en la zona del negocio: el día y el minuto de cada cita los decide
 * `bookingSegments`, no el reloj del navegador.
 */

/** Alto de una hora. Con 30 min = 24 px cabe una línea de texto legible. */
const HOUR_PX = 48;
const DAY_PX = HOUR_PX * 24;
const MIN_EVENT_PX = 18;
/** Sin horario ni citas, la rejilla abre a esta hora. */
const DEFAULT_SCROLL_MIN = 8 * 60;

/**
 * Una tarea en el calendario de Tareas (cambios 23/11, punto 2): llamadas,
 * mensajes y correos como bloques de 30 min junto a las citas.
 */
export type TareaCal = {
  id: string;
  titulo: string;
  tipo: string;
  estado: string;
  /** Instante (ISO). */
  fecha: string;
  contacto: string | null;
  edificio: string | null;
};
const MIN_TAREA = 30;

type Placed = DaySegment & ({ booking: Booking; tarea?: undefined } | { tarea: TareaCal; booking?: undefined }) & {
  col: number;
  cols: number;
};

export function TimeGrid({
  days,
  bookings,
  timezone,
  weeklyHours,
  today,
  nowMinutes,
  tzLabel,
  selectedId,
  ready,
  onSelect,
  onEmptySlot,
  onOpenDay,
  tareas = [],
  onSelectTarea,
  renderIconoTarea,
}: {
  days: string[];
  bookings: Booking[];
  /** Calendario de Tareas: las tareas del rango, junto a las citas. */
  tareas?: TareaCal[];
  onSelectTarea?: (t: TareaCal) => void;
  renderIconoTarea?: (tipo: string) => React.ReactNode;
  timezone: string;
  weeklyHours: WeeklyHours;
  today: string;
  nowMinutes: number;
  /** "GMT-6": la esquina dice en qué hora está pintada la rejilla. */
  tzLabel: string;
  selectedId: string | null;
  /** Las citas de ESTE rango ya llegaron: solo entonces se decide el scroll. */
  ready: boolean;
  onSelect: (b: Booking) => void;
  onEmptySlot: (day: string, time: string) => void;
  onOpenDay: (day: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrolledFor = useRef<string | null>(null);

  const byDay = useMemo(() => {
    const map = new Map<string, Placed[]>();
    const segments = new Map<string, (DaySegment & ({ booking: Booking } | { tarea: TareaCal }))[]>();
    const sumar = (seg: DaySegment, x: { booking: Booking } | { tarea: TareaCal }) => {
      if (!days.includes(seg.day)) return;
      const list = segments.get(seg.day) ?? [];
      list.push({ ...seg, ...x });
      segments.set(seg.day, list);
    };
    for (const b of bookings) {
      for (const seg of bookingSegments(b.scheduledAtUtc, b.durationMinutes, timezone)) sumar(seg, { booking: b });
    }
    for (const t of tareas) {
      for (const seg of bookingSegments(t.fecha, MIN_TAREA, timezone)) sumar(seg, { tarea: t });
    }
    for (const [day, list] of segments) map.set(day, layoutOverlaps(list) as Placed[]);
    return map;
  }, [bookings, tareas, days, timezone]);

  // Abre donde empieza el día de trabajo (o antes, si hay una cita más
  // temprano), una sola vez por rango: un refresco por SSE no debe mover la
  // rejilla que alguien está leyendo.
  const rangeKey = `${days[0]}|${days.length}`;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !ready || scrolledFor.current === rangeKey) return;
    scrolledFor.current = rangeKey;
    const starts = [
      ...days.flatMap((d) => workingBands(weeklyHours, d).map((b) => b.startMin)),
      ...[...byDay.values()].flat().map((p) => p.startMin),
    ];
    const target = starts.length > 0 ? Math.min(...starts) : DEFAULT_SCROLL_MIN;
    el.scrollTop = Math.max(0, ((target - 45) / 60) * HOUR_PX);
  }, [ready, rangeKey, days, weeklyHours, byDay]);

  const multi = days.length > 1;
  const columns = `3.5rem repeat(${days.length}, minmax(${multi ? "5.5rem" : "0"}, 1fr))`;

  return (
    <div
      ref={scrollRef}
      className="relative min-h-0 flex-1 overflow-auto rounded-lg border bg-card"
      style={{ "--cal-hour": `${HOUR_PX}px` } as React.CSSProperties}
    >
      <div className="grid" style={{ gridTemplateColumns: columns, minWidth: multi ? "40rem" : undefined }}>
        {/* Encabezados: pegados arriba mientras se desplaza la rejilla. Capas:
            esquina > días > horas > columnas (cada columna aísla las suyas). */}
        <div className="sticky left-0 top-0 z-40 flex items-end justify-end border-b border-r bg-card px-1.5 pb-1.5 font-mono text-[10px] text-text-3">
          {tzLabel}
        </div>
        {days.map((day) => {
          const h = dayHeading(day);
          const isToday = day === today;
          return (
            <button
              key={day}
              type="button"
              onClick={() => onOpenDay(day)}
              disabled={!multi}
              aria-label={`Ver el ${h.weekday} ${h.day} en la vista de día`}
              className="sticky top-0 z-30 flex flex-col items-center gap-0.5 border-b border-l bg-card py-2 transition-colors enabled:hover:bg-row-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-soft"
            >
              <span className={cn("kicker", isToday && "text-brand-text")}>{h.weekday}</span>
              <span
                className={cn(
                  "flex h-8 min-w-8 items-center justify-center rounded-full px-1 text-[17px] font-semibold tabular-nums",
                  isToday ? "bg-brand text-brand-fg" : "text-foreground"
                )}
              >
                {h.day}
              </span>
            </button>
          );
        })}

        {/* Columna de horas. */}
        <div className="sticky left-0 z-20 border-r bg-card" style={{ height: DAY_PX }}>
          {Array.from({ length: 23 }, (_, i) => i + 1).map((h) => (
            <span
              key={h}
              className="absolute right-1.5 -translate-y-1/2 font-mono text-[10.5px] text-text-3"
              style={{ top: h * HOUR_PX }}
            >
              {hhmm(h * 60)}
            </span>
          ))}
        </div>

        {days.map((day) => (
          <DayColumn
            key={day}
            day={day}
            placed={byDay.get(day) ?? []}
            weeklyHours={weeklyHours}
            nowMinutes={day === today ? nowMinutes : null}
            narrow={multi}
            selectedId={selectedId}
            onSelect={onSelect}
            onEmptySlot={onEmptySlot}
            onSelectTarea={onSelectTarea}
            renderIconoTarea={renderIconoTarea}
          />
        ))}
      </div>
    </div>
  );
}

function DayColumn({
  day,
  placed,
  weeklyHours,
  nowMinutes,
  narrow,
  selectedId,
  onSelect,
  onEmptySlot,
  onSelectTarea,
  renderIconoTarea,
}: {
  day: string;
  placed: Placed[];
  onSelectTarea?: (t: TareaCal) => void;
  renderIconoTarea?: (tipo: string) => React.ReactNode;
  weeklyHours: WeeklyHours;
  nowMinutes: number | null;
  /** Columna de semana: en el celular mide ~90 px. */
  narrow: boolean;
  selectedId: string | null;
  onSelect: (b: Booking) => void;
  onEmptySlot: (day: string, time: string) => void;
}) {
  return (
    <div
      data-day={day}
      className="cal-hours relative isolate cursor-pointer border-l"
      style={{ height: DAY_PX }}
      // Tocar un hueco vacío propone bloquearlo a esa media hora, como el
      // "crear evento" de Google. Las citas detienen el clic.
      onClick={(e) => {
        const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
        const minutes = Math.min(1410, Math.max(0, Math.floor((y / HOUR_PX) * 2) * 30));
        onEmptySlot(day, hhmm(minutes));
      }}
    >
      {offHoursBands(weeklyHours, day).map((b) => (
        <div
          key={b.startMin}
          aria-hidden
          className="cal-off pointer-events-none absolute inset-x-0"
          style={{ top: (b.startMin / 60) * HOUR_PX + 1, height: ((b.endMin - b.startMin) / 60) * HOUR_PX - 1 }}
        />
      ))}

      {placed.map((p) =>
        p.tarea ? (
          <TareaBlock
            key={`t:${p.tarea.id}:${p.day}`}
            placed={p}
            tarea={p.tarea}
            onSelect={onSelectTarea}
            icono={renderIconoTarea?.(p.tarea.tipo)}
          />
        ) : (
          <EventBlock
            key={`${p.booking.id}:${p.day}`}
            placed={p as Placed & { booking: Booking }}
            narrow={narrow}
            selected={p.booking.id === selectedId}
            onSelect={onSelect}
          />
        )
      )}

      {nowMinutes !== null && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-danger"
          style={{ top: (nowMinutes / 60) * HOUR_PX }}
        >
          <span className="absolute -left-[5px] -top-[6px] h-2.5 w-2.5 rounded-full bg-danger" />
        </div>
      )}
    </div>
  );
}

/** El color de la barrita según el tipo de tarea. */
const BARRA_TIPO: Record<string, string> = {
  llamada: "#2563eb",
  mensaje: "#16a34a",
  correo: "#7c3aed",
  visita: "#ea580c",
  reunion: "#0891b2",
  tarea: "#64748b",
};

function TareaBlock({
  placed,
  tarea: t,
  onSelect,
  icono,
}: {
  placed: Placed;
  tarea: TareaCal;
  onSelect?: (t: TareaCal) => void;
  icono?: React.ReactNode;
}) {
  const { startMin, endMin, col, cols } = placed;
  const top = (startMin / 60) * HOUR_PX;
  const height = Math.max(MIN_EVENT_PX, ((endMin - startMin) / 60) * HOUR_PX - 2);
  const hecha = t.estado === "listo" || t.estado === "no_responde";
  const sub = [t.contacto, t.edificio].filter(Boolean).join(" · ");
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.(t);
      }}
      aria-label={`${t.titulo}, ${hhmm(startMin)}`}
      title={[t.titulo, sub].filter(Boolean).join(" — ")}
      className={cn(
        "absolute z-10 flex overflow-hidden rounded-[6px] border border-border bg-card text-left text-[11px] leading-tight shadow-sm hover:brightness-[0.97]",
        hecha && "opacity-60"
      )}
      style={{
        top: top + 1,
        height,
        left: `calc(${(col / cols) * 100}% + 2px)`,
        width: `calc(${100 / cols}% - 4px)`,
      }}
    >
      <span aria-hidden className="w-[3px] shrink-0" style={{ background: BARRA_TIPO[t.tipo] ?? BARRA_TIPO.tarea }} />
      <span className="min-w-0 flex-1 px-1.5 py-0.5">
        <span className={cn("flex min-w-0 items-center gap-1 font-semibold", hecha && "line-through")}>
          {icono && <span className="shrink-0 [&>span]:size-4 [&>span]:rounded [&_svg]:size-2.5">{icono}</span>}
          <span className="shrink-0 font-mono text-[10px] text-text-3">{hhmm(startMin)}</span>
          <span className="truncate">{t.titulo}</span>
        </span>
        {height >= 34 && sub && <span className="block truncate text-[10.5px] text-text-3">{sub}</span>}
      </span>
    </button>
  );
}

function EventBlock({
  placed,
  narrow,
  selected,
  onSelect,
}: {
  placed: Placed & { booking: Booking };
  narrow: boolean;
  selected: boolean;
  onSelect: (b: Booking) => void;
}) {
  const { booking: b, startMin, endMin, col, cols } = placed;
  const top = (startMin / 60) * HOUR_PX;
  const height = Math.max(MIN_EVENT_PX, ((endMin - startMin) / 60) * HOUR_PX - 2);
  const title = bookingTitle(b);
  const start = hhmm(startMin);
  const end = hhmm(endMin);
  const range = `${placed.continuesBefore ? "…" : start} – ${placed.continuesAfter ? "…" : end}`;
  // Una cita corta cabe en una línea: "Nombre, 10:00", como en Google. Si
  // además comparte el ancho, el nombre manda y la hora queda en el panel.
  const compact = height < 36;
  const showTime = !compact || cols === 1;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onSelect(b);
      }}
      aria-label={`${title}, ${start} a ${end}`}
      className={cn(
        "absolute z-10 overflow-hidden rounded-[6px] border text-left leading-tight shadow-sm transition-[box-shadow,filter] hover:brightness-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-soft",
        cols > 1 ? "px-1" : "px-1.5",
        // En una línea, la hora que no cabe junto al nombre salta a una
        // segunda línea que queda oculta: se ve entera o no se ve.
        compact ? "flex flex-wrap content-start items-center gap-x-1 text-[11px]" : "py-1 text-[11.5px]",
        bookingTone(b).box,
        selected && "ring-2 ring-brand ring-offset-1 ring-offset-background"
      )}
      style={{
        top: top + 1,
        height,
        left: `calc(${(col / cols) * 100}% + 2px)`,
        width: `calc(${100 / cols}% - 4px)`,
        // La primera línea, centrada en el alto de la cita.
        paddingTop: compact ? Math.max(1, (height - 14) / 2) : undefined,
      }}
    >
      <span className="flex min-w-0 max-w-full items-center gap-1 font-semibold">
        {b.source === "ai" && b.kind === "session" && (
          <Sparkles aria-label="Agendó la IA" className="h-3 w-3 shrink-0" strokeWidth={2} />
        )}
        {hasDeliveryIssue(b) && (
          <AlertTriangle aria-label="Sin enlace de la reunión" className="h-3 w-3 shrink-0" strokeWidth={2} />
        )}
        <span className="truncate">
          {b.isTest && "Prueba · "}
          {title}
        </span>
      </span>
      {showTime && (
        <span
          className={cn(
            "font-mono text-[10.5px] opacity-80",
            // En una línea el nombre manda. En la semana del celular la hora
            // ni se intenta.
            compact ? cn("shrink-0 whitespace-nowrap", narrow && "hidden sm:inline") : "mt-0.5 block truncate"
          )}
        >
          {compact ? start : range}
        </span>
      )}
    </button>
  );
}
