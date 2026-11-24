"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Clock, Mail, MessageSquareText, Phone, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CampoFecha, textoDeFecha } from "@/components/ui/campo-fecha";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAvisoGuardado } from "@/components/ui/aviso-guardado";
import { Ventana } from "@/components/ui/ventana";
import { Reschedule } from "@/components/bookings/booking-drawer";
import { hhmm, wallClock } from "@/lib/time/calendar";
import { dayIsoInTz } from "@/lib/time/slots";
import type { Booking } from "@/components/bookings/booking-look";
import { TIPOS_TAREA, estadosDeTipo, etiquetaDeEstado } from "@/lib/ventas";
import { cn } from "@/lib/utils";
import type { TareaDto } from "@/server/ventas";
import { IconoTipo, MarcaIa } from "./tareas-client";
import { PildoraEdificio } from "./pildora-edificio";
import { ResultadoLlamada } from "./resultado-llamada";
import { aLocal, mensajeDe } from "./ui";

/**
 * v2, punto 2 — La ventana de detalle de una tarea o de una cita. Una sola,
 * para el widget del Inicio, la pantalla Tareas y el Calendario.
 *
 * - El estado es un desplegable: es la única forma de marcar o reabrir.
 * - La fecha es un solo campo (con hora opcional): cambiarla es reprogramar.
 * - Estado, fecha y responsable se guardan al cambiarlos; los comentarios,
 *   al salir del campo o con «Guardar».
 */

type Tarea = TareaDto & { editable?: boolean };
type Contacto = { telefono: string | null; email: string | null } | null;
type Miembro = { userId: string; nombre: string };

function Fila({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_1fr] items-center gap-3 py-1.5 text-[13px]">
      <span className="text-text-3">{etiqueta}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Encabezado({ tipo, etiqueta, titulo, ia }: { tipo: string; etiqueta: string; titulo: string; ia?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <IconoTipo tipo={tipo} />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-text-3">
          {etiqueta}
          {ia && (
            <>
              <MarcaIa agente="la IA" />
              <span className="normal-case tracking-normal">creada por la IA</span>
            </>
          )}
        </span>
        <span className="block truncate">{titulo}</span>
      </span>
    </span>
  );
}

/** «cierra en 5 h 10 min». */
function textoRestante(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60_000));
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h} h${m ? ` ${m} min` : ""}` : `${m} min`;
}

type Ventana24 = { abierta: boolean; restanteMs: number } | null;

export function VentanaTarea({
  tareaId,
  onCerrar,
  onCambio,
}: {
  tareaId: string;
  onCerrar: () => void;
  /** Algo cambió: quien la abrió recarga su lista. */
  onCambio: () => void | Promise<void>;
}) {
  const avisar = useAvisoGuardado();
  const [tarea, setTarea] = useState<Tarea | null>(null);
  const [contacto, setContacto] = useState<Contacto>(null);
  const [ventana24, setVentana24] = useState<Ventana24>(null);
  const [equipo, setEquipo] = useState<Miembro[]>([]);
  const [admin, setAdmin] = useState(false);
  const [comentarios, setComentarios] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [asunto, setAsunto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [nota, setNota] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    const res = await fetch(`/api/tareas/${tareaId}`).catch(() => null);
    if (!res?.ok) {
      setError(res ? await mensajeDe(res) : "No se pudo abrir la tarea");
      return;
    }
    const d = (await res.json()) as { tarea: Tarea; contacto: Contacto; ventana?: Ventana24 };
    setTarea(d.tarea);
    setContacto(d.contacto);
    setVentana24(d.ventana ?? null);
    setComentarios(d.tarea.comentarios ?? "");
    setMensaje(d.tarea.mensaje ?? "");
    setAsunto(d.tarea.asunto ?? "");
  }, [tareaId]);

  useEffect(() => {
    void cargar();
    void (async () => {
      const e = await fetch("/api/equipo").catch(() => null);
      if (!e?.ok) return;
      const d = (await e.json()) as { equipo: Miembro[]; admin?: boolean };
      setEquipo(d.equipo);
      setAdmin(d.admin === true);
    })();
  }, [cargar]);

  type Cambios = Partial<{
    estado: string;
    fecha: string | null;
    comentarios: string | null;
    responsableId: string | null;
    mensaje: string | null;
    asunto: string | null;
  }>;

  /** PATCH con el cuerpo entero (lo pide la API) y los cambios encima. */
  async function guardar(cambios: Cambios) {
    if (!tarea) return false;
    setOcupado(true);
    setError(null);
    const res = await fetch(`/api/tareas/${tarea.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        titulo: tarea.titulo,
        tipo: tarea.tipo,
        estado: tarea.estado,
        // La fecha guardada va en ISO; la que se elige en el campo, en hora del negocio.
        fecha: tarea.fecha,
        comentarios: tarea.comentarios,
        contactId: tarea.contactId,
        oportunidadId: tarea.oportunidadId,
        ...(admin ? { responsableId: tarea.responsableId } : {}),
        ...cambios,
      }),
    }).catch(() => null);
    setOcupado(false);
    if (!res?.ok) {
      setError(res ? await mensajeDe(res) : "No se pudo guardar");
      return false;
    }
    await cargar();
    void onCambio();
    return true;
  }

  /** Lo que se escribió y todavía no se guardó (mensaje, asunto, comentarios). */
  function pendientesDeTexto(): Cambios {
    if (!tarea) return {};
    const c: Cambios = {};
    if ((tarea.comentarios ?? "") !== comentarios) c.comentarios = comentarios || null;
    if ((tarea.mensaje ?? "") !== mensaje) c.mensaje = mensaje || null;
    if ((tarea.asunto ?? "") !== asunto) c.asunto = asunto || null;
    return c;
  }

  async function eliminar() {
    if (!tarea || !window.confirm("¿Borrar esta tarea?")) return;
    const res = await fetch(`/api/tareas/${tarea.id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok && res?.status !== 204) {
      setError(res ? await mensajeDe(res) : "No se pudo borrar");
      return;
    }
    avisar("Tarea eliminada");
    void onCambio();
    onCerrar();
  }

  async function guardarYCerrar() {
    const c = pendientesDeTexto();
    if (Object.keys(c).length && !(await guardar(c))) return;
    onCerrar();
  }

  /** WhatsApp o mail: «Dejar pendiente». */
  async function dejarPendiente() {
    if (await guardar({ ...pendientesDeTexto(), estado: "realizar" })) {
      avisar("Quedó pendiente");
      onCerrar();
    }
  }

  /** WhatsApp o mail: «Programar» a la fecha y hora del campo Fecha. */
  async function programar() {
    if (!tarea) return;
    const sinHora = !tarea.fecha || aLocal(tarea.fecha).endsWith("T00:00");
    if (sinHora || Date.parse(tarea.fecha!) <= Date.now()) {
      setError("Para programarlo elegí en «Fecha» un día y una hora que todavía no pasaron");
      return;
    }
    if (tarea.tipo === "mensaje" && !mensaje.trim()) {
      setError("Escribí el mensaje antes de programarlo");
      return;
    }
    if (await guardar({ ...pendientesDeTexto(), estado: "programado" })) {
      avisar(`Programado para ${textoDeFecha(aLocal(tarea.fecha!))}`);
      onCerrar();
    }
  }

  /** WhatsApp: «Enviar ahora». */
  async function enviarAhora() {
    if (!tarea) return;
    if (!mensaje.trim()) {
      setError("Escribí el mensaje antes de mandarlo");
      return;
    }
    const c = pendientesDeTexto();
    if (Object.keys(c).length && !(await guardar(c))) return;
    setOcupado(true);
    const res = await fetch(`/api/tareas/${tarea.id}/enviar`, { method: "POST" }).catch(() => null);
    setOcupado(false);
    const d = (await res?.json().catch(() => null)) as { enviado?: boolean; aviso?: string } | null;
    if (!res?.ok || !d) {
      setError(res ? await mensajeDe(res) : "No se pudo mandar el mensaje");
      return;
    }
    void onCambio();
    if (d.enviado) {
      avisar("Mensaje enviado");
      onCerrar();
    } else {
      setError(d.aviso ?? "No se pudo mandar el mensaje");
      await cargar();
    }
  }

  if (!tarea) {
    return (
      <Ventana titulo="Tarea" onCerrar={onCerrar} className="sm:max-w-[420px]">
        <p className="text-sm text-text-3">{error ?? "Abriendo…"}</p>
      </Ventana>
    );
  }

  const soloLectura = tarea.editable === false;
  const etiqueta = TIPOS_TAREA.find((t) => t.value === tarea.tipo)?.label ?? "Tarea";
  const ia = tarea.creadaPor === "ia";
  const cerrada = tarea.estado === "listo";
  const fecha = tarea.fecha ? aLocal(tarea.fecha) : null;
  const esEnvio = tarea.tipo === "mensaje" || tarea.tipo === "correo";
  const estados = estadosDeTipo(tarea.tipo);
  const opcionesEstado = estados.some((e) => e.value === tarea.estado)
    ? estados
    : [...estados, { value: tarea.estado, label: etiquetaDeEstado(tarea.tipo, tarea.estado) }];
  const boton = "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-semibold";

  return (
    <Ventana
      titulo={<Encabezado tipo={tarea.tipo} etiqueta={etiqueta} titulo={tarea.titulo} ia={ia} />}
      onCerrar={onCerrar}
      className="sm:max-w-[440px]"
    >
      {tarea.tipo === "llamada" && tarea.estado === "realizar" && !soloLectura && (
        <div className="mb-3">
          <p className="mb-2 text-[12.5px] font-semibold">¿Cómo salió la llamada?</p>
          <ResultadoLlamada
            enLinea
            tareaId={tarea.id}
            oportunidadId={tarea.oportunidadId}
            onListo={async () => {
              await cargar();
              void onCambio();
            }}
          />
        </div>
      )}

      <div>
        <Fila etiqueta="Estado">
          <Select
            value={tarea.estado}
            disabled={soloLectura || ocupado}
            onValueChange={(estado) => {
              if (estado === "programado") void programar();
              else void guardar({ estado });
            }}
            className="h-8 w-auto rounded-full"
          >
            {opcionesEstado.map((e) => (
              <option key={e.value} value={e.value}>
                {e.label}
              </option>
            ))}
          </Select>
        </Fila>
        <Fila etiqueta="Fecha">
          <CampoFecha enLinea valor={fecha} disabled={soloLectura || ocupado} onCambio={(f) => void guardar({ fecha: f })} />
        </Fila>
        <Fila etiqueta="Responsable">
          {admin && equipo.length > 0 && !soloLectura ? (
            <Select
              value={tarea.responsableId ?? ""}
              placeholder="Sin asignar"
              onValueChange={(v) => void guardar({ responsableId: v || null })}
              className="h-8 w-auto"
            >
              <option value="">Sin asignar</option>
              {equipo.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.nombre}
                </option>
              ))}
            </Select>
          ) : (
            <span>{tarea.responsableNombre ?? "Sin asignar"}</span>
          )}
        </Fila>
        {tarea.oportunidadId && (
          <Fila etiqueta="Oportunidad">
            <Link href={`/oportunidades/${tarea.oportunidadId}`} className="font-medium text-brand-text hover:underline">
              {tarea.oportunidadNombre ?? "Ver oportunidad"}
            </Link>
          </Fila>
        )}
        {tarea.edificio && (
          <Fila etiqueta="Edificio">
            <PildoraEdificio nombre={tarea.edificio.nombre} color={tarea.edificio.color} href={`/edificios/${tarea.edificio.id}`} />
          </Fila>
        )}
        {tarea.ubicacion && (
          <Fila etiqueta="Ubicación">
            <span className="text-text-2">{tarea.ubicacion}</span>
          </Fila>
        )}
        {tarea.tipo === "llamada" && (
          <Fila etiqueta="Contacto">
            <span className="flex flex-wrap items-center gap-2">
              <span>{tarea.contactoNombre ?? "—"}</span>
              {contacto?.telefono && (
                <a
                  href={`tel:${contacto.telefono}`}
                  className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[12.5px] font-medium hover:bg-accent"
                >
                  <Phone className="size-3" /> Llamar · {contacto.telefono}
                </a>
              )}
            </span>
          </Fila>
        )}
        {tarea.tipo === "mensaje" && (
          <Fila etiqueta="Para">
            <span className="text-text-2">
              {[tarea.contactoNombre, contacto?.telefono].filter(Boolean).join(" · ") || "El contacto de la oportunidad"}
            </span>
          </Fila>
        )}
        {tarea.tipo === "correo" && (
          <Fila etiqueta="Para">
            <span className="text-text-2">{contacto?.email ?? `${tarea.contactoNombre ?? "El contacto"} no tiene correo cargado`}</span>
          </Fila>
        )}
      </div>

      {ia && tarea.comentarios && (
        <div className="mt-3 rounded-lg border border-[#e0d7fb] bg-gradient-to-br from-[#f5f3ff] to-[#f0f9ff] p-3 text-[13px]">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[#6d28d9]">Derivada por la IA</p>
          <p className="whitespace-pre-wrap text-text-2">{tarea.comentarios}</p>
        </div>
      )}

      {tarea.tipo === "correo" && (
        <label className="mt-3 block">
          <span className="mb-1 block text-[12px] text-text-3">Asunto</span>
          <Input
            value={asunto}
            disabled={soloLectura || cerrada}
            onChange={(e) => setAsunto(e.target.value)}
            maxLength={300}
            placeholder="Plan de pagos de la unidad"
          />
        </label>
      )}

      {esEnvio && (
        <label className="mt-3 block">
          <span className="mb-1 block text-[12px] text-text-3">Mensaje</span>
          <Textarea
            value={mensaje}
            disabled={soloLectura || cerrada}
            onChange={(e) => setMensaje(e.target.value)}
            rows={4}
            maxLength={4096}
            placeholder={tarea.tipo === "mensaje" ? "Lo que le va a llegar por WhatsApp" : "El cuerpo del mail"}
          />
        </label>
      )}

      {tarea.tipo === "mensaje" && ventana24 && !cerrada && (
        <p className={cn("mt-2 text-[12px]", ventana24.abierta ? "text-text-3" : "text-warning-text")}>
          Ventana de 24 h:{" "}
          {ventana24.abierta ? `abierta · cierra en ${textoRestante(ventana24.restanteMs)}` : "cerrada (hace falta una plantilla)"}
        </p>
      )}
      {tarea.estado === "programado" && fecha && (
        <p className="mt-2 text-[12px] text-text-2">
          Sale solo: {textoDeFecha(fecha)}
          {tarea.tipo === "correo" ? " (el envío de mails todavía no está conectado)" : ""}.
        </p>
      )}
      {tarea.enviadaAt && (
        <p className="mt-2 text-[12px] text-text-3">
          Enviado el {new Date(tarea.enviadaAt).toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
        </p>
      )}
      {tarea.aviso && !cerrada && (
        <p className="mt-2 rounded-sm bg-warning-tint px-3 py-2 text-[12.5px] text-warning-text">{tarea.aviso}</p>
      )}

      {!esEnvio && !ia && (
        <label className="mt-3 block">
          <span className="mb-1 block text-[12px] text-text-3">Comentarios</span>
          <Textarea
            value={comentarios}
            disabled={soloLectura}
            onChange={(e) => setComentarios(e.target.value)}
            onBlur={() => {
              if ((tarea.comentarios ?? "") !== comentarios) void guardar({ comentarios: comentarios || null });
            }}
            rows={3}
            maxLength={4000}
            placeholder="Sin comentarios"
          />
        </label>
      )}

      {cerrada && tarea.tipo === "tarea" && (
        <p className="mt-2 text-[12px] text-text-3">Está hecha. Para reabrirla, cambiá el estado a «Pendiente».</p>
      )}
      {soloLectura && <p className="mt-2 text-[12px] text-text-3">Es de otra persona: la podés ver, no cambiar.</p>}
      {nota && <p className="mt-2 rounded-sm bg-subtle px-3 py-2 text-[12.5px] text-text-2">{nota}</p>}
      {error && (
        <p role="alert" className="mt-3 rounded-sm bg-danger-tint px-3 py-2 text-sm text-danger-text">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3">
        {!soloLectura && (
          <Button size="sm" variant="ghost" className="text-danger-text" disabled={ocupado} onClick={() => void eliminar()}>
            Eliminar
          </Button>
        )}
        <span className="flex-1" />
        {esEnvio && !cerrada && !soloLectura ? (
          <>
            {ia && tarea.conversationId && (
              <Link href={`/inbox?conversation=${tarea.conversationId}`} className={cn(boton, "border font-medium hover:bg-accent")}>
                <MessageSquareText className="size-3.5" /> Bandeja
              </Link>
            )}
            <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => void dejarPendiente()}>
              Dejar pendiente
            </Button>
            <Button size="sm" variant="secondary" disabled={ocupado} onClick={() => void programar()}>
              <Clock className="size-3.5" /> Programar
            </Button>
            {tarea.tipo === "mensaje" ? (
              <Button size="sm" disabled={ocupado} onClick={() => void enviarAhora()}>
                <Send className="size-3.5" /> Enviar ahora
              </Button>
            ) : (
              <Button
                size="sm"
                disabled={ocupado}
                onClick={() => setNota("El envío de mails todavía no está conectado (se conecta con Gmail más adelante). Por ahora, programalo o mandalo desde tu correo.")}
              >
                <Mail className="size-3.5" /> Enviar
              </Button>
            )}
          </>
        ) : (
          <>
            {tarea.oportunidadId && (
              <Link href={`/oportunidades/${tarea.oportunidadId}`} className={cn(boton, "border font-medium hover:bg-accent")}>
                Abrir oportunidad
              </Link>
            )}
            {!soloLectura && (
              <Button size="sm" disabled={ocupado} onClick={() => void guardarYCerrar()}>
                Guardar
              </Button>
            )}
          </>
        )}
      </div>
    </Ventana>
  );
}

/** El estado de una cita como lo ve una persona: confirmar va en el estado. */
type EstadoCita = "sin_confirmar" | "confirmada" | "realizada" | "no_show" | "cancelada";

function estadoDeCita(b: Booking): EstadoCita {
  if (b.status !== "agendada") return b.status;
  return b.confirmadaAt ? "confirmada" : "sin_confirmar";
}

function duracion(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/**
 * v2, punto 2 — La cita (visita o reunión) en la misma ventana. Reemplaza al
 * panel lateral cuando el calendario vive dentro de Tareas. Sin «Ver como»,
 * sin caja de confirmar (se confirma con el estado), sin el enlace de la
 * reunión ni «Reintentar el enlace».
 */
export function VentanaCita({
  cita,
  titulo,
  timezone,
  nowMs,
  today,
  onCerrar,
  onCambio,
  onReprogramada,
}: {
  cita: Booking;
  /** El título si no es el nombre del contacto (el widget ya lo trae armado). */
  titulo?: string;
  /** La zona del negocio: la fecha se lee en su hora. */
  timezone: string;
  nowMs: number;
  today: string;
  onCerrar: () => void;
  onCambio: () => void | Promise<void>;
  onReprogramada?: (startUtc: string) => void;
}) {
  const avisar = useAvisoGuardado();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moviendo, setMoviendo] = useState(false);
  const estado = estadoDeCita(cita);
  const activa = cita.status === "agendada";
  const termino = Date.parse(cita.scheduledAtUtc) + cita.durationMinutes * 60_000 < nowMs;

  async function accion(url: string, metodo: "PATCH" | "POST", cuerpo?: Record<string, unknown>) {
    setOcupado(true);
    setError(null);
    const res = await fetch(url, {
      method: metodo,
      headers: { "content-type": "application/json" },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    }).catch(() => null);
    setOcupado(false);
    if (!res?.ok) {
      setError(res ? await mensajeDe(res) : "No se pudo completar la acción");
      return false;
    }
    await onCambio();
    return true;
  }

  async function cambiarEstado(v: string) {
    if (v === estado) return;
    if (v === "confirmada") {
      if (await accion(`/api/bookings/${cita.id}/confirmar`, "POST")) avisar("Cita confirmada");
    } else if (v === "realizada" || v === "no_show") {
      if (await accion(`/api/bookings/${cita.id}`, "PATCH", { action: "status", status: v })) avisar("Listo");
    } else if (v === "cancelada") {
      if (window.confirm("¿Cancelar esta cita?") && (await accion(`/api/bookings/${cita.id}`, "PATCH", { action: "cancel" }))) {
        avisar("Cita cancelada");
      }
    }
  }

  const opciones: { value: EstadoCita; label: string }[] = activa
    ? [
        ...(estado === "sin_confirmar" ? [{ value: "sin_confirmar" as const, label: "Sin confirmar" }] : []),
        { value: "confirmada", label: "Confirmada" },
        ...(termino
          ? [
              { value: "realizada" as const, label: "Vino" },
              { value: "no_show" as const, label: "No vino" },
            ]
          : []),
        { value: "cancelada", label: "Cancelada" },
      ]
    : [{ value: estado, label: { realizada: "Vino", no_show: "No vino", cancelada: "Cancelada" }[estado as "realizada"] ?? estado }];

  return (
    <Ventana
      titulo={<Encabezado tipo="visita" etiqueta="Cita" titulo={titulo ?? (cita.contact?.name.trim() || "Sin contacto")} ia={false} />}
      onCerrar={onCerrar}
      className="sm:max-w-[420px]"
    >
      <Fila etiqueta="Estado">
        <Select
          value={estado}
          disabled={!activa || ocupado}
          onValueChange={(v) => void cambiarEstado(v)}
          className={cn("h-8 w-auto rounded-full", estado === "cancelada" && "text-text-3")}
        >
          {opciones.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Fila>
      <Fila etiqueta="Fecha">
        <button
          type="button"
          disabled={!activa || ocupado}
          onClick={() => setMoviendo((m) => !m)}
          className="inline-flex h-8 items-center rounded-md border border-border bg-card px-2.5 text-[13px] hover:bg-accent disabled:opacity-60"
        >
          {textoDeFecha(
            `${dayIsoInTz(new Date(cita.scheduledAtUtc), timezone)}T${hhmm(wallClock(new Date(cita.scheduledAtUtc), timezone).minutes)}`,
            today
          )}
        </button>
        <span className="ml-2 text-[12px] text-text-3">{duracion(cita.durationMinutes)}</span>
      </Fila>
      {moviendo && (
        <div className="-mx-4">
          <Reschedule
            today={today}
            busy={ocupado}
            onCancel={() => setMoviendo(false)}
            onPick={async (startUtc) => {
              if (await accion(`/api/bookings/${cita.id}`, "PATCH", { action: "reschedule", startUtc })) {
                setMoviendo(false);
                avisar("Cita reprogramada");
                onReprogramada?.(startUtc);
              }
            }}
          />
        </div>
      )}
      {cita.ubicacion && (
        <Fila etiqueta="Dirección">
          <span className="text-text-2">{cita.ubicacion}</span>
        </Fila>
      )}
      <Fila etiqueta="Agendó">
        <span className="inline-flex items-center gap-1.5 text-text-2">
          {cita.source === "ai" ? (
            <>
              <MarcaIa agente="el agente" /> El agente
            </>
          ) : (
            "Una persona del equipo"
          )}
        </span>
      </Fila>
      {cita.notes && (
        <div className="mt-2">
          <span className="mb-1 block text-[12px] text-text-3">Comentarios</span>
          <p className="whitespace-pre-wrap rounded-md bg-subtle px-3 py-2 text-[13px] text-text-2">{cita.notes}</p>
        </div>
      )}
      {activa && termino && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-warning-tint px-3 py-2 text-[13px] text-warning-text">
          <span className="mr-auto font-medium">¿Vino?</span>
          <Button size="sm" variant="secondary" disabled={ocupado} onClick={() => void cambiarEstado("realizada")}>
            Sí, vino
          </Button>
          <Button size="sm" variant="secondary" disabled={ocupado} onClick={() => void cambiarEstado("no_show")}>
            No vino
          </Button>
        </div>
      )}
      {cita.confirmadaAt && Date.parse(cita.confirmadaAt) > 0 && (
        <p className="mt-2 text-[12px] text-text-3">
          Confirmada el {new Date(cita.confirmadaAt).toLocaleDateString("es-AR", { day: "numeric", month: "short" })}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 rounded-sm bg-danger-tint px-3 py-2 text-sm text-danger-text">
          {error}
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3">
        {activa && (
          <Button size="sm" variant="ghost" className="text-danger-text" disabled={ocupado} onClick={() => void cambiarEstado("cancelada")}>
            Cancelar cita
          </Button>
        )}
        <span className="flex-1" />
        {(cita.conversationId || cita.contact) && (
          <Link
            href={cita.conversationId ? `/inbox?conversation=${cita.conversationId}` : `/inbox?contact=${cita.contact!.id}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-[13px] font-medium hover:bg-accent"
          >
            <MessageSquareText className="size-3.5" /> Abrir conversación
          </Link>
        )}
        <Button size="sm" onClick={onCerrar}>
          Listo
        </Button>
      </div>
    </Ventana>
  );
}
