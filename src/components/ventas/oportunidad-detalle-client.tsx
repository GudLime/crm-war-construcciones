"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarClock,
  Check,
  CircleDot,
  ClipboardList,
  FileText,
  Flag,
  History,
  Mail,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  RotateCcw,
  Sparkles,
  StickyNote,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EstadoPill, aLocal, plata, useMoneda } from "@/components/ventas/ui";
import type { NotaDto } from "@/lib/notas";
import type { IconoTimeline, ItemTimeline, MensajeCorto, TareaCorta } from "@/lib/oportunidad-detalle";
import { formatearTelefono } from "@/lib/telefono-formato";
import { cn } from "@/lib/utils";
import {
  CAMINO_OPORTUNIDAD,
  ESTADOS_OPORTUNIDAD,
  TIPOLOGIAS,
  TIPOS_CONTACTO,
  TIPOS_OPORTUNIDAD,
  TIPOS_TAREA,
  etiqueta,
  type EstadoOportunidad,
} from "@/lib/ventas";
import type { OportunidadDetalleDto } from "@/server/oportunidad-detalle";
import { useMotivosCierre } from "./use-motivos-cierre";
import { ObjetosDeOportunidad } from "@/components/motor/oportunidad-objetos";

/**
 * War — La página de una oportunidad (ver WAR.md → «Página de la oportunidad»).
 *
 * Encabezado con el avance, y debajo dos columnas: a la izquierda las
 * pestañas (Timeline, Reuniones, Notas, Últimos mensajes) y a la derecha las
 * tarjetas del contacto, los próximos pasos y los datos de la oportunidad.
 */

type Pestana = "timeline" | "reuniones" | "notas" | "mensajes";

const TARJETA = "rounded-tarjeta border border-border bg-card shadow-tarjeta";

function fecha(iso: string | null, conHora = true): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(conHora ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(new Date(iso));
}

function haceCuanto(iso: string, ahora = Date.now()): string {
  const min = Math.max(0, Math.round((ahora - new Date(iso).getTime()) / 60_000));
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  if (d === 1) return "ayer";
  if (d < 30) return `hace ${d} días`;
  return fecha(iso, false);
}

function iniciales(nombre: string): string {
  const partes = nombre.replace(/[^\p{L}\s]/gu, " ").trim().split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] ?? "?") + (partes[1]?.[0] ?? "")).toUpperCase();
}

async function mensajeError(res: Response | null): Promise<string> {
  const d = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
  return d?.error?.message ?? "No se pudo guardar. Revisá la conexión.";
}

export function OportunidadDetalleClient() {
  const { id } = useParams<{ id: string }>();
  const [datos, setDatos] = useState<OportunidadDetalleDto | null>(null);
  const [noExiste, setNoExiste] = useState(false);
  const [pestana, setPestana] = useState<Pestana>("timeline");
  const [error, setError] = useState<string | null>(null);
  const moneda = useMoneda();

  const cargar = useCallback(async () => {
    const res = await fetch(`/api/oportunidades/${id}/detalle`).catch(() => null);
    if (res?.status === 404) {
      setNoExiste(true);
      return;
    }
    if (!res?.ok) return;
    setDatos((await res.json()) as OportunidadDetalleDto);
  }, [id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function cambiarEstado(estado: EstadoOportunidad, motivoCierre?: string | null) {
    setError(null);
    const res = await fetch(`/api/oportunidades/${id}/estado`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ estado, ...(motivoCierre !== undefined ? { motivoCierre } : {}) }),
    }).catch(() => null);
    if (!res?.ok) {
      setError(await mensajeError(res));
      return;
    }
    await cargar();
  }

  if (noExiste) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-text-2">Esa oportunidad no existe (o se borró).</p>
        <Link href="/oportunidades" className="text-sm font-medium text-brand-ink hover:underline">
          Volver a Oportunidades
        </Link>
      </div>
    );
  }
  if (!datos) return <p className="p-6 text-sm text-text-3">Cargando…</p>;

  const { oportunidad: op, contacto, conversacion } = datos;
  const enChat = contacto ? `/inbox?contact=${contacto.id}` : null;

  return (
    <div className="h-full overflow-y-auto bg-subtle">
      <div className="mx-auto max-w-[1280px] space-y-4 px-3 py-4 sm:px-6 sm:py-6">
        {/* Encabezado */}
        <section className={cn(TARJETA, "p-4 sm:p-6")}>
          <div className="flex flex-wrap items-start gap-4">
            <Link
              href="/oportunidades"
              aria-label="Volver a Oportunidades"
              className="grid size-10 shrink-0 place-items-center rounded-full border border-border text-text-2 hover:bg-accent hover:text-foreground"
            >
              <ArrowLeft className="size-4" />
            </Link>
            <div className="grid size-12 shrink-0 place-items-center rounded-full bg-brand-tint text-[15px] font-bold text-brand-ink">
              {iniciales(op.nombre)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-[22px] font-bold tracking-tight">{op.nombre}</h1>
                <EstadoPill opciones={ESTADOS_OPORTUNIDAD} value={op.estado} />
                {op.sinRespuesta && (
                  <span className="rounded-full bg-warning-tint px-2.5 py-0.5 text-[12px] font-medium text-warning-text">
                    {op.sinRespuesta}
                  </span>
                )}
              </div>
              <p className="mt-1 text-[13.5px] text-text-2">
                {[
                  op.edificios.map((e) => e.nombre).join(", ") || op.edificioNombre,
                  op.unidad,
                  op.origen,
                  `Creada el ${fecha(op.createdAt, false)}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/oportunidades?editar=${op.id}`}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-4 text-sm font-medium hover:bg-accent"
              >
                <Pencil className="size-3.5" /> Editar
              </Link>
              {enChat && (
                <Link
                  href={enChat}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full bg-brand px-4 text-sm font-semibold text-brand-fg hover:bg-brand-hover"
                >
                  <MessageCircle className="size-4" /> Ir al chat
                </Link>
              )}
            </div>
          </div>

          {op.paraCerrar && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-warning-tint px-4 py-3 text-[13.5px] text-warning-text">
              <span>Cumple el umbral de «no responde» de Configuración → Ventas.</span>
              <Button size="sm" variant="outline" onClick={() => void cambiarEstado("perdido", "No responde")}>
                Cerrar como «No responde»
              </Button>
            </div>
          )}

          <BarraDeAvance estado={op.estado} motivo={op.motivoCierre} onCambiar={cambiarEstado} />
          {error && <p className="mt-2 text-sm text-danger-text">{error}</p>}
        </section>

        {datos.paralelas.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-info-soft bg-info-tint px-4 py-2.5 text-[13.5px] text-info-text">
            <CircleDot className="size-4" />
            <span>También tiene abierta:</span>
            {datos.paralelas.map((p) => (
              <Link key={p.id} href={`/oportunidades/${p.id}`} className="font-medium underline-offset-2 hover:underline">
                {p.edificioNombre ?? p.nombre} ({etiqueta(ESTADOS_OPORTUNIDAD, p.estado)})
              </Link>
            ))}
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          {/* Pestañas */}
          <section className={cn(TARJETA, "min-w-0 p-3 sm:p-5")}>
            <div role="tablist" aria-label="Secciones" className="mb-4 flex flex-wrap gap-1 rounded-full bg-subtle p-1">
              {(
                [
                  ["timeline", "Timeline", null],
                  ["reuniones", "Reuniones", datos.reuniones.length],
                  ["notas", "Notas", datos.notas.length],
                  ["mensajes", "Últimos mensajes", null],
                ] as const
              ).map(([valor, texto, n]) => (
                <button
                  key={valor}
                  type="button"
                  role="tab"
                  aria-selected={pestana === valor}
                  onClick={() => setPestana(valor)}
                  className={cn(
                    "rounded-full px-4 py-1.5 text-[13.5px] font-medium transition-colors",
                    pestana === valor ? "bg-foreground text-background" : "text-text-2 hover:text-foreground"
                  )}
                >
                  {texto}
                  {n ? <span className="ml-1.5 opacity-70">{n}</span> : null}
                </button>
              ))}
            </div>

            {pestana === "timeline" && <Timeline items={datos.timeline} anterior={datos.anterior} />}
            {pestana === "reuniones" && <Reuniones reuniones={datos.reuniones} />}
            {pestana === "notas" && <Notas oportunidadId={op.id} notas={datos.notas} onCambio={cargar} />}
            {pestana === "mensajes" && (
              <UltimosMensajes mensajes={datos.mensajes} conversacion={conversacion} enChat={enChat} />
            )}
          </section>

          {/* Tarjetas */}
          <aside className="space-y-4">
            <TarjetaContacto contacto={contacto} enChat={enChat} />
            <ProximosPasos
              tareas={datos.tareasPendientes}
              oportunidadId={op.id}
              contactId={contacto?.id ?? null}
              onCambio={cargar}
            />
            {/* 070 — Los objetos del cliente vinculados y las reglas de etapa. */}
            <ObjetosDeOportunidad oportunidadId={op.id} estado={op.estado} />
            <section className={cn(TARJETA, "p-5")}>
              <h2 className="mb-3 text-[15px] font-semibold">Datos de la oportunidad</h2>
              <dl className="space-y-2.5 text-[13.5px]">
                <Dato titulo="Tipo">{op.tipo ? etiqueta(TIPOS_OPORTUNIDAD, op.tipo) : "—"}</Dato>
                <Dato titulo="Valor">{op.valorCents == null ? "—" : plata(op.valorCents, op.moneda, moneda)}</Dato>
                <Dato titulo="Origen">{op.origen ?? "—"}</Dato>
                <Dato titulo="Tipologías">
                  {op.tipologias.length ? op.tipologias.map((t) => etiqueta(TIPOLOGIAS, t)).join(", ") : "—"}
                </Dato>
                <Dato titulo="En este estado">desde {fecha(op.estadoDesde)}</Dato>
                {op.cerradaAt && <Dato titulo="Cerrada">{fecha(op.cerradaAt)}{op.motivoCierre ? ` · ${op.motivoCierre}` : ""}</Dato>}
              </dl>
              {datos.formularios.length > 0 && (
                <div className="mt-4 border-t border-border pt-3">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-3">
                    Formularios recibidos
                  </p>
                  <ul className="space-y-2">
                    {datos.formularios.map((f) => (
                      <li key={f.leadId} className="rounded-xl bg-subtle px-3 py-2 text-[12.5px]">
                        <p className="font-medium">{f.formName ?? f.origen}</p>
                        <p className="text-text-3">
                          {[f.campaignName, f.adName, fecha(f.recibidoAt)].filter(Boolean).join(" · ")}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}

function Dato({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-text-3">{titulo}</dt>
      <dd className="min-w-0 text-right font-medium">{children}</dd>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function BarraDeAvance({
  estado,
  motivo,
  onCambiar,
}: {
  estado: EstadoOportunidad;
  motivo: string | null;
  onCambiar: (e: EstadoOportunidad, motivo?: string | null) => Promise<void>;
}) {
  const [cerrando, setCerrando] = useState(false);
  const [motivoNuevo, setMotivoNuevo] = useState("");
  const motivosCierre = useMotivosCierre();
  const indice = CAMINO_OPORTUNIDAD.indexOf(estado);
  const perdida = estado === "perdido" || estado === "no_calificado";

  return (
    <div className="mt-5">
      <ol className="flex flex-wrap gap-1.5 sm:flex-nowrap">
        {CAMINO_OPORTUNIDAD.map((paso, i) => {
          const hecho = !perdida && indice >= 0 && i < indice;
          const actual = paso === estado;
          return (
            <li key={paso} className="min-w-[96px] flex-1">
              <button
                type="button"
                onClick={() => void onCambiar(paso)}
                disabled={actual}
                aria-current={actual ? "step" : undefined}
                className={cn(
                  "flex h-10 w-full items-center justify-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-colors",
                  actual && "bg-brand text-brand-fg",
                  hecho && "bg-brand-tint text-brand-ink hover:bg-brand-soft",
                  !actual && !hecho && "bg-subtle text-text-3 hover:bg-accent hover:text-foreground"
                )}
              >
                {(hecho || actual) && <Check className="size-3.5 shrink-0" />}
                <span className="truncate">{etiqueta(ESTADOS_OPORTUNIDAD, paso)}</span>
              </button>
            </li>
          );
        })}
        <li className="min-w-[96px] flex-1">
          <button
            type="button"
            onClick={() => setCerrando((v) => !v)}
            aria-expanded={cerrando}
            className={cn(
              "flex h-10 w-full items-center justify-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-colors",
              perdida ? "bg-danger-tint text-danger-text" : "bg-subtle text-text-3 hover:bg-accent hover:text-foreground"
            )}
          >
            {perdida ? <X className="size-3.5" /> : <Flag className="size-3.5" />}
            <span className="truncate">{perdida ? etiqueta(ESTADOS_OPORTUNIDAD, estado) : "Perdida"}</span>
          </button>
        </li>
      </ol>
      {perdida && motivo && <p className="mt-2 text-[12.5px] text-text-3">Motivo: {motivo}</p>}
      {cerrando && (
        <div className="mt-3 flex flex-wrap items-end gap-2 rounded-2xl bg-subtle p-3">
          <div className="min-w-[220px] flex-1">
            <p className="mb-1 text-[12px] font-medium text-text-2">Motivo</p>
            <Select value={motivoNuevo} onValueChange={setMotivoNuevo} className="w-full">
              <option value="">Sin motivo</option>
              {motivosCierre.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void onCambiar("perdido", motivoNuevo || null).then(() => setCerrando(false))}
          >
            Perdido
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void onCambiar("no_calificado", motivoNuevo || null).then(() => setCerrando(false))}
          >
            No calificado
          </Button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

const ICONOS: Record<IconoTimeline, typeof Check> = {
  creada: Sparkles,
  estado: ArrowRight,
  cerrada: Flag,
  reabierta: RotateCcw,
  formulario: FileText,
  whatsapp: MessageCircle,
  reunion: CalendarClock,
  tarea: ClipboardList,
  nota: StickyNote,
  contacto: Phone,
  anterior: History,
};

function Timeline({ items, anterior }: { items: ItemTimeline[]; anterior: OportunidadDetalleDto["anterior"] }) {
  if (!items.length && !anterior) {
    return <p className="py-8 text-center text-sm text-text-3">Todavía no hay nada para mostrar.</p>;
  }
  return (
    <ol className="space-y-1">
      {items.map((it) => {
        const Icono = ICONOS[it.icono];
        return (
          <li key={it.id} className="flex gap-3 border-b border-border py-3 last:border-0">
            <span
              className={cn(
                "grid size-9 shrink-0 place-items-center rounded-full",
                it.tono === "ok" && "bg-success-tint text-success-text",
                it.tono === "malo" && "bg-danger-tint text-danger-text",
                (!it.tono || it.tono === "neutro") && it.icono === "whatsapp" && "bg-brand-tint text-brand-ink",
                (!it.tono || it.tono === "neutro") && it.icono !== "whatsapp" && "bg-subtle text-text-2"
              )}
            >
              <Icono className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <p className="text-[14px] font-semibold">{it.titulo}</p>
                <time className="shrink-0 text-[12px] text-text-3" title={fecha(it.at)}>
                  {haceCuanto(it.at)}
                </time>
              </div>
              {it.detalle && (
                <p className="mt-0.5 whitespace-pre-wrap break-words text-[13.5px] text-text-2">{it.detalle}</p>
              )}
              {it.quien && <p className="mt-0.5 text-[12px] text-text-3">{it.quien}</p>}
            </div>
          </li>
        );
      })}
      {anterior && (
        <li className="mt-2 flex gap-3 rounded-2xl bg-subtle p-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-card text-text-2">
            <History className="size-4" />
          </span>
          <div className="min-w-0 flex-1 text-[13.5px]">
            <p className="font-semibold">Oportunidad anterior: {anterior.edificioNombre ?? anterior.nombre}</p>
            <p className="text-text-2">
              {etiqueta(ESTADOS_OPORTUNIDAD, anterior.estado)}
              {anterior.cerradaAt ? ` el ${fecha(anterior.cerradaAt, false)}` : ""}
              {anterior.motivoCierre ? ` · motivo: ${anterior.motivoCierre}` : ""}
            </p>
            <Link href={`/oportunidades/${anterior.id}`} className="text-[12.5px] font-medium text-brand-ink hover:underline">
              Ver esa oportunidad →
            </Link>
          </div>
        </li>
      )}
    </ol>
  );
}

/* ------------------------------------------------------------------ */

const ESTADO_REUNION = {
  agendada: { texto: "Agendada", clase: "bg-info-tint text-info-text" },
  realizada: { texto: "Realizada", clase: "bg-success-tint text-success-text" },
  no_show: { texto: "No vino", clase: "bg-danger-tint text-danger-text" },
  cancelada: { texto: "Cancelada", clase: "bg-subtle text-text-3" },
} as const;

function Reuniones({ reuniones }: { reuniones: OportunidadDetalleDto["reuniones"] }) {
  if (!reuniones.length) {
    return <p className="py-8 text-center text-sm text-text-3">No hay reuniones ni visitas agendadas.</p>;
  }
  const ahora = Date.now();
  const proximas = reuniones
    .filter((r) => r.status === "agendada" && new Date(r.scheduledAt).getTime() >= ahora)
    .reverse();
  const pasadas = reuniones.filter((r) => !proximas.includes(r));
  const fila = (r: (typeof reuniones)[number]) => (
    <li key={r.id} className="flex items-center gap-3 rounded-2xl border border-border p-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-tint text-brand-ink">
        <CalendarClock className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold">{fecha(r.scheduledAt)}</p>
        <p className="text-[12.5px] text-text-3">
          {r.durationMinutes} min{r.source === "ai" ? " · la agendó Mateo" : ""}
          {r.meetingLink && (
            <>
              {" · "}
              <a href={r.meetingLink} target="_blank" rel="noreferrer" className="text-brand-ink hover:underline">
                enlace
              </a>
            </>
          )}
        </p>
      </div>
      <span className={cn("rounded-full px-2.5 py-0.5 text-[12px] font-medium", ESTADO_REUNION[r.status].clase)}>
        {ESTADO_REUNION[r.status].texto}
      </span>
    </li>
  );
  return (
    <div className="space-y-5">
      {proximas.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-3">Próximas</p>
          <ul className="space-y-2">{proximas.map(fila)}</ul>
        </div>
      )}
      {pasadas.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-3">Pasadas</p>
          <ul className="space-y-2">{pasadas.map(fila)}</ul>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Notas({
  oportunidadId,
  notas,
  onCambio,
}: {
  oportunidadId: string;
  notas: NotaDto[];
  onCambio: () => Promise<void>;
}) {
  const [texto, setTexto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    if (!texto.trim()) return;
    setGuardando(true);
    setError(null);
    const res = await fetch(`/api/oportunidades/${oportunidadId}/notas`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ texto }),
    }).catch(() => null);
    setGuardando(false);
    if (!res?.ok) {
      setError(await mensajeError(res));
      return;
    }
    setTexto("");
    await onCambio();
  }

  async function borrar(n: NotaDto) {
    if (!window.confirm("¿Borrar esta nota?")) return;
    const res = await fetch(`/api/oportunidades/${oportunidadId}/notas/${n.id}`, { method: "DELETE" }).catch(
      () => null
    );
    if (!res?.ok) {
      setError(await mensajeError(res));
      return;
    }
    await onCambio();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-2 rounded-2xl border border-border p-2">
        <Textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Escribí una nota o registrá una llamada…"
          rows={2}
          className="min-h-0 resize-none border-0 shadow-none focus-visible:ring-0"
        />
        <Button size="sm" onClick={() => void guardar()} disabled={guardando || !texto.trim()} className="rounded-xl">
          Guardar
        </Button>
      </div>
      <p className="-mt-2 text-[12px] text-text-3">También se ve en el chat del contacto, como nota interna.</p>
      {error && <p className="text-sm text-danger-text">{error}</p>}
      {notas.length === 0 ? (
        <p className="py-6 text-center text-sm text-text-3">Sin notas todavía.</p>
      ) : (
        <ul className="space-y-2">
          {[...notas].reverse().map((n) => (
            <li key={n.id} className="rounded-2xl border border-border p-3">
              <div className="mb-1 flex items-center gap-2 text-[12px] text-text-3">
                <StickyNote className="size-3.5" />
                <span className="font-medium text-text-2">{n.autor?.nombre ?? "Alguien del equipo"}</span>
                <span>· {fecha(n.createdAt)}</span>
                {n.conversationId && <span>· desde el chat</span>}
                {n.puedeBorrar && (
                  <button
                    type="button"
                    onClick={() => void borrar(n)}
                    aria-label="Borrar nota"
                    className="ml-auto rounded p-1 hover:bg-accent"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
              <p className="whitespace-pre-wrap break-words text-[13.5px]">{n.texto}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function UltimosMensajes({
  mensajes,
  conversacion,
  enChat,
}: {
  mensajes: MensajeCorto[];
  conversacion: OportunidadDetalleDto["conversacion"];
  enChat: string | null;
}) {
  return (
    <div className="space-y-4">
      {mensajes.length === 0 ? (
        <p className="py-8 text-center text-sm text-text-3">No hay mensajes en esta oportunidad.</p>
      ) : (
        <ul className="space-y-2 rounded-2xl bg-chat p-3">
          {mensajes.map((m) => {
            const sale = m.direction === "out";
            return (
              <li key={m.id} className={cn("flex", sale ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl border px-3 py-2 text-[13.5px] shadow-sm",
                    sale
                      ? "border-bubble-out-border bg-bubble-out text-bubble-out-text"
                      : "border-bubble-in-border bg-bubble-in text-bubble-in-text"
                  )}
                >
                  <p className="whitespace-pre-wrap break-words">{m.texto ?? `[${m.tipo}]`}</p>
                  <p className="mt-1 text-right text-[11px] opacity-70">
                    {sale ? (m.origen === "ai" ? "Mateo · " : "Equipo · ") : ""}
                    {haceCuanto(m.createdAt)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12.5px] text-text-3">
          {conversacion
            ? conversacion.ventanaAbierta
              ? `Ventana de 24 h abierta hasta ${fecha(conversacion.ventanaCierraAt)}`
              : "Ventana de 24 h cerrada: para escribirle hace falta una plantilla."
            : "Todavía no hay conversación por WhatsApp."}
        </p>
        {enChat && conversacion && (
          <Link
            href={enChat}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-brand px-4 text-sm font-semibold text-brand-fg hover:bg-brand-hover"
          >
            <MessageCircle className="size-4" /> Ir al chat
          </Link>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function TarjetaContacto({
  contacto,
  enChat,
}: {
  contacto: OportunidadDetalleDto["contacto"];
  enChat: string | null;
}) {
  return (
    <section className={cn(TARJETA, "p-5")}>
      <h2 className="mb-3 text-[15px] font-semibold">Contacto</h2>
      {!contacto ? (
        <p className="text-sm text-text-3">Sin contacto asociado.</p>
      ) : (
        <div className="space-y-3 text-[13.5px]">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-full bg-subtle text-text-2">
              <UserRound className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="truncate font-semibold">{contacto.nombre}</p>
              <p className="text-[12px] text-text-3">
                {contacto.tipoContacto ? etiqueta(TIPOS_CONTACTO, contacto.tipoContacto) : "Sin clasificar"}
                {` · desde ${fecha(contacto.creadoAt, false)}`}
              </p>
            </div>
          </div>
          <Campo icono={Phone} titulo="Teléfono">
            {contacto.telefono ? formatearTelefono(contacto.telefono) : "—"}
          </Campo>
          <Campo icono={Mail} titulo="Correo">
            {contacto.email ?? "—"}
          </Campo>
          {contacto.anuncio && (
            <Campo icono={Building2} titulo="Anuncio">
              {contacto.anuncio.url ? (
                <a href={contacto.anuncio.url} target="_blank" rel="noreferrer" className="text-brand-ink hover:underline">
                  {contacto.anuncio.titulo ?? "Ver anuncio"}
                </a>
              ) : (
                (contacto.anuncio.titulo ?? "De un anuncio")
              )}
            </Campo>
          )}
          {enChat && (
            <Link
              href={enChat}
              className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-full border border-border text-[12.5px] font-medium hover:bg-accent"
            >
              <MessageCircle className="size-3.5" /> Abrir el chat
            </Link>
          )}
        </div>
      )}
    </section>
  );
}

function Campo({
  icono: Icono,
  titulo,
  children,
}: {
  icono: typeof Phone;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-3">
        <Icono className="size-3" /> {titulo}
      </p>
      <p className="mt-0.5 break-words">{children}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ProximosPasos({
  tareas,
  oportunidadId,
  contactId,
  onCambio,
}: {
  tareas: TareaCorta[];
  oportunidadId: string;
  contactId: string | null;
  onCambio: () => Promise<void>;
}) {
  const [agregando, setAgregando] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [tipo, setTipo] = useState<string>("llamada");
  const [fechaNueva, setFechaNueva] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function marcar(t: TareaCorta, estado: "listo" | "no_responde") {
    setError(null);
    const res = await fetch(`/api/tareas/${t.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        titulo: t.titulo,
        tipo: t.tipo,
        estado,
        fecha: t.fecha ? aLocal(t.fecha) : null,
        comentarios: t.comentarios,
        contactId: t.contactId,
        oportunidadId: t.oportunidadId ?? oportunidadId,
      }),
    }).catch(() => null);
    if (!res?.ok) {
      setError(await mensajeError(res));
      return;
    }
    await onCambio();
  }

  async function agregar() {
    if (!titulo.trim()) return;
    setError(null);
    const res = await fetch("/api/tareas", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        titulo,
        tipo,
        fecha: fechaNueva || null,
        oportunidadId,
        contactId,
      }),
    }).catch(() => null);
    if (!res?.ok) {
      setError(await mensajeError(res));
      return;
    }
    setTitulo("");
    setFechaNueva("");
    setAgregando(false);
    await onCambio();
  }

  return (
    <section className={cn(TARJETA, "p-5")}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold">Próximos pasos</h2>
        <button
          type="button"
          onClick={() => setAgregando((v) => !v)}
          className="inline-flex items-center gap-1 text-[13px] font-medium text-brand-ink hover:underline"
        >
          <Plus className="size-3.5" /> Agregar
        </button>
      </div>
      {agregando && (
        <div className="mb-3 space-y-2 rounded-2xl bg-subtle p-3">
          <input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Qué hay que hacer"
            aria-label="Título de la tarea"
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          />
          <div className="flex gap-2">
            <Select value={tipo} onValueChange={setTipo} aria-label="Tipo" className="w-36">
              {TIPOS_TAREA.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
            <input
              type="datetime-local"
              value={fechaNueva}
              onChange={(e) => setFechaNueva(e.target.value)}
              aria-label="Fecha"
              className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm"
            />
          </div>
          <Button size="sm" onClick={() => void agregar()} disabled={!titulo.trim()}>
            Agregar tarea
          </Button>
        </div>
      )}
      {error && <p className="mb-2 text-sm text-danger-text">{error}</p>}
      {tareas.length === 0 ? (
        <p className="text-sm text-text-3">No hay tareas pendientes.</p>
      ) : (
        <ul className="space-y-1.5">
          {tareas.map((t) => (
            <li key={t.id} className="group flex items-start gap-2.5 rounded-xl px-1 py-1.5">
              <button
                type="button"
                onClick={() => void marcar(t, "listo")}
                aria-label={`Marcar hecha: ${t.titulo}`}
                className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2 border-border-strong text-transparent hover:border-brand hover:text-brand"
              >
                <Check className="size-3" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-medium">{t.titulo}</p>
                <p className="text-[12px] text-text-3">
                  {etiqueta(TIPOS_TAREA, t.tipo)}
                  {t.fecha ? ` · ${fecha(t.fecha)}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void marcar(t, "no_responde")}
                title="La hice y no respondió (cuenta como intento)"
                className="shrink-0 rounded-full px-2 py-0.5 text-[11.5px] text-text-3 opacity-0 hover:bg-accent hover:text-foreground focus:opacity-100 group-hover:opacity-100"
              >
                No respondió
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
