"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { CalendarDays, ClipboardList, Mail, MapPin, Phone, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendario, hoyISO, sumarDias } from "@/components/ui/calendario";
import { Select } from "@/components/ui/select";
import { WhatsAppLogo } from "@/components/whatsapp-logo";
import { tonoDeEdificio } from "@/lib/colores-edificio";
import { tituloPorDefecto, type BotonTipo } from "@/lib/tareas-por-tipo";
import { cn } from "@/lib/utils";

/**
 * Próximos pasos — una tarea nueva desde la oportunidad: un botón por tipo
 * (WhatsApp · Llamada · Reunión · Mail · Tarea) que abre una ventanita anclada.
 * El tipo sale del botón; no hay selector adentro. «Reunión» es una cita de la
 * Agenda: en el edificio (Visita) o en la oficina (Reunión), con su ubicación.
 */


const BOTONES: { tipo: BotonTipo; nombre: string; fondo: string; tinta: string }[] = [
  { tipo: "mensaje", nombre: "WhatsApp", fondo: "#dcfce7", tinta: "#166534" },
  { tipo: "llamada", nombre: "Llamada", fondo: "#e0f2fe", tinta: "#075985" },
  { tipo: "reunion", nombre: "Reunión", fondo: "#ede9fe", tinta: "#5b21b6" },
  { tipo: "correo", nombre: "Mail", fondo: "#fef3c7", tinta: "#92400e" },
  { tipo: "tarea", nombre: "Tarea", fondo: "#f1f5f9", tinta: "#334155" },
];

function IconoBoton({ tipo, className }: { tipo: BotonTipo; className?: string }) {
  if (tipo === "mensaje") return <WhatsAppLogo className={className} />;
  const Icono = { llamada: Phone, reunion: Users, correo: Mail, tarea: ClipboardList }[tipo];
  return <Icono className={className} strokeWidth={2} />;
}

type Edificio = { id: string; nombre: string; direccion: string | null; color: string | null; enVenta?: boolean };
type Miembro = { userId: string; nombre: string };

const ENCABEZADO: Record<BotonTipo, string> = {
  mensaje: "Nueva tarea de WhatsApp",
  llamada: "Nueva llamada",
  reunion: "Nueva reunión",
  correo: "Nuevo mail",
  tarea: "Nueva tarea",
};

type Cuando = "hoy" | "manana" | "3dias" | "otra";

function fechaDeCuando(c: Cuando, otra: string | null): string {
  const hoy = hoyISO();
  if (c === "hoy") return hoy;
  if (c === "manana") return sumarDias(hoy, 1);
  if (c === "3dias") return sumarDias(hoy, 3);
  return otra ?? sumarDias(hoy, 1);
}

/** «hoy 10:00», «mañana 10:00», «el 25/11 10:00». */
export function textoCuando(fecha: string, hora: string): string {
  const hoy = hoyISO();
  if (fecha === hoy) return `hoy ${hora}`;
  if (fecha === sumarDias(hoy, 1)) return `mañana ${hora}`;
  return `el ${fecha.slice(8)}/${fecha.slice(5, 7)} ${hora}`;
}

export function BotonesNuevaTarea({
  oportunidadId,
  contacto,
  edificioOportunidad,
  agenda,
  onCreada,
  modal = false,
}: {
  oportunidadId: string;
  contacto: { id: string; nombre: string } | null;
  /** El edificio de la oportunidad: la ubicación por defecto de una visita. */
  edificioOportunidad: { id: string; nombre: string } | null;
  /** Con la Agenda, «Reunión» crea una cita; sin ella, una tarea. */
  agenda: boolean;
  onCreada: (aviso: string) => Promise<void>;
  /** v3 — En un panel angosto (el sidebar del chat) la ventanita se abre centrada. */
  modal?: boolean;
}) {
  const [abierto, setAbierto] = useState<BotonTipo | null>(null);
  const [flecha, setFlecha] = useState(0);
  const caja = useRef<HTMLDivElement>(null);
  const botones = useRef<Map<BotonTipo, HTMLButtonElement>>(new Map());

  function tocar(tipo: BotonTipo) {
    if (abierto === tipo) {
      setAbierto(null);
      return;
    }
    const b = botones.current.get(tipo);
    const c = caja.current;
    if (b && c) {
      const rb = b.getBoundingClientRect();
      const rc = c.getBoundingClientRect();
      // Distancia desde el borde derecho del grupo al centro del botón.
      setFlecha(rc.right - (rb.left + rb.width / 2));
    }
    setAbierto(tipo);
  }

  // Clic afuera cierra.
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(null);
    };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [abierto]);

  return (
    <div ref={caja} className={cn("relative flex items-center gap-1", modal && "flex-wrap")}>
      <span className="mr-1 text-[12px] text-text-3">+ Agregar</span>
      {BOTONES.map((b) => {
        const activo = abierto === b.tipo;
        return (
          <button
            key={b.tipo}
            ref={(el) => {
              if (el) botones.current.set(b.tipo, el);
            }}
            type="button"
            aria-label={`Nueva tarea: ${b.nombre}`}
            aria-expanded={activo}
            onClick={() => tocar(b.tipo)}
            className={cn(
              "group inline-flex h-7 items-center rounded-full border p-[3px] transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              activo ? "border-brand bg-brand-tint" : "border-border bg-card hover:bg-accent"
            )}
          >
            <span className="grid size-5 shrink-0 place-items-center rounded-full" style={{ background: b.fondo, color: b.tinta }}>
              <IconoBoton tipo={b.tipo} className="size-3" />
            </span>
            <span
              className={cn(
                "max-w-0 overflow-hidden whitespace-nowrap text-[12px] font-medium opacity-0 transition-all duration-200",
                "group-hover:ml-1.5 group-hover:mr-1 group-hover:max-w-[90px] group-hover:opacity-100",
                "group-focus-visible:ml-1.5 group-focus-visible:mr-1 group-focus-visible:max-w-[90px] group-focus-visible:opacity-100",
                activo && "ml-1.5 mr-1 max-w-[90px] opacity-100"
              )}
            >
              {b.nombre}
            </span>
          </button>
        );
      })}
      {abierto && (
        <VentanaNuevaTarea
          key={abierto}
          tipo={abierto}
          flecha={flecha}
          modal={modal}
          oportunidadId={oportunidadId}
          contacto={contacto}
          edificioOportunidad={edificioOportunidad}
          agenda={agenda}
          onCerrar={() => setAbierto(null)}
          onCreada={async (aviso) => {
            setAbierto(null);
            await onCreada(aviso);
          }}
        />
      )}
    </div>
  );
}

function VentanaNuevaTarea({
  tipo,
  flecha,
  modal = false,
  oportunidadId,
  contacto,
  edificioOportunidad,
  agenda,
  onCerrar,
  onCreada,
}: {
  tipo: BotonTipo;
  flecha: number;
  modal?: boolean;
  oportunidadId: string;
  contacto: { id: string; nombre: string } | null;
  edificioOportunidad: { id: string; nombre: string } | null;
  agenda: boolean;
  onCerrar: () => void;
  onCreada: (aviso: string) => Promise<void>;
}) {
  const [edificios, setEdificios] = useState<Edificio[]>([]);
  const [equipo, setEquipo] = useState<Miembro[]>([]);
  const [yo, setYo] = useState<string | null>(null);
  const [oficina, setOficina] = useState("");
  useEffect(() => {
    void Promise.all([
      fetch("/api/edificios").then((r) => (r.ok ? r.json() : { edificios: [] })),
      fetch("/api/equipo").then((r) => (r.ok ? r.json() : { equipo: [], yo: null })),
      tipo === "reunion"
        ? fetch("/api/settings/ventas/oficina").then((r) => (r.ok ? r.json() : { direccion: "" }))
        : Promise.resolve({ direccion: "" }),
    ])
      .then(([e, q, o]: [{ edificios: Edificio[] }, { equipo: Miembro[]; yo: string | null }, { direccion: string }]) => {
        setEdificios(e.edificios ?? []);
        setEquipo(q.equipo ?? []);
        setYo(q.yo);
        setResponsable((r) => r || q.yo || "");
        setOficina(o.direccion ?? "");
      })
      .catch(() => undefined);
  }, [tipo]);

  const [modo, setModo] = useState<"visita" | "reunion">("visita");
  const [edificioId, setEdificioId] = useState<string | null>(edificioOportunidad?.id ?? null);
  const edificio = edificios.find((e) => e.id === edificioId) ?? null;
  const nombreEdificio = edificio?.nombre ?? (edificioId === edificioOportunidad?.id ? edificioOportunidad?.nombre : null) ?? null;

  const sugerido = tituloPorDefecto(tipo, modo, contacto?.nombre ?? null, nombreEdificio);
  const [titulo, setTitulo] = useState(sugerido);
  const [tocado, setTocado] = useState(false);
  // El título acompaña al tipo y al edificio mientras no se edite a mano.
  useEffect(() => {
    if (!tocado) setTitulo(sugerido);
  }, [sugerido, tocado]);

  const [cuando, setCuando] = useState<Cuando>("manana");
  const [otra, setOtra] = useState<string | null>(null);
  const [verCalendario, setVerCalendario] = useState(false);
  const [hora, setHora] = useState("10:00");
  const [responsable, setResponsable] = useState("");
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const tituloRef = useRef<HTMLInputElement>(null);
  useEffect(() => tituloRef.current?.focus(), []);

  // Una reunión con Agenda es una cita (0064: con quién la atiende).
  const esCita = tipo === "reunion" && agenda && Boolean(contacto);
  const ubicacion =
    tipo === "reunion"
      ? modo === "visita"
        ? edificio
          ? [`Edificio ${edificio.nombre}`, edificio.direccion].filter(Boolean).join(" · ")
          : nombreEdificio
            ? `Edificio ${nombreEdificio}`
            : ""
        : oficina
      : "";
  const fecha = fechaDeCuando(cuando, otra);
  const boton = BOTONES.find((b) => b.tipo === tipo)!;

  // Esc cierra.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onCerrar]);

  async function crear(e?: FormEvent) {
    e?.preventDefault();
    if (!titulo.trim() || creando) return;
    setCreando(true);
    setError(null);
    const inicio = new Date(`${fecha}T${hora}`);
    if (Number.isNaN(inicio.getTime())) {
      setError("Revisá la fecha y la hora");
      setCreando(false);
      return;
    }
    const tipoGuardado = tipo === "reunion" ? modo : tipo;
    const res = esCita
      ? await fetch("/api/bookings", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            kind: "session",
            contactId: contacto!.id,
            startUtc: inicio.toISOString(),
            notes: [titulo.trim(), nota.trim()].filter(Boolean).join("\n\n"),
            ubicacion: ubicacion || null,
            // 0064 — La cita guarda si es visita o reunión, el edificio y quién la atiende.
            modo,
            edificioId: modo === "visita" ? edificioId : null,
            ...(responsable ? { responsableId: responsable } : {}),
          }),
        }).catch(() => null)
      : await fetch("/api/tareas", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            titulo: titulo.trim(),
            tipo: tipoGuardado,
            fecha: inicio.toISOString(),
            comentarios: nota.trim() || null,
            oportunidadId,
            contactId: contacto?.id ?? null,
            ...(responsable ? { responsableId: responsable } : {}),
            ...(tipo === "reunion"
              ? { ubicacion: ubicacion || null, edificioId: modo === "visita" ? edificioId : null }
              : {}),
          }),
        }).catch(() => null);
    setCreando(false);
    if (!res?.ok) {
      const d = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(d?.error?.message ?? "No se pudo crear");
      return;
    }
    const nombreTipo = tipo === "reunion" ? (modo === "visita" ? "Visita" : "Reunión") : boton.nombre;
    await onCreada(`${nombreTipo} «${titulo.trim()}» creada para ${textoCuando(fecha, hora)} · quedó en Próximos pasos`);
  }

  const pastilla = (activo: boolean) =>
    cn(
      "h-7 rounded-full border px-3 text-[12.5px] font-medium transition-colors",
      activo ? "border-brand bg-brand-tint text-brand-ink" : "border-border bg-card hover:bg-accent"
    );

  return (
    <div
      role="dialog"
      aria-label={ENCABEZADO[tipo]}
      className={cn(
        "z-30 w-[380px] max-w-[calc(100vw-32px)] rounded-[14px] border border-border bg-card shadow-[0_18px_50px_-12px_rgba(15,23,42,0.35)]",
        modal ? "fixed left-1/2 top-20 z-50 max-h-[calc(100vh-6rem)] -translate-x-1/2 overflow-y-auto" : "absolute right-0 top-[calc(100%+10px)]"
      )}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !(e.target instanceof HTMLTextAreaElement)) {
          e.preventDefault();
          void crear();
        }
      }}
    >
      {!modal && (
        <span
          aria-hidden
          className="absolute -top-[6px] size-3 rotate-45 border-l border-t border-border bg-card"
          style={{ right: Math.max(10, flecha - 6) }}
        />
      )}
      <form onSubmit={(e) => void crear(e)} className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          <span className="grid size-[34px] shrink-0 place-items-center rounded-lg" style={{ background: boton.fondo, color: boton.tinta }}>
            <IconoBoton tipo={tipo} className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[14.5px] font-bold">
              {tipo === "reunion" ? (modo === "visita" ? "Nueva visita" : "Nueva reunión") : ENCABEZADO[tipo]}
            </p>
            <p className="truncate text-[12px] text-text-3">
              {[contacto?.nombre, edificioOportunidad?.nombre].filter(Boolean).join(" · ") || "Sin contacto"}
            </p>
          </div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="grid size-7 place-items-center rounded-md hover:bg-accent">
            <X className="size-4" />
          </button>
        </div>

        {tipo === "reunion" && (
          <div className="space-y-2">
            <div role="tablist" className="grid grid-cols-2 gap-1 rounded-lg bg-subtle p-1">
              {(
                [
                  ["visita", "Visita", "en el edificio"],
                  ["reunion", "Reunión", "en la oficina"],
                ] as const
              ).map(([m, nombre, donde]) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={modo === m}
                  onClick={() => setModo(m)}
                  className={cn(
                    "rounded-md px-2 py-1.5 text-[12.5px] transition-colors",
                    modo === m ? "bg-card font-semibold shadow-sm" : "text-text-2 hover:text-foreground"
                  )}
                >
                  {nombre} <span className="font-normal text-text-3">· {donde}</span>
                </button>
              ))}
            </div>
            {modo === "visita" && (
              <div className="space-y-1">
                <p className="text-[11.5px] font-medium text-text-3">Ubicación</p>
                <div className="flex flex-wrap gap-1.5">
                  {/* v5 — Solo los que están en venta: la visita suma el edificio a la oportunidad. */}
                  {edificios.filter((e) => e.enVenta !== false || e.id === edificioId).map((e) => (
                    <button key={e.id} type="button" onClick={() => setEdificioId(e.id)} className={cn(pastilla(e.id === edificioId), "inline-flex items-center gap-1.5")}>
                      <span className="size-2 rounded-full" style={{ background: tonoDeEdificio(e.color).punto }} />
                      {e.nombre}
                      {e.id === edificioOportunidad?.id && <span className="text-[10.5px] font-normal text-text-3">de la oportunidad</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex items-start gap-2 rounded-lg border border-dashed border-border bg-subtle px-3 py-2">
              <MapPin className="mt-0.5 size-4 shrink-0 text-text-3" />
              <div className="min-w-0 text-[12.5px]">
                <p className="font-medium">
                  {ubicacion || (modo === "reunion" ? "Falta cargar la dirección de la oficina en Ajustes → Ventas" : "Elegí el edificio")}
                </p>
                <p className="text-[11px] text-text-3">Va como ubicación del evento en el calendario.</p>
              </div>
            </div>
          </div>
        )}

        <label className="block space-y-1">
          <span className="text-[11.5px] font-medium text-text-3">Título</span>
          <input
            ref={tituloRef}
            value={titulo}
            onChange={(e) => {
              setTitulo(e.target.value);
              setTocado(true);
            }}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          />
        </label>

        <div className="space-y-1">
          <span className="text-[11.5px] font-medium text-text-3">Cuándo</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                ["hoy", "Hoy"],
                ["manana", "Mañana"],
                ["3dias", "En 3 días"],
              ] as const
            ).map(([c, t]) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  setCuando(c);
                  setVerCalendario(false);
                }}
                className={pastilla(cuando === c)}
              >
                {t}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setCuando("otra");
                setVerCalendario((v) => !v);
              }}
              className={pastilla(cuando === "otra")}
            >
              <CalendarDays className="mr-1 inline size-3.5" />
              {cuando === "otra" && otra ? `${otra.slice(8)}/${otra.slice(5, 7)}` : "Otra fecha…"}
            </button>
            <input
              type="time"
              value={hora}
              onChange={(e) => setHora(e.target.value)}
              aria-label="Hora"
              className="ml-auto h-7 rounded-md border border-input bg-background px-2 text-[12.5px] tabular-nums"
            />
          </div>
          {verCalendario && (
            <div className="mt-2 rounded-lg border border-border p-2">
              <Calendario
                valor={otra}
                deshabilitarAntesDe={hoyISO()}
                onElegir={(f) => {
                  setOtra(f);
                  setVerCalendario(false);
                }}
              />
            </div>
          )}
        </div>

        {equipo.length > 0 && (
          <label className="block space-y-1">
            <span className="text-[11.5px] font-medium text-text-3">Responsable</span>
            <Select value={responsable} onValueChange={setResponsable} aria-label="Responsable" className="w-full">
              {equipo.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.nombre}
                  {m.userId === yo ? " (vos)" : ""}
                </option>
              ))}
            </Select>
          </label>
        )}

        <label className="block space-y-1">
          <span className="text-[11.5px] font-medium text-text-3">{tipo === "mensaje" ? "Mensaje sugerido" : "Nota"} (opcional)</span>
          <textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            rows={2}
            className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </label>

        {error && <p className="text-[12.5px] text-danger-text">{error}</p>}

        <div className="flex items-center gap-2 border-t pt-3">
          <span className="mr-auto text-[11px] text-text-3">Enter crear · Esc cerrar</span>
          <Button type="button" size="sm" variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button type="submit" size="sm" disabled={!titulo.trim() || creando}>
            {creando ? "Creando…" : esCita ? "Agendar" : "Crear tarea"}
          </Button>
        </div>
      </form>
    </div>
  );
}
