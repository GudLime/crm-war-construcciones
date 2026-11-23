"use client";

import { useMemo } from "react";
import { AlertTriangle, CalendarDays, Sparkles, Video } from "lucide-react";
import { bookingSegments, hhmm, longDayLabel, spanLabel, type DateRange } from "@/lib/time/calendar";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { STATUS_LABEL, bookingTitle, bookingTone, hasDeliveryIssue, type Booking } from "./booking-look";
import type { TareaCal } from "./time-grid";

/**
 * 215 — La Lista: las citas del rango, agrupadas por día, como la «Agenda» de
 * Google o la lista de reuniones de Zoom. Es la vista para revisar qué viene
 * (o qué pasó) sin buscar en la rejilla.
 */
export function AgendaList({
  range,
  bookings,
  timezone,
  today,
  selectedId,
  onSelect,
  tareas = [],
  onSelectTarea,
  renderIconoTarea,
}: {
  range: DateRange;
  bookings: Booking[];
  /** v2, punto 4 — En el Calendario de Tareas, la Lista suma todas las tareas. */
  tareas?: TareaCal[];
  onSelectTarea?: (t: TareaCal) => void;
  renderIconoTarea?: (tipo: string) => React.ReactNode;
  timezone: string;
  today: string;
  selectedId: string | null;
  onSelect: (b: Booking) => void;
}) {
  type Fila = { booking?: Booking; tarea?: TareaCal; startMin: number; endMin: number };
  const groups = useMemo(() => {
    const map = new Map<string, Fila[]>();
    const sumar = (startUtc: string, minutos: number, x: { booking: Booking } | { tarea: TareaCal }) => {
      const segs = bookingSegments(startUtc, minutos, timezone);
      const first = segs[0];
      const last = segs[segs.length - 1];
      if (!first || !last || first.day < range.from || first.day > range.to) return;
      const list = map.get(first.day) ?? [];
      list.push({ ...x, startMin: first.startMin, endMin: last.endMin });
      map.set(first.day, list);
    };
    for (const b of bookings) sumar(b.scheduledAtUtc, b.durationMinutes, { booking: b });
    for (const t of tareas) sumar(t.fecha, 30, { tarea: t });
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, items]) => ({ day, items: items.sort((a, b) => a.startMin - b.startMin) }));
  }, [bookings, tareas, timezone, range.from, range.to]);

  if (groups.length === 0) {
    return (
      <EmptyState
        icon={CalendarDays}
        className="min-h-0 flex-1 rounded-lg border bg-card p-8"
        title={`Nada agendado del ${spanLabel(range)}`}
        description="Aquí aparecen las citas que agenda la IA o tu equipo. El horario que se ofrece se configura en Ajustes → Agenda."
      />
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-card">
      {groups.map(({ day, items }) => (
        <section key={day}>
          <h3 className="sticky top-0 z-10 flex items-center gap-2 border-b bg-subtle px-4 py-2 text-[13px] font-semibold first-letter:uppercase">
            {longDayLabel(day)}
            {day === today && (
              <span className="rounded-full bg-brand px-2 py-px text-[10.5px] font-semibold text-brand-fg">
                Hoy
              </span>
            )}
          </h3>
          <ul className="divide-y">
            {items.map(({ booking: b, tarea: t, startMin, endMin }) =>
              t ? (
                <li key={`t:${t.id}`}>
                  <button
                    type="button"
                    onClick={() => onSelectTarea?.(t)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-row-hover"
                  >
                    <span className="w-[6.5rem] shrink-0 font-mono text-[12px] text-text-2">{hhmm(startMin)}</span>
                    {renderIconoTarea ? <span className="shrink-0">{renderIconoTarea(t.tipo)}</span> : null}
                    <span className="min-w-0 flex-1">
                      <span className={cn("block truncate text-sm font-semibold", t.estado !== "realizar" && "text-text-3 line-through")}>
                        {t.titulo}
                      </span>
                      <span className="block truncate text-xs text-text-3">{[t.contacto, t.edificio].filter(Boolean).join(" · ") || "Tarea"}</span>
                    </span>
                  </button>
                </li>
              ) : b ? (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => onSelect(b)}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-row-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-soft",
                    b.id === selectedId && "bg-row-hover"
                  )}
                >
                  <span className="w-[6.5rem] shrink-0 font-mono text-[12px] text-text-2">
                    {hhmm(startMin)} – {hhmm(endMin)}
                  </span>
                  <span aria-hidden className={cn("h-2.5 w-2.5 shrink-0 rounded-full", bookingTone(b).dot)} />
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "flex items-center gap-1.5 truncate text-sm font-semibold",
                        b.status === "cancelada" && "text-text-3 line-through"
                      )}
                    >
                      <span className="truncate">{bookingTitle(b)}</span>
                      {b.source === "ai" && b.kind === "session" && (
                        <Sparkles aria-label="Agendó la IA" className="h-3.5 w-3.5 shrink-0 text-brand-text" />
                      )}
                    </span>
                    <span className="block truncate text-xs text-text-3">
                      {b.kind === "block"
                        ? `Bloqueo · ${b.durationMinutes} min`
                        : `${b.durationMinutes} min · ${b.source === "ai" ? "Agendó la IA" : "Manual"}${b.isTest ? " · Prueba" : ""}`}
                    </span>
                  </span>
                  {hasDeliveryIssue(b) && (
                    <AlertTriangle aria-label="Sin enlace de la reunión" className="h-4 w-4 shrink-0 text-warning-text" />
                  )}
                  {b.meetingLink && b.status === "agendada" && (
                    <Video aria-label="Tiene enlace de reunión" className="hidden h-4 w-4 shrink-0 text-text-3 sm:block" />
                  )}
                  <span className="hidden shrink-0 text-xs font-medium text-text-2 sm:block">
                    {b.kind === "block" ? (b.status === "cancelada" ? "Bloqueo quitado" : "Bloqueo") : STATUS_LABEL[b.status]}
                  </span>
                </button>
              </li>
              ) : null
            )}
          </ul>
        </section>
      ))}
    </div>
  );
}
