"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BedDouble,
  Building2,
  CalendarClock,
  CalendarPlus,
  Check,
  ChevronDown,
  CircleDollarSign,
  CircleDot,
  ClipboardList,
  DoorOpen,
  FileText,
  Flag,
  History,
  Mail,
  Megaphone,
  Pencil,
  Phone,
  Plus,
  RotateCcw,
  Sparkles,
  StickyNote,
  Tag,
  Timer,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { aLocal, plata, useMoneda } from "@/components/ventas/ui";
import { WhatsAppLogo } from "@/components/whatsapp-logo";
import type { NotaDto } from "@/lib/notas";
import type {
  IconoTimeline,
  ItemTimeline,
  MensajeCorto,
  ProximoPaso,
  TareaCorta,
} from "@/lib/oportunidad-detalle";
import type { OrigenDto } from "@/lib/origenes";
import { formatearTelefono } from "@/lib/telefono-formato";
import { cn } from "@/lib/utils";
import {
  CAMINO_OPORTUNIDAD,
  ESTADOS_OPORTUNIDAD,
  MOTIVOS_CIERRE,
  TIPOS_CONTACTO,
  TIPOS_OPORTUNIDAD,
  TIPOS_TAREA,
  etiqueta,
  type EstadoOportunidad,
} from "@/lib/ventas";
import type { OportunidadDetalleDto } from "@/server/oportunidad-detalle";
import {
  AvisosDeReglas,
  UnidadesDeInteres,
  VinculoEnLinea,
  useObjetosDeOportunidad,
} from "@/components/motor/oportunidad-objetos";
import { OrigenIcono } from "./origen-icono";
import { PildoraEdificio } from "./pildora-edificio";

/**
 * La página de una oportunidad (ver GUDLIME.md → «Página de la oportunidad»).
 *
 * Encabezado: nombre (con lápiz al pasar el mouse), los datos en dos
 * columnas y la barra de avance en flechas. Debajo, dos columnas: a la
 * izquierda las pestañas (el Timeline arranca con los próximos pasos, un
 * divisor «Hoy» y el historial) y a la derecha el contacto, plegable.
 */

type Pestana = "timeline" | "reuniones" | "notas" | "mensajes";

const TARJETA = "rounded-tarjeta border border-border bg-card shadow-tarjeta";
const ZONA = "America/Argentina/Buenos_Aires";

function fecha(iso: string | null, conHora = true): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: ZONA,
    ...(conHora ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(new Date(iso));
}

/** «jue 6 nov · 14:10» (con el año si no es el actual). */
export function fechaExacta(iso: string, ahora = new Date()): string {
  const d = new Date(iso);
  const partes = new Intl.DateTimeFormat("es-AR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: ZONA,
  }).formatToParts(d);
  const de = (t: Intl.DateTimeFormatPartTypes) =>
    (partes.find((p) => p.type === t)?.value ?? "").replace(/\.$/, "");
  const anio = de("year");
  const esteAnio = new Intl.DateTimeFormat("es-AR", { year: "numeric", timeZone: ZONA }).format(ahora);
  return `${de("weekday")} ${de("day")} ${de("month")}${anio !== esteAnio ? ` ${anio}` : ""} · ${de("hour")}:${de("minute")}`;
}

/** «Hoy · lun 9 nov». */
function hoyLargo(ahora = new Date()): string {
  return fechaExacta(ahora.toISOString(), ahora).split(" · ")[0]!;
}

function diaLocal(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(d);
}

/** Días de calendario (en la zona del negocio) entre hoy y esa fecha. */
function diasHasta(iso: string, ahora = new Date()): number {
  const a = new Date(`${diaLocal(ahora)}T00:00:00Z`).getTime();
  const b = new Date(`${diaLocal(new Date(iso))}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

export function haceCuanto(iso: string, ahora = Date.now()): string {
  const min = Math.max(0, Math.round((ahora - new Date(iso).getTime()) / 60_000));
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = diasHasta(new Date(ahora).toISOString(), new Date(iso));
  if (d <= 1) return "ayer";
  if (d < 30) return `hace ${d} días`;
  return fecha(iso, false);
}

/** «hoy 15:00», «mañana», «en 3 días». */
export function cuandoFalta(iso: string, ahora = new Date()): string {
  const d = diasHasta(iso, ahora);
  if (d <= 0) {
    const hora = new Intl.DateTimeFormat("es-AR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: ZONA,
    }).format(new Date(iso));
    return `hoy ${hora}`;
  }
  if (d === 1) return "mañana";
  if (d < 30) return `en ${d} días`;
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

type IconoDeOrigen = Map<string, { icono: string; imagen: string | null }>;

export function OportunidadDetalleClient() {
  const { id } = useParams<{ id: string }>();
  const [datos, setDatos] = useState<OportunidadDetalleDto | null>(null);
  const [noExiste, setNoExiste] = useState(false);
  const [pestana, setPestana] = useState<Pestana>("timeline");
  const [error, setError] = useState<string | null>(null);
  const [origenes, setOrigenes] = useState<IconoDeOrigen>(new Map());
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
  // Las unidades de interés y las reglas de etapa (motor). Al elegir unidades
  // el Valor puede cambiar: se vuelve a leer la oportunidad.
  const objetos = useObjetosDeOportunidad(id, datos?.oportunidad.estado ?? "", () => void cargar());
  // Si cambian los edificios de interés (por ejemplo desde Editar), cambian las unidades que se ofrecen.
  const { recargar: recargarObjetos } = objetos;
  const claveEdificios = (datos?.oportunidad.edificios ?? []).map((e) => e.id).join(",");
  useEffect(() => {
    if (claveEdificios) void recargarObjetos();
  }, [claveEdificios, recargarObjetos]);

  useEffect(() => {
    void cargar();
    void (async () => {
      const r = await fetch("/api/origenes").catch(() => null);
      if (!r?.ok) return;
      const { origenes } = (await r.json()) as { origenes: OrigenDto[] };
      setOrigenes(new Map(origenes.map((o) => [o.nombre, { icono: o.icono, imagen: o.imagen }])));
    })();
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

  async function cambiarInteres(cambios: { ambientes?: number[] }) {
    if (!datos?.contacto) return;
    setError(null);
    const res = await fetch(`/api/contacts/${datos.contacto.id}/oportunidad`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ oportunidadId: id, ...cambios }),
    }).catch(() => null);
    if (!res?.ok) {
      setError(await mensajeError(res));
      return;
    }
    // Sacar un ambiente suelta sus unidades y cambia el Valor.
    await Promise.all([cargar(), objetos.recargar()]);
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
  const edificios = op.edificios.length
    ? op.edificios
    : op.edificioId && op.edificioNombre
      ? [{ id: op.edificioId, nombre: op.edificioNombre, color: null }]
      : [];
  const interes = objetos.interes;
  // Las unidades de interés se eligen encadenadas (abajo); el resto de los vínculos, como siempre.
  const otrosVinculos = objetos.vinculos.filter((v) => !v.esInteres && v.relacion !== interes?.relacion);
  // Ambientes: los que tienen las unidades de los edificios de interés (sin
  // edificios o sin interés configurado, 1 a 4), más los ya elegidos.
  const opcionesAmbientes = [
    ...new Set([
      ...(interes && edificios.length ? interes.ambientesDisponibles : [1, 2, 3, 4]),
      ...op.ambientes,
    ]),
  ].sort((a, b) => a - b);
  // Cuántas unidades elegidas tienen precio (el Valor es su promedio).
  const conPrecio = interes
    ? interes.unidades.filter((u) => interes.elegidas.includes(u.id) && u.valorCents !== null).length
    : 0;
  const origen = op.origen ? origenes.get(op.origen) : undefined;

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
              <div className="group flex flex-wrap items-center gap-2">
                <h1 className="min-w-0 truncate text-[22px] font-bold tracking-tight">{op.nombre}</h1>
                <Link
                  href={`/oportunidades?editar=${op.id}`}
                  aria-label="Editar oportunidad"
                  title="Editar"
                  className="grid size-[30px] place-items-center rounded-md text-text-3 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
                >
                  <Pencil className="size-4" />
                </Link>
                {op.paraCerrar ? (
                  <span className="rounded-full bg-danger-tint px-2.5 py-0.5 text-[12px] font-medium text-danger-text">
                    Para cerrar
                  </span>
                ) : (
                  op.sinRespuesta && (
                    <span className="rounded-full bg-warning-tint px-2.5 py-0.5 text-[12px] font-medium text-warning-text">
                      {op.sinRespuesta}
                    </span>
                  )
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-x-10 gap-y-0.5 text-[13.5px]">
                <dl className="flex min-w-0 flex-[1_1_300px] flex-col gap-0.5">
                  <Fila icono={Megaphone} titulo="Origen">
                    {op.origen ? (
                      <span className="flex items-center gap-2">
                        <span className="grid size-[22px] place-items-center rounded-md bg-subtle">
                          <OrigenIcono icono={origen?.icono ?? null} imagen={origen?.imagen} />
                        </span>
                        {op.origen}
                        {op.formularios > 1 && (
                          <span className="font-normal text-text-3">· {op.formularios} formularios</span>
                        )}
                      </span>
                    ) : (
                      <SinDato />
                    )}
                  </Fila>
                  <Fila icono={Building2} titulo="Interés">
                    {edificios.length ? (
                      edificios.map((e) => (
                        <PildoraEdificio key={e.id} nombre={e.nombre} color={e.color} href={`/edificios/${e.id}`} />
                      ))
                    ) : (
                      <SinDato />
                    )}
                  </Fila>
                  <Fila icono={BedDouble} titulo="Ambientes">
                    {contacto ? (
                      <span role="group" aria-label="Ambientes" className="flex flex-wrap items-center gap-1.5">
                        {opcionesAmbientes.map((n) => {
                          const elegido = op.ambientes.includes(n);
                          return (
                            <button
                              key={n}
                              type="button"
                              aria-pressed={elegido}
                              onClick={() =>
                                void cambiarInteres({
                                  ambientes: elegido ? op.ambientes.filter((a) => a !== n) : [...op.ambientes, n],
                                })
                              }
                              className={cn(
                                "grid h-7 min-w-8 place-items-center rounded-full border px-2 text-[13px] font-semibold transition-colors",
                                elegido
                                  ? "border-brand bg-brand text-brand-fg"
                                  : "border-border bg-card text-text-2 hover:bg-accent"
                              )}
                            >
                              {n}
                            </button>
                          );
                        })}
                      </span>
                    ) : op.ambientes.length ? (
                      op.ambientes.join(" · ")
                    ) : (
                      <SinDato />
                    )}
                  </Fila>
                  {interes && (
                    <Fila icono={DoorOpen} titulo={interes.nombre}>
                      <UnidadesDeInteres
                        interes={interes}
                        ambientes={op.ambientes}
                        edificios={edificios}
                        onGuardar={(ids) => objetos.guardarVinculo(interes.relacion, ids)}
                      />
                    </Fila>
                  )}
                  {otrosVinculos.map((v) => (
                    <Fila key={v.relacion} icono={DoorOpen} titulo={v.nombre}>
                      <VinculoEnLinea vinculo={v} onGuardar={(ids) => objetos.guardarVinculo(v.relacion, ids)} />
                    </Fila>
                  ))}
                  {!interes && !otrosVinculos.length && op.unidad && (
                    <Fila icono={DoorOpen} titulo="Departamento">
                      <span className="inline-block rounded-full border border-border px-2.5 py-0.5 text-[12.5px]">
                        {op.unidad}
                      </span>
                    </Fila>
                  )}
                  <Fila icono={CircleDollarSign} titulo="Valor">
                    {op.valorCents == null ? (
                      <SinDato texto={interes?.valorCalculado ? "Elegí unidades o ambientes" : "Sin cargar"} />
                    ) : (
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        {plata(op.valorCents, op.moneda, moneda)}
                        {interes?.valorCalculado && (conPrecio > 0 || op.ambientes.length > 0) && (
                          <span className="text-[12px] font-normal text-text-3">
                            {conPrecio
                              ? `promedio de ${conPrecio === 1 ? "1 unidad" : `${conPrecio} unidades`}`
                              : `promedio de ${op.ambientes.join(", ")} amb.`}
                          </span>
                        )}
                      </span>
                    )}
                  </Fila>
                </dl>
                <dl className="flex min-w-0 flex-[0_1_340px] flex-col gap-0.5">
                  <Fila icono={CalendarPlus} titulo="Creada">
                    {fecha(op.createdAt, false)}
                  </Fila>
                  <Fila icono={Timer} titulo="En este estado">
                    desde {fechaExacta(op.estadoDesde)}
                  </Fila>
                  <Fila icono={Tag} titulo="Tipo">
                    {op.tipo ? etiqueta(TIPOS_OPORTUNIDAD, op.tipo) : <SinDato />}
                  </Fila>
                  {/* 0050 — Responsable de la oportunidad (define quién la ve). */}
                  <Fila icono={UserRound} titulo="Responsable">
                    <ElegirResponsable oportunidadId={op.id} actual={op.responsableId} onCambio={cargar} />
                  </Fila>
                  {op.cerradaAt && (
                    <Fila icono={Flag} titulo="Cerrada">
                      {fecha(op.cerradaAt, false)}
                    </Fila>
                  )}
                </dl>
              </div>
            </div>
            {enChat && (
              <Link
                href={enChat}
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-brand px-4 text-sm font-semibold text-brand-fg hover:bg-brand-hover"
              >
                <WhatsAppLogo /> Ir al chat
              </Link>
            )}
          </div>

          <BarraDeAvance estado={op.estado} motivo={op.motivoCierre} onCambiar={cambiarEstado} />
          <AvisosDeReglas objetos={objetos} />

          {op.paraCerrar && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-danger-tint px-4 py-3 text-[13.5px] text-danger-text">
              <span>Cumple el umbral de «no responde» de Configuración → Ventas.</span>
              <Button size="sm" variant="outline" onClick={() => void cambiarEstado("perdido", "No responde")}>
                Cerrar como «No responde»
              </Button>
            </div>
          )}
          {error && <p className="mt-2 text-sm text-danger-text">{error}</p>}
        </section>

        {datos.paralelas.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-info-soft bg-info-tint px-4 py-2.5 text-[13.5px] text-info-text">
            <CircleDot className="size-4" />
            <span>También tiene abierta:</span>
            {datos.paralelas.map((p) => (
              <Link
                key={p.id}
                href={`/oportunidades/${p.id}`}
                className="inline-flex items-center gap-2 underline-offset-2 hover:underline"
              >
                <PildoraEdificio nombre={p.edificioNombre ?? p.nombre} color={p.edificioColor} />
                {etiqueta(ESTADOS_OPORTUNIDAD, p.estado)}
              </Link>
            ))}
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
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

            {pestana === "timeline" && (
              <Timeline
                items={datos.timeline}
                anterior={datos.anterior}
                proximos={datos.proximos}
                origenes={origenes}
                oportunidadId={op.id}
                contactId={contacto?.id ?? null}
                onCambio={cargar}
              />
            )}
            {pestana === "reuniones" && <Reuniones reuniones={datos.reuniones} />}
            {pestana === "notas" && <Notas oportunidadId={op.id} notas={datos.notas} onCambio={cargar} />}
            {pestana === "mensajes" && (
              <UltimosMensajes mensajes={datos.mensajes} conversacion={conversacion} enChat={enChat} />
            )}
          </section>

          {/* Tarjetas */}
          <aside className="space-y-4">
            <TarjetaContacto contacto={contacto} />
          </aside>
        </div>
      </div>
    </div>
  );
}

/** Solo un admin la asigna; los demás ven el nombre. */
function ElegirResponsable({
  oportunidadId,
  actual,
  onCambio,
}: {
  oportunidadId: string;
  actual: string | null;
  onCambio: () => void | Promise<void>;
}) {
  const [equipo, setEquipo] = useState<{ userId: string; nombre: string }[] | null>(null);
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    void fetch("/api/oportunidades/responsables")
      .then((r) => (r.ok ? r.json() : { responsables: [] }))
      .then((d: { responsables: { userId: string; nombre: string }[]; admin?: boolean }) => {
        setEquipo(d.responsables);
        setAdmin(d.admin === true);
      })
      .catch(() => setEquipo([]));
  }, []);
  if (!equipo) return <SinDato texto="…" />;
  const inicial = (userId: string) => {
    const n = equipo.find((r) => r.userId === userId)?.nombre;
    return n ? (
      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-brand-soft text-[10px] font-bold text-brand-ink">
        {n.trim()[0]?.toUpperCase()}
      </span>
    ) : null;
  };
  if (!admin) {
    const nombre = equipo.find((r) => r.userId === actual)?.nombre;
    return nombre ? (
      <span className="flex items-center gap-2">
        {actual && inicial(actual)}
        {nombre}
      </span>
    ) : (
      <SinDato texto="Sin responsable" />
    );
  }
  return (
    <Select
      value={actual ?? ""}
      onValueChange={async (v) => {
        await fetch(`/api/oportunidades/${oportunidadId}/responsable`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ userId: v || null }),
        }).catch(() => null);
        await onCambio();
      }}
      iconoDe={inicial}
      className="h-7 w-auto min-w-[150px] rounded-full pl-1 pr-2 text-[13px]"
      aria-label="Responsable"
    >
      <option value="">Sin responsable</option>
      {equipo.map((r) => (
        <option key={r.userId} value={r.userId}>
          {r.nombre}
        </option>
      ))}
    </Select>
  );
}

function SinDato({ texto = "—" }: { texto?: string }) {
  return <span className="font-normal text-text-3">{texto}</span>;
}

/** Una fila del encabezado: ícono gris + etiqueta + valor. */
function Fila({
  icono: Icono,
  titulo,
  children,
}: {
  icono: typeof Phone;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[30px] min-w-0 items-center gap-2.5">
      <dt className="flex w-[112px] shrink-0 items-center gap-2 text-text-3">
        <Icono className="size-4 shrink-0" strokeWidth={1.8} />
        <span className="truncate">{titulo}</span>
      </dt>
      <dd className="flex min-w-0 flex-wrap items-center gap-2 font-medium">{children}</dd>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** La forma de cada flecha: muesca de 14 px; la primera arranca recta y la última termina recta. */
const FLECHA = "[clip-path:polygon(0_0,calc(100%-14px)_0,100%_50%,calc(100%-14px)_100%,0_100%,14px_50%)] pl-6 pr-[18px]";
const PRIMERA = "[clip-path:polygon(0_0,calc(100%-14px)_0,100%_50%,calc(100%-14px)_100%,0_100%)] pl-3 pr-5";
const ULTIMA = "[clip-path:polygon(0_0,100%_0,100%_100%,0_100%,14px_50%)] pl-[22px] pr-3";

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
  const indice = CAMINO_OPORTUNIDAD.indexOf(estado);
  const perdida = estado === "perdido" || estado === "no_calificado";

  return (
    <div className="mt-5">
      {/* En pantallas angostas no se parte: se desplaza. */}
      <ol className="flex gap-1 overflow-x-auto pb-0.5" aria-label="Avance">
        {CAMINO_OPORTUNIDAD.map((paso, i) => {
          const hecho = !perdida && indice >= 0 && i < indice;
          const actual = paso === estado;
          return (
            <li key={paso} className="min-w-[118px] flex-1">
              <button
                type="button"
                onClick={() => void onCambiar(paso)}
                disabled={actual}
                aria-current={actual ? "step" : undefined}
                className={cn(
                  "flex h-10 w-full items-center justify-center gap-1.5 rounded-[10px] text-[13.5px] font-medium transition-colors",
                  i === 0 ? PRIMERA : FLECHA,
                  actual && "bg-brand font-semibold text-brand-fg",
                  hecho && "bg-brand-tint text-brand-ink hover:bg-brand-soft",
                  !actual && !hecho && "bg-muted text-text-2 hover:bg-accent hover:text-foreground"
                )}
              >
                {(hecho || actual) && <Check className="size-3.5 shrink-0" />}
                <span className="truncate">{etiqueta(ESTADOS_OPORTUNIDAD, paso)}</span>
              </button>
            </li>
          );
        })}
        <li className="min-w-[118px] flex-1">
          <button
            type="button"
            onClick={() => setCerrando((v) => !v)}
            aria-expanded={cerrando}
            className={cn(
              "flex h-10 w-full items-center justify-center gap-1.5 rounded-[10px] text-[13.5px] font-medium transition-colors",
              ULTIMA,
              perdida
                ? "bg-danger-tint font-semibold text-danger-text"
                : "bg-muted text-text-2 hover:bg-accent hover:text-foreground"
            )}
          >
            {perdida ? <X className="size-3.5 shrink-0" /> : <Flag className="size-3.5 shrink-0" />}
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
              {MOTIVOS_CIERRE.map((m) => (
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
  whatsapp: FileText, // se dibuja con el logo de WhatsApp
  reunion: CalendarClock,
  tarea: ClipboardList,
  nota: StickyNote,
  contacto: Phone,
  anterior: History,
};

const ICONO_TAREA: Record<string, typeof Check> = {
  llamada: Phone,
  visita: CalendarClock,
  reunion: CalendarClock,
  correo: Mail,
};

function TituloDeBloque({
  abierto,
  onToggle,
  titulo,
  n,
  children,
}: {
  abierto: boolean;
  onToggle: () => void;
  titulo: string;
  n: number;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 pb-1.5 pt-0.5">
      <button
        type="button"
        aria-expanded={abierto}
        onClick={onToggle}
        className="-ml-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-text-3 hover:bg-accent hover:text-foreground"
      >
        <ChevronDown className={cn("size-3.5 transition-transform", !abierto && "-rotate-90")} />
        {titulo}
        <span className="rounded-full bg-subtle px-[7px] py-px text-[11px] normal-case tracking-normal text-text-2">
          {n}
        </span>
      </button>
      {children}
    </div>
  );
}

function Cuando({ iso }: { iso: string }) {
  return (
    <time dateTime={iso} className="flex shrink-0 flex-col items-end leading-tight">
      <span className="whitespace-nowrap text-[12.5px] font-medium text-text-2">{fechaExacta(iso)}</span>
      <span className="text-[11.5px] text-text-3">{haceCuanto(iso)}</span>
    </time>
  );
}

function Timeline({
  items,
  anterior,
  proximos,
  origenes,
  oportunidadId,
  contactId,
  onCambio,
}: {
  items: ItemTimeline[];
  anterior: OportunidadDetalleDto["anterior"];
  proximos: ProximoPaso[];
  origenes: IconoDeOrigen;
  oportunidadId: string;
  contactId: string | null;
  onCambio: () => Promise<void>;
}) {
  const [verProximos, setVerProximos] = useState(true);
  const [verHistorial, setVerHistorial] = useState(true);
  const [agregando, setAgregando] = useState(false);
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

  return (
    <div className="flex flex-col">
      <TituloDeBloque abierto={verProximos} onToggle={() => setVerProximos((v) => !v)} titulo="Próximos pasos" n={proximos.length}>
        <button
          type="button"
          onClick={() => {
            setVerProximos(true);
            setAgregando((v) => !v);
          }}
          className="inline-flex h-7 items-center gap-1 rounded-full border border-border bg-card px-3 text-[12.5px] font-medium hover:bg-accent"
        >
          <Plus className="size-3.5" /> Agregar tarea
        </button>
      </TituloDeBloque>
      {verProximos && (
        <>
          {agregando && (
            <AgregarTarea
              oportunidadId={oportunidadId}
              contactId={contactId}
              onListo={async () => {
                setAgregando(false);
                await onCambio();
              }}
              onCancelar={() => setAgregando(false)}
            />
          )}
          {error && <p className="mb-2 text-sm text-danger-text">{error}</p>}
          {proximos.length === 0 && !agregando ? (
            <p className="py-2 text-[13px] text-text-3">No hay nada por hacer. Agregá una tarea para el próximo paso.</p>
          ) : (
            <ol className="space-y-1">
              {proximos.map((p) => (
                <ProximoFila key={p.id} paso={p} onMarcar={marcar} />
              ))}
            </ol>
          )}
        </>
      )}

      <div role="separator" aria-label="Hoy" className="flex items-center gap-2.5 py-2.5">
        <span className="h-px flex-1 bg-border-strong" />
        <span className="rounded-full bg-foreground px-3 py-[3px] text-[12px] font-semibold text-background">
          Hoy · {hoyLargo()}
        </span>
        <span className="h-px flex-1 bg-border-strong" />
      </div>

      <TituloDeBloque
        abierto={verHistorial}
        onToggle={() => setVerHistorial((v) => !v)}
        titulo="Historial"
        n={items.length}
      />
      {verHistorial &&
        (!items.length && !anterior ? (
          <p className="py-6 text-center text-sm text-text-3">Todavía no hay nada para mostrar.</p>
        ) : (
          <ol className="space-y-1">
            {items.map((it) => (
              <HistorialFila key={it.id} item={it} origenes={origenes} />
            ))}
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
                  <Link
                    href={`/oportunidades/${anterior.id}`}
                    className="text-[12.5px] font-medium text-brand-ink hover:underline"
                  >
                    Ver esa oportunidad →
                  </Link>
                </div>
              </li>
            )}
          </ol>
        ))}
    </div>
  );
}

function ProximoFila({
  paso,
  onMarcar,
}: {
  paso: ProximoPaso;
  onMarcar: (t: TareaCorta, estado: "listo" | "no_responde") => Promise<void>;
}) {
  const esTarea = paso.clase === "tarea";
  const Icono = esTarea ? ICONO_TAREA[paso.tarea.tipo] : CalendarClock;
  const titulo = esTarea ? paso.tarea.titulo : "Reunión";
  const detalle = esTarea
    ? [etiqueta(TIPOS_TAREA, paso.tarea.tipo), paso.at ? fecha(paso.at) : "sin fecha"].join(" · ")
    : [
        `${paso.reunion.durationMinutes} min`,
        paso.reunion.source === "ai" ? "la agendó el agente" : null,
        fecha(paso.reunion.scheduledAt),
      ]
        .filter(Boolean)
        .join(" · ");
  return (
    <li className="flex gap-3 border-b border-border py-3 last:border-0">
      <span className="grid size-9 shrink-0 place-items-center rounded-full border-[1.5px] border-dashed border-brand bg-card text-brand-ink">
        {esTarea && paso.tarea.tipo === "mensaje" ? (
          <WhatsAppLogo />
        ) : Icono ? (
          <Icono className="size-4" />
        ) : (
          <ClipboardList className="size-4" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <p className="text-[14px] font-semibold">{titulo}</p>
          {paso.at && (
            <time dateTime={paso.at} className="text-[12px] font-semibold text-brand-ink">
              {cuandoFalta(paso.at)}
            </time>
          )}
        </div>
        <p className="mt-0.5 text-[12px] text-text-3">{detalle}</p>
        {esTarea && (
          <div className="mt-1.5 flex gap-1.5">
            <button
              type="button"
              onClick={() => void onMarcar(paso.tarea, "listo")}
              className="inline-flex h-[26px] items-center gap-1 rounded-full border border-border bg-card px-2.5 text-[12px] font-medium text-text-2 hover:bg-accent hover:text-foreground"
            >
              <Check className="size-3.5" /> Hecha
            </button>
            <button
              type="button"
              onClick={() => void onMarcar(paso.tarea, "no_responde")}
              title="La hice y no respondió (cuenta como intento)"
              className="h-[26px] rounded-full px-2.5 text-[12px] text-text-3 hover:bg-accent hover:text-foreground"
            >
              No respondió
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

function HistorialFila({ item: it, origenes }: { item: ItemTimeline; origenes: IconoDeOrigen }) {
  const Icono = ICONOS[it.icono];
  const deOrigen = it.icono === "formulario" && it.origen ? origenes.get(it.origen) : undefined;
  return (
    <li className="flex gap-3 border-b border-border py-3 last:border-0">
      <span
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-full",
          it.tono === "ok" && "bg-success-tint text-success-text",
          it.tono === "malo" && "bg-danger-tint text-danger-text",
          (!it.tono || it.tono === "neutro") && it.icono === "whatsapp" && "bg-brand-tint text-brand-ink",
          (!it.tono || it.tono === "neutro") && it.icono !== "whatsapp" && "bg-subtle text-text-2"
        )}
      >
        {it.icono === "whatsapp" ? (
          <WhatsAppLogo />
        ) : deOrigen ? (
          <OrigenIcono icono={deOrigen.icono} imagen={deOrigen.imagen} />
        ) : (
          <Icono className="size-4" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <p className="min-w-0 text-[14px] font-semibold">{it.titulo}</p>
          <Cuando iso={it.at} />
        </div>
        {it.detalle && (
          <p className="mt-0.5 whitespace-pre-wrap break-words text-[13.5px] text-text-2">{it.detalle}</p>
        )}
        {it.quien && <p className="mt-0.5 text-[12px] text-text-3">{it.quien}</p>}
      </div>
    </li>
  );
}

function AgregarTarea({
  oportunidadId,
  contactId,
  onListo,
  onCancelar,
}: {
  oportunidadId: string;
  contactId: string | null;
  onListo: () => Promise<void>;
  onCancelar: () => void;
}) {
  const [titulo, setTitulo] = useState("");
  const [tipo, setTipo] = useState<string>("llamada");
  const [fechaNueva, setFechaNueva] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function agregar() {
    if (!titulo.trim()) return;
    setError(null);
    const res = await fetch("/api/tareas", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ titulo, tipo, fecha: fechaNueva || null, oportunidadId, contactId }),
    }).catch(() => null);
    if (!res?.ok) {
      setError(await mensajeError(res));
      return;
    }
    await onListo();
  }

  return (
    <div className="mb-2 space-y-2 rounded-2xl bg-subtle p-3">
      <input
        autoFocus
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void agregar();
        }}
        placeholder="Qué hay que hacer"
        aria-label="Título de la tarea"
        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
      />
      <div className="flex flex-wrap gap-2">
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
      {error && <p className="text-sm text-danger-text">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" onClick={() => void agregar()} disabled={!titulo.trim()}>
          Agregar tarea
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancelar}>
          Cancelar
        </Button>
      </div>
    </div>
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
          {r.durationMinutes} min{r.source === "ai" ? " · la agendó el agente" : ""}
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
            <WhatsAppLogo /> Ir al chat
          </Link>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */

/** El contacto, plegado: avatar, nombre, tipo y desde cuándo. Abierto suma teléfono, correo y anuncio. */
function TarjetaContacto({ contacto }: { contacto: OportunidadDetalleDto["contacto"] }) {
  const [abierto, setAbierto] = useState(false);
  if (!contacto) {
    return (
      <section className={cn(TARJETA, "p-5")}>
        <h2 className="mb-1 text-[15px] font-semibold">Contacto</h2>
        <p className="text-sm text-text-3">Sin contacto asociado.</p>
      </section>
    );
  }
  return (
    <section className={cn(TARJETA, "p-2")}>
      <h2 className="text-[15px] font-semibold">
        <button
          type="button"
          aria-expanded={abierto}
          onClick={() => setAbierto((v) => !v)}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13.5px] hover:bg-accent"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-subtle text-text-2">
            <UserRound className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{contacto.nombre}</span>
            <span className="block text-[12px] font-normal text-text-3">
              {contacto.tipoContacto ? etiqueta(TIPOS_CONTACTO, contacto.tipoContacto) : "Sin clasificar"}
              {` · desde ${fecha(contacto.creadoAt, false)}`}
            </span>
          </span>
          <ChevronDown className={cn("size-4 shrink-0 text-text-3 transition-transform", abierto && "rotate-180")} />
        </button>
      </h2>
      {abierto && (
        <div className="mt-1 space-y-3 border-t border-border px-3 pb-3 pt-2 text-[13.5px]">
          <Campo icono={Phone} titulo="Teléfono">
            {contacto.telefono ? formatearTelefono(contacto.telefono) : "—"}
          </Campo>
          <Campo icono={Mail} titulo="Correo">
            {contacto.email ?? "—"}
          </Campo>
          {contacto.anuncio && (
            <Campo icono={Megaphone} titulo="Anuncio">
              {contacto.anuncio.url ? (
                <a href={contacto.anuncio.url} target="_blank" rel="noreferrer" className="text-brand-ink hover:underline">
                  {contacto.anuncio.titulo ?? "Ver anuncio"}
                </a>
              ) : (
                (contacto.anuncio.titulo ?? "De un anuncio")
              )}
            </Campo>
          )}
          <Link
            href={`/contacts/${contacto.id}`}
            className="flex h-8 w-full items-center justify-center gap-1.5 rounded-full border border-border text-[12.5px] font-medium hover:bg-accent"
          >
            <UserRound className="size-3.5" /> Ver contacto completo
          </Link>
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
