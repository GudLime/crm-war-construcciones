"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ClipboardList, Mail, Phone, Sparkles, Users } from "lucide-react";
import { WhatsAppLogo } from "@/components/whatsapp-logo";
import { PildoraEdificio } from "@/components/ventas/pildora-edificio";
import { VentanaCita, VentanaTarea } from "@/components/ventas/ventana-tarea";
import { seccionesWidget, type ItemWidget } from "@/lib/inicio";
import { cn } from "@/lib/utils";
import type { Booking } from "@/components/bookings/booking-look";

/**
 * Cambios 23/11, punto 7 — El widget «Tareas» del Inicio: una lista continua
 * (Vencidas → Sin hora → Hoy con la línea de «Ahora» → los días siguientes)
 * repartida en columnas según el ancho, con alto fijo. Los filtros por tipo
 * restan: tocar uno oculta ese tipo. Tocar un ítem abre su ventana de
 * detalle (v2, punto 2).
 */

const TIPOS = [
  { tipo: "mensaje", nombre: "WhatsApp", color: "#16a34a" },
  { tipo: "llamada", nombre: "Llamada", color: "#2563eb" },
  { tipo: "visita", nombre: "Visita", color: "#ea580c" },
  { tipo: "reunion", nombre: "Reunión", color: "#0891b2" },
  { tipo: "correo", nombre: "Mail", color: "#7c3aed" },
  { tipo: "tarea", nombre: "Tarea", color: "#64748b" },
] as const;
const ALTO = 172;

function Icono({ tipo, className }: { tipo: string; className?: string }) {
  if (tipo === "mensaje") return <WhatsAppLogo className={className} />;
  const I = { llamada: Phone, visita: CalendarDays, reunion: Users, correo: Mail, tarea: ClipboardList }[tipo] ?? ClipboardList;
  return <I className={className} />;
}

/** v2, punto 6 — El estilo lavado de los íconos de tipo de la pantalla Tareas (`IconoTipo`). */
const LAVADO: Record<string, string> = {
  mensaje: "bg-success-tint text-success-text",
  llamada: "bg-info-tint text-info-text",
  visita: "bg-brand-tint text-brand-ink",
  correo: "bg-warning-tint text-warning-text",
  reunion: "bg-muted text-text-2",
  tarea: "bg-muted text-text-2",
};

function Circulo({ tipo, apagado = false }: { tipo: string; apagado?: boolean }) {
  return (
    <span
      className={cn(
        "grid size-[22px] shrink-0 place-items-center rounded-full",
        apagado ? "border border-dashed border-border-strong bg-transparent text-text-3" : (LAVADO[tipo] ?? LAVADO.tarea)
      )}
    >
      <Icono tipo={tipo} className="size-3" />
    </span>
  );
}

const fmt = (iso: string, zona: string, o: Intl.DateTimeFormatOptions) => {
  try {
    return new Intl.DateTimeFormat("es-AR", { ...o, timeZone: zona }).format(new Date(iso));
  } catch {
    return iso.slice(11, 16);
  }
};
const hora = (iso: string, zona: string) => fmt(iso, zona, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

function tituloSeccion(clave: string, hoy: string): string {
  if (clave === "vencidas") return "Vencidas";
  if (clave === "sin_hora") return "Sin hora";
  const d = new Date(`${clave}T12:00:00Z`);
  const larga = new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", timeZone: "UTC" }).format(d);
  const manana = new Date(`${hoy}T12:00:00Z`);
  manana.setUTCDate(manana.getUTCDate() + 1);
  if (clave === hoy) return `Hoy · ${larga}`;
  if (clave === manana.toISOString().slice(0, 10)) return `Mañana · ${larga}`;
  return larga.charAt(0).toUpperCase() + larga.slice(1);
}

/** La cita del widget con la forma que pide la ventana de detalle. */
function citaDeItem(it: ItemWidget): Booking {
  return {
    id: it.id,
    kind: "session",
    status: it.estado as Booking["status"],
    source: it.agendo ?? "manual",
    scheduledAtUtc: it.at!,
    durationMinutes: it.minutos ?? 60,
    date: "",
    time: "",
    weekday: "",
    contact: null,
    conversationId: it.conversationId,
    connector: null,
    meetingLink: null,
    linkPending: false,
    isTest: false,
    notes: it.comentario,
    confirmadaAt: it.confirmada ? new Date(0).toISOString() : null,
    ubicacion: it.ubicacion,
  };
}

export function TareasWidget({
  items,
  hoy,
  zona,
  agente,
  onCambio,
}: {
  items: ItemWidget[];
  hoy: string;
  zona: string;
  agente: string;
  onCambio: () => void;
}) {
  const [ocultos, setOcultos] = useState<Set<string>>(() => new Set());
  /** v2, punto 2 — El ítem abierto en la ventana de detalle. */
  const [abierto, setAbierto] = useState<ItemWidget | null>(null);
  const [fuera, setFuera] = useState(0);
  const caja = useRef<HTMLDivElement>(null);
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setAhora(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const visibles = useMemo(() => items.filter((x) => !ocultos.has(x.tipo)), [items, ocultos]);
  const secciones = useMemo(() => seccionesWidget(visibles, hoy), [visibles, hoy]);

  // Cuántos no entran: los ítems que quedaron en columnas fuera del ancho.
  useLayoutEffect(() => {
    const el = caja.current;
    if (!el) return;
    const medir = () => {
      const ancho = el.clientWidth;
      const filas = [...el.querySelectorAll<HTMLElement>("[data-item]")];
      setFuera(filas.filter((f) => f.offsetLeft >= ancho - 4).length);
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [secciones]);

  const fila = (it: ItemWidget, i: number, lista: ItemWidget[], clave: string) => {
    const hecha = (it.clase === "tarea" && (it.estado === "listo" || it.estado === "no_responde")) || (it.clase === "cita" && it.estado !== "agendada");
    const pasada = it.at ? Date.parse(it.at) < ahora : false;
    const marcaAhora = clave === "hoy" && it.at && pasada && (!lista[i + 1]?.at || Date.parse(lista[i + 1]!.at!) >= ahora);
    const punto =
      it.clase === "cita"
        ? it.estado === "no_show"
          ? "#dc2626"
          : it.confirmada || it.estado === "realizada"
            ? "#16a34a"
            : "#f59e0b"
        : null;
    const open = abierto?.clase === it.clase && abierto.id === it.id;
    return (
      <div key={`${it.clase}:${it.id}`} data-item className="break-inside-avoid">
        <button
          type="button"
          onClick={() => setAbierto(it)}
          className={cn("flex h-[34px] w-full items-center gap-2 rounded-md px-1.5 text-left text-[13px] hover:bg-subtle", open && "bg-subtle")}
        >
          <span className={cn("w-10 shrink-0 font-mono text-[11.5px] tabular-nums", it.vencida ? "text-danger-text" : "text-text-3")}>
            {it.at ? (it.vencida ? fmt(it.at, zona, { day: "2-digit", month: "2-digit" }) : hora(it.at, zona)) : "—"}
          </span>
          <Circulo tipo={it.tipo} />
          {it.ia && (
            <span
              title={`La creó ${agente} (IA) al derivar la conversación`}
              className="grid size-[18px] shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#ede9fe] to-[#e0f2fe] text-[#6d28d9]"
            >
              <Sparkles className="size-2.5" />
            </span>
          )}
          <span className={cn("min-w-0 flex-1 truncate", hecha && "text-text-3 line-through opacity-70")}>{it.titulo}</span>
          {it.edificio && <PildoraEdificio nombre={it.edificio.nombre} color={it.edificio.color} className="max-w-[110px] truncate px-2 text-[11px]" />}
          {punto && <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: punto }} />}
        </button>
        {marcaAhora && (
          <div className="my-0.5 flex items-center gap-1.5 text-[10.5px] font-semibold text-danger-text">
            <span className="h-px flex-1 bg-danger" />
            Ahora {new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: zona }).format(new Date(ahora))}
          </div>
        )}
      </div>
    );
  };

  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 pb-1 pt-3">
        <h3 className="text-[15px] font-bold tracking-tight">Tareas</h3>
        <div className="flex items-center gap-1" role="group" aria-label="Filtrar por tipo">
          {TIPOS.map((t) => {
            const apagado = ocultos.has(t.tipo);
            return (
              <button
                key={t.tipo}
                type="button"
                title={apagado ? `Mostrar ${t.nombre}` : `Ocultar ${t.nombre}`}
                aria-pressed={!apagado}
                onClick={() =>
                  setOcultos((o) => {
                    const n = new Set(o);
                    if (n.has(t.tipo)) n.delete(t.tipo);
                    else n.add(t.tipo);
                    return n;
                  })
                }
                className="rounded-full p-0.5 hover:bg-subtle"
              >
                <Circulo tipo={t.tipo} apagado={apagado} />
              </button>
            );
          })}
        </div>
      </header>
      <div
        ref={caja}
        className="overflow-hidden px-2.5"
        style={{ height: ALTO, minHeight: ALTO, columnWidth: 280, columnFill: "auto", columnGap: 16 }}
      >
        {secciones.length === 0 && <p className="px-2 py-6 text-center text-[13px] text-text-3">Nada pendiente. 🎉</p>}
        {secciones.map((s) => (
          <div key={s.clave} className="contents">
            <p
              className={cn(
                "break-after-avoid px-1.5 pb-0.5 pt-1.5 text-[11px] font-semibold uppercase tracking-wide",
                s.clave === "vencidas" ? "text-danger-text" : "text-text-3"
              )}
            >
              {tituloSeccion(s.clave, hoy)}
            </p>
            {s.items.map((it, i) => fila(it, i, s.items, s.clave))}
          </div>
        ))}
      </div>
      <footer className="flex items-center justify-between gap-2 border-t px-4 py-2.5 text-[12.5px]">
        <span className="text-text-3">{fuera > 0 ? `+${fuera} más en Tareas` : "Eso es todo por ahora"}</span>
        <Link href="/tareas" className="font-medium text-brand-ink hover:underline">
          Ver todas las tareas →
        </Link>
      </footer>
      {abierto?.clase === "tarea" && (
        <VentanaTarea
          tareaId={abierto.id}
          onCerrar={() => setAbierto(null)}
          onCambio={onCambio}
        />
      )}
      {abierto?.clase === "cita" && abierto.at && (
        <VentanaCita
          cita={citaDeItem(abierto)}
          titulo={abierto.titulo}
          timezone={zona}
          today={hoy}
          nowMs={ahora}
          oportunidadId={abierto.oportunidadId}
          onCerrar={() => setAbierto(null)}
          onCambio={onCambio}
        />
      )}
    </section>
  );
}
