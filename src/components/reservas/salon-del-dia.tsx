"use client";

import { AlertTriangle, Check, ChevronLeft, ChevronRight, ExternalLink, Pencil, Star, StickyNote, X } from "lucide-react";
import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useAvisoGuardado } from "@/components/ui/aviso-guardado";
import { Ventana } from "@/components/ui/ventana";
import { ElegirContacto, type ContactoElegido } from "@/components/reservas/elegir-contacto";
import { useVocabulario } from "@/components/vocabulario";
import { Campo, EstadoPill } from "@/components/ventas/ui";
import { SEGMENTOS, aMinutos, fechaCorta, sentar, sumarDias, type Segmento } from "@/lib/reservas";
import { formatearTelefono } from "@/lib/telefono-formato";
import { ESTADOS_ABIERTOS } from "@/lib/ventas";
import { enFrase, nombreEstado, opcionesEstado } from "@/lib/vocabulario";
import { cn } from "@/lib/utils";

/**
 * 071 — Vista Mosaico de Reservas: el salón de un día, horario por horario.
 * Cada sector muestra sus mesas; las reservas se sientan en orden de llegada
 * (no hay mesas con nombre: se reserva cupo) y debajo de cada una va quién
 * reservó. Las mesas libres son solo dibujo. Tocar una reserva la abre en
 * una ventana con sus datos y acciones (Asistió, No vino, Cancelada); el
 * sector se cambia con Editar. «Nueva reserva» también abre una ventana.
 */

type Reserva = {
  id: string;
  oportunidadId: string;
  nombre: string;
  telefono: string | null;
  personas: number;
  sector: string;
  mesas: { capacidad: number }[];
  estado: string;
  canal: string;
  observaciones: string | null;
  notas: string | null;
  persona: { segmento: Segmento; visitasAntes: number; noVinoAntes: number };
};
type Horario = { hora: string; configurado: boolean; personas: number; reservas: Reserva[] };
type Dia = {
  fecha: string;
  hoy: string;
  ahora: string;
  duracionMinutos: number;
  cerrado: string | null;
  sectores: string[];
  mesas: { sector: string; capacidad: number; cantidad: number }[];
  horarios: Horario[];
};
type Formulario = {
  contacto: ContactoElegido | null;
  hora: string;
  sector: string;
  personas: string;
  observaciones: string;
};

/** Las que ocupan mesa: Confirmada (abiertas) y Llegó. */
const OCUPA = new Set<string>([...ESTADOS_ABIERTOS, "compro"]);
const ESTADOS_ABIERTOS_SET = new Set<string>(ESTADOS_ABIERTOS);
const CUALQUIERA = "";

/** El horario que conviene ver: el que está en curso o el próximo; si ya pasaron todos, el último. */
function horarioDeEntrada(dia: Dia): string | null {
  const horas = dia.horarios.map((h) => h.hora);
  if (!horas.length) return null;
  if (dia.fecha !== dia.hoy) return horas[0]!;
  const ahora = aMinutos(dia.ahora);
  return horas.find((h) => aMinutos(h) + dia.duracionMinutos > ahora) ?? horas.at(-1)!;
}

export function SalonDelDia({ nuevaPedida }: { nuevaPedida: number }) {
  const voc = useVocabulario();
  const avisar = useAvisoGuardado();
  const [dia, setDia] = useState<Dia | null>(null);
  const [hora, setHora] = useState<string | null>(null);
  const [elegida, setElegida] = useState<string | null>(null);
  const [form, setForm] = useState<Formulario | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async (fecha: string | null, conservarHora = true) => {
    const res = await fetch(`/api/reservas/dia${fecha ? `?fecha=${fecha}` : ""}`).catch(() => null);
    if (!res?.ok) return;
    const d = (await res.json()) as Dia;
    setDia(d);
    setHora((h) => (conservarHora && h && d.horarios.some((x) => x.hora === h) ? h : horarioDeEntrada(d)));
  }, []);

  useEffect(() => {
    void cargar(null, false);
  }, [cargar]);

  // Se refresca solo cada minuto: entran reservas por WhatsApp con la pantalla abierta.
  useEffect(() => {
    const t = setInterval(() => void cargar(dia?.fecha ?? null), 60_000);
    return () => clearInterval(t);
  }, [cargar, dia?.fecha]);

  // El botón «Nueva reserva» de la página.
  useEffect(() => {
    if (!nuevaPedida) return;
    setError(null);
    setForm({ contacto: null, hora: hora ?? "", sector: CUALQUIERA, personas: "2", observaciones: "" });
    // Solo cuando se pide de nuevo, no cuando cambia el horario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nuevaPedida]);

  // Si se abrió la carga antes de que llegara el día, toma el horario en cuanto llega.
  useEffect(() => {
    if (hora) setForm((f) => (f && !f.hora ? { ...f, hora } : f));
  }, [hora]);

  const irA = (fecha: string) => {
    setElegida(null);
    void cargar(fecha, false);
  };

  const horario = dia?.horarios.find((h) => h.hora === hora) ?? null;
  const salon = useMemo(() => {
    if (!dia || !horario) return [];
    return sentar(
      dia.mesas,
      horario.reservas.filter((r) => OCUPA.has(r.estado)),
      dia.sectores
    );
  }, [dia, horario]);

  const delDia = dia?.horarios.flatMap((h) => h.reservas) ?? [];
  const ocupanDelDia = delDia.filter((r) => OCUPA.has(r.estado));
  const contadores = [
    { titulo: voc.plural, valor: ocupanDelDia.length },
    { titulo: "Personas", valor: ocupanDelDia.reduce((a, r) => a + r.personas, 0) },
    { titulo: nombreEstado(voc, "compro"), valor: delDia.filter((r) => r.estado === "compro").length, tono: "text-success-text" },
    // Las confirmadas que todavía no llegaron.
    { titulo: "Por asistir", valor: delDia.filter((r) => ESTADOS_ABIERTOS_SET.has(r.estado)).length },
  ];

  async function cambiarEstado(r: Reserva, estado: string, motivoCierre?: string) {
    const res = await fetch(`/api/oportunidades/${r.oportunidadId}/estado`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ estado, motivoCierre: motivoCierre ?? null }),
    }).catch(() => null);
    if (!res?.ok) {
      const d = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
      avisar(d?.error?.message ?? "No se pudo cambiar", "error");
      return;
    }
    setElegida(null);
    avisar(`${r.nombre}: ${nombreEstado(voc, estado)}`);
    await cargar(dia?.fecha ?? null);
  }

  async function moverSector(r: Reserva, sector: string): Promise<boolean> {
    const res = await fetch(`/api/reservas/${r.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sector }),
    }).catch(() => null);
    if (!res?.ok) {
      const d = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
      avisar(d?.error?.message ?? "No se pudo mover", "error");
      return false;
    }
    avisar(`${r.nombre} pasó a ${sector}`);
    await cargar(dia?.fecha ?? null);
    return true;
  }

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    if (!form || !dia) return;
    setError(null);
    if (!form.contacto) {
      setError("Elegí el contacto o creá uno nuevo");
      return;
    }
    const res = await fetch("/api/reservas", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        nombre: form.contacto.name,
        contactId: form.contacto.id,
        fecha: dia.fecha,
        hora: form.hora,
        personas: Number(form.personas),
        sector: form.sector || null,
        observaciones: form.observaciones || null,
        forzarHorario: true,
      }),
    }).catch(() => null);
    if (!res?.ok) {
      const d = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(d?.error?.message ?? "No se pudo guardar");
      return;
    }
    setForm(null);
    setHora(form.hora);
    avisar(`${voc.singular} creada`);
    await cargar(dia.fecha);
  }

  const singular = enFrase(voc.singular);
  const estados = opcionesEstado(voc);
  const sinMesa = horario?.reservas.filter((r) => !OCUPA.has(r.estado)) ?? [];

  if (!dia) return <p className="text-sm text-text-3">Cargando…</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" aria-label="Día anterior" onClick={() => irA(sumarDias(dia.fecha, -1))}>
            <ChevronLeft className="size-4" />
          </Button>
          <Input
            type="date"
            aria-label="Fecha"
            value={dia.fecha}
            onChange={(e) => e.target.value && irA(e.target.value)}
            className="h-9 w-40"
          />
          <Button variant="outline" size="sm" aria-label="Día siguiente" onClick={() => irA(sumarDias(dia.fecha, 1))}>
            <ChevronRight className="size-4" />
          </Button>
          <span className="text-sm font-medium">
            {dia.fecha === dia.hoy ? "Hoy, " : ""}
            {fechaCorta(dia.fecha)}
          </span>
          {dia.fecha !== dia.hoy && (
            <Button variant="ghost" size="sm" onClick={() => irA(dia.hoy)}>
              Volver a hoy
            </Button>
          )}
        </div>
        {dia.horarios.length > 0 && (
          <div role="tablist" aria-label="Horario" className="inline-flex gap-0.5 rounded-full bg-muted p-[3px]">
            {dia.horarios.map((h) => (
              <button
                key={h.hora}
                type="button"
                role="tab"
                aria-selected={h.hora === hora}
                onClick={() => {
                  setHora(h.hora);
                  setElegida(null);
                              }}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium tabular-nums transition-colors",
                  h.hora === hora ? "bg-card text-foreground shadow-sm" : "text-text-2 hover:text-foreground"
                )}
              >
                {h.hora}
                <span className="text-[11px] font-normal text-text-3">{h.personas}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {contadores.map((c) => (
          <div key={c.titulo} className="rounded-lg bg-subtle px-4 py-3">
            <p className="text-[12px] text-text-3">{c.titulo}</p>
            <p className={cn("text-2xl font-bold tabular-nums", c.tono)}>{c.valor}</p>
          </div>
        ))}
      </div>

      {dia.cerrado && (
        <p className="rounded-lg bg-warning-tint px-3 py-2 text-sm text-warning-text">
          Día cerrado: {dia.cerrado}. No se toman {enFrase(voc.plural)}.
        </p>
      )}

      {form && (
        <Ventana titulo={`Nueva ${singular}`} detalle={fechaCorta(dia.fecha)} onCerrar={() => setForm(null)}>
          <form onSubmit={(e) => void crear(e)} className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <span className="text-[12px] font-semibold text-text-2">Contacto</span>
              <ElegirContacto value={form.contacto} onChange={(c) => setForm({ ...form, contacto: c })} />
            </div>
            <Campo label="Personas">
              <Input
                type="number"
                min={1}
                required
                value={form.personas}
                onChange={(e) => setForm({ ...form, personas: e.target.value })}
              />
            </Campo>
            <Campo label="Horario">
              <Select value={form.hora} onValueChange={(v) => setForm({ ...form, hora: v })}>
                {dia.horarios.map((h) => (
                  <option key={h.hora} value={h.hora}>
                    {h.hora}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo label="Sector">
              <Select value={form.sector} onValueChange={(v) => setForm({ ...form, sector: v })}>
                <option value={CUALQUIERA}>Donde haya lugar</option>
                {dia.sectores.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo label="Observaciones" className="sm:col-span-2">
              <Input
                value={form.observaciones}
                placeholder="Cumpleaños, silla de bebé…"
                onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
              />
            </Campo>
            {error && <p className="text-sm text-danger-text sm:col-span-2">{error}</p>}
            <div className="mt-2 flex gap-2 sm:col-span-2">
              <Button type="submit" size="sm" disabled={!form.hora}>
                Guardar
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setForm(null)}>
                Cancelar
              </Button>
            </div>
          </form>
        </Ventana>
      )}

      {dia.horarios.length === 0 && (
        <p className="text-sm text-text-3">
          Ese día no hay horarios de {singular}. Se configuran en{" "}
          <Link href="/settings/reservas" className="font-medium underline">
            Configuración → Reservas
          </Link>
          .
        </p>
      )}
      {horario && salon.length === 0 && (
        <p className="text-sm text-text-3">
          Todavía no hay mesas cargadas. Se cargan en{" "}
          <Link href="/settings/reservas" className="font-medium underline">
            Configuración → Reservas
          </Link>
          .
        </p>
      )}

      {horario &&
        salon.map((s) => {
          return (
            <section
              key={s.sector}
              aria-label={`Sector ${s.sector}`}
              className="rounded-xl border bg-card px-4 py-4 shadow-sm sm:px-5"
            >
              <header className="mb-4 flex items-baseline justify-between gap-3">
                <h3 className="font-semibold">{s.sector}</h3>
                <span className="text-[12px] text-text-3">
                  {s.libres === 0
                    ? "Sin mesas libres"
                    : `${s.libres} mesa${s.libres === 1 ? "" : "s"} libre${s.libres === 1 ? "" : "s"} de ${s.total}`}
                </span>
              </header>
              <div className="flex flex-wrap gap-x-5 gap-y-6">
                {s.lugares.map((l, i) =>
                  l.tipo === "libre" ? (
                    <div
                      key={`libre-${i}`}
                      role="img"
                      aria-label={`Mesa de ${l.capacidad} libre en ${s.sector}`}
                      className="flex w-[112px] flex-col items-center gap-2 p-1"
                    >
                      <Mesas capacidades={[l.capacidad]} tono="libre" />
                      <span className="text-[12px] text-text-3">Libre</span>
                    </div>
                  ) : (
                    <button
                      key={l.reserva.id}
                      type="button"
                      aria-label={`${l.reserva.nombre}, ${l.reserva.personas} personas`}
                      aria-haspopup="dialog"
                      onClick={() => setElegida(l.reserva.id)}
                      className={cn(
                        "flex flex-col items-center gap-2 rounded-lg p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                        "hover:bg-subtle",
                        l.mesas.length > 1 ? "w-[164px]" : "w-[112px]"
                      )}
                    >
                      <Mesas
                        capacidades={l.mesas}
                        tono={l.reserva.estado === "compro" ? "llego" : "confirmada"}
                        alerta={l.sobrecupo}
                      />
                      <span className="w-full text-center text-[12px] leading-tight">
                        <span className="block truncate font-semibold text-foreground">{l.reserva.nombre}</span>
                        <span className="text-text-3">
                          {l.reserva.personas} persona{l.reserva.personas === 1 ? "" : "s"}
                          {l.reserva.estado === "compro" && ` · ${nombreEstado(voc, "compro").toLowerCase()}`}
                          {l.sobrecupo && " · sin mesa"}
                        </span>
                        <Senales r={l.reserva} />
                      </span>
                    </button>
                  )
                )}
              </div>

            </section>
          );
        })}

      {sinMesa.length > 0 && (
        <section aria-label="Sin mesa" className="rounded-xl border px-4 py-3 sm:px-5">
          <p className="mb-2 text-[13px] font-medium text-text-2">No ocupan mesa a las {hora}</p>
          <ul className="flex flex-wrap gap-2">
            {sinMesa.map((r) => (
              <li key={r.id} className="flex items-center gap-2 rounded-full bg-subtle py-1 pl-3 pr-1 text-[13px]">
                <Link href={`/oportunidades/${r.oportunidadId}`} className="hover:underline">
                  {r.nombre} · {r.personas}
                </Link>
                <EstadoPill opciones={estados} value={r.estado} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {elegida && horario && (() => {
        const abierta = horario.reservas.find((x) => x.id === elegida);
        return abierta ? (
          <VentanaDeReserva
            reserva={abierta}
            fecha={dia.fecha}
            hora={horario.hora}
            sectores={dia.sectores}
            onCerrar={() => setElegida(null)}
            onEstado={(estado, motivo) => cambiarEstado(abierta, estado, motivo)}
            onSector={(sector) => moverSector(abierta, sector)}
          />
        ) : null;
      })()}

      {horario && (
        <p className="flex flex-wrap gap-4 text-[12px] text-text-3">
          <Leyenda tono="confirmada" texto={nombreEstado(voc, "recibido")} />
          <Leyenda tono="llego" texto={nombreEstado(voc, "compro")} />
          <Leyenda tono="libre" texto="Libre" />
          <span>Las reservas no tienen mesa fija: se sientan en orden de llegada.</span>
        </p>
      )}
    </div>
  );
}

type Tono = "libre" | "confirmada" | "llego";

const TONOS: Record<Tono, string> = {
  libre: "border border-dashed border-border-strong text-text-3",
  confirmada: "border border-brand/40 bg-brand-tint text-brand-ink",
  llego: "border border-success-text/40 bg-success-tint text-success-text",
};

/** Una mesa (o dos juntas) vista desde arriba, con sus sillas. */
function Mesas({ capacidades, tono, alerta = false }: { capacidades: number[]; tono: Tono; alerta?: boolean }) {
  return (
    <span className="flex items-center gap-[3px] py-3" aria-hidden="true">
      {capacidades.map((cap, i) => {
        const porLado = Math.max(1, Math.ceil(cap / 2));
        const ancho = Math.max(52, porLado * 26 + 20);
        const primera = i === 0;
        const ultima = i === capacidades.length - 1;
        return (
          <span
            key={i}
            style={{ width: ancho }}
            className={cn(
              "relative flex h-[52px] items-center justify-center text-[13px] font-semibold",
              TONOS[tono],
              alerta && "border-danger-text",
              primera && "rounded-l-lg",
              ultima && "rounded-r-lg"
            )}
          >
            {cap}
            {(["-top-[11px]", "-bottom-[11px]"] as const).map((lado, k) => (
              <span key={lado} className={cn("absolute inset-x-0 flex justify-evenly px-1", lado)}>
                {Array.from({ length: k === 0 ? porLado : Math.max(1, cap - porLado) }, (_, j) => (
                  <span key={j} className="h-[6px] w-4 rounded-full bg-text-3 opacity-35" />
                ))}
              </span>
            ))}
          </span>
        );
      })}
    </span>
  );
}

function Leyenda({ tono, texto }: { tono: Tono; texto: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("inline-block size-3 rounded-[3px]", TONOS[tono])} />
      {texto}
    </span>
  );
}

function MotivoDeCancelacion({
  motivos,
  etiqueta,
  onConfirmar,
  onVolver,
}: {
  motivos: string[];
  etiqueta: string;
  onConfirmar: (motivo: string | undefined) => void;
  onVolver: () => void;
}) {
  const [motivo, setMotivo] = useState(motivos[0] ?? "");
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {motivos.length > 0 && (
        <Select aria-label="Motivo" value={motivo} onValueChange={setMotivo} className="h-8 w-48">
          {motivos.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </Select>
      )}
      <Button size="sm" variant="destructive" onClick={() => onConfirmar(motivo || undefined)}>
        {etiqueta}
      </Button>
      <Button size="sm" variant="ghost" onClick={onVolver}>
        Volver
      </Button>
    </div>
  );
}

/**
 * La reserva en una ventana: arriba hora, personas y mesas en grande; abajo
 * teléfono, cómo llegó, quién es y sus notas; y Asistió o No vino a mano. El
 * sector y la cancelación quedan detrás de Editar (lápiz).
 */
function VentanaDeReserva({
  reserva: r,
  fecha,
  hora,
  sectores,
  onCerrar,
  onEstado,
  onSector,
}: {
  reserva: Reserva;
  fecha: string;
  hora: string;
  sectores: string[];
  onCerrar: () => void;
  onEstado: (estado: string, motivo?: string) => Promise<void>;
  onSector: (sector: string) => Promise<boolean>;
}) {
  const voc = useVocabulario();
  const [editando, setEditando] = useState(false);
  const [sector, setSector] = useState(r.sector);
  const [cancelando, setCancelando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const abierta = OCUPA.has(r.estado);
  const porAsistir = ESTADOS_ABIERTOS_SET.has(r.estado);

  async function guardarSector() {
    if (sector === r.sector) return setEditando(false);
    setOcupado(true);
    const ok = await onSector(sector);
    setOcupado(false);
    if (ok) setEditando(false);
  }

  const llegoPor: Record<string, string> = { whatsapp: "WhatsApp", telefono: "Teléfono", manual: "Carga manual" };
  const visitas = r.persona.visitasAntes;
  const filas: [string, React.ReactNode][] = [
    ...(r.telefono ? [["Teléfono", formatearTelefono(r.telefono)] as [string, React.ReactNode]] : []),
    ["Llegó por", llegoPor[r.canal] ?? r.canal],
    [
      "Persona",
      <span key="persona">
        {SEGMENTOS.find((x) => x.value === r.persona.segmento)?.label}
        <span className="font-normal text-text-3">
          {visitas === 0 ? " · primera vez" : ` · vino ${visitas} ${visitas === 1 ? "vez" : "veces"}`}
        </span>
      </span>,
    ],
    ...(r.persona.noVinoAntes > 0
      ? [
          [
            "Faltó",
            <span key="falto" className="text-warning-text">
              {r.persona.noVinoAntes} {r.persona.noVinoAntes === 1 ? "vez" : "veces"} sin avisar
            </span>,
          ] as [string, React.ReactNode],
        ]
      : []),
    ...(r.notas ? [["Notas", r.notas] as [string, React.ReactNode]] : []),
  ];

  const tarjetas: { titulo: string; valor: string; detalle: string }[] = [
    { titulo: "Hora", valor: hora, detalle: fechaCorta(fecha) },
    { titulo: "Personas", valor: String(r.personas), detalle: r.observaciones ?? "" },
    { titulo: "Mesas", valor: r.mesas.map((m) => m.capacidad).join(" + "), detalle: r.sector },
  ];

  return (
    <Ventana
      titulo={<span className="text-[20px]">{r.nombre}</span>}
      detalle={<EstadoPill opciones={opcionesEstado(voc)} value={r.estado} />}
      accion={
        abierta && !editando ? (
          <Button size="sm" variant="ghost" onClick={() => setEditando(true)}>
            <Pencil className="size-3.5" /> Editar
          </Button>
        ) : undefined
      }
      onCerrar={onCerrar}
    >
      <div className="mb-5 grid grid-cols-3 gap-2">
        {tarjetas.map((t) => (
          <div key={t.titulo} className="flex min-w-0 flex-col gap-0.5 rounded-xl bg-subtle px-3.5 py-3">
            <span className="text-[12px] font-semibold text-text-3">{t.titulo}</span>
            <span className="text-[30px] font-bold leading-[1.1] tracking-tight tabular-nums">{t.valor}</span>
            <span className="truncate text-[12px] text-text-3" title={t.detalle}>
              {t.detalle || "\u00a0"}
            </span>
          </div>
        ))}
      </div>

      {editando && (
        <div className="mb-5 space-y-3 rounded-xl border px-3.5 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-16 text-sm text-text-3">Sector</span>
            <Select aria-label="Sector" value={sector} onValueChange={setSector} className="h-8 w-48">
              {sectores.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </Select>
            <Button size="sm" disabled={ocupado} onClick={() => void guardarSector()}>
              Guardar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setSector(r.sector);
                setEditando(false);
                setCancelando(false);
              }}
            >
              Listo
            </Button>
          </div>
          <div className="border-t pt-3">
            {cancelando ? (
              <MotivoDeCancelacion
                motivos={voc.motivos}
                etiqueta={nombreEstado(voc, "perdido")}
                onConfirmar={(motivo) => void onEstado("perdido", motivo)}
                onVolver={() => setCancelando(false)}
              />
            ) : (
              <Button size="sm" variant="ghost" className="text-danger-text" onClick={() => setCancelando(true)}>
                Cancelar {enFrase(voc.singular)}
              </Button>
            )}
          </div>
        </div>
      )}

      <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-2.5 text-[15px]">
        {filas.map(([k, v]) => (
          <Fragment key={k}>
            <dt className="text-text-3">{k}</dt>
            <dd className="font-semibold">{v}</dd>
          </Fragment>
        ))}
      </dl>

      <div className="mt-5 flex flex-wrap items-center gap-2 border-t pt-4">
        {porAsistir && (
          <>
            <button
              type="button"
              onClick={() => void onEstado("compro")}
              className="inline-flex h-10 items-center gap-1.5 rounded-full bg-success-text px-[18px] text-[15px] font-semibold text-white hover:opacity-90"
            >
              <Check className="size-4" strokeWidth={2.5} /> {nombreEstado(voc, "compro")}
            </button>
            <button
              type="button"
              onClick={() => void onEstado("no_calificado")}
              className="inline-flex h-10 items-center gap-1.5 rounded-full bg-danger-text px-[18px] text-[15px] font-semibold text-white hover:opacity-90"
            >
              <X className="size-4" strokeWidth={2.5} /> {nombreEstado(voc, "no_calificado")}
            </button>
          </>
        )}
        <Link
          href={`/oportunidades/${r.oportunidadId}`}
          className={cn(buttonVariants({ size: "sm", variant: "ghost" }), "ml-auto")}
        >
          <ExternalLink className="size-3.5" /> Ver
        </Link>
      </div>
    </Ventana>
  );
}

/** Lo que conviene ver de un vistazo debajo de la mesa: habitual, faltó antes, tiene notas. */
function Senales({ r }: { r: Reserva }) {
  const habitual = r.persona.segmento === "habitual";
  const falto = r.persona.noVinoAntes > 0;
  const notas = !!(r.notas || r.observaciones);
  if (!habitual && !falto && !notas) return null;
  return (
    <span className="mt-1 flex justify-center gap-1.5">
      {habitual && (
        <span title="Habitual" aria-label="Habitual" className="text-warning-text">
          <Star className="size-3.5" />
        </span>
      )}
      {falto && (
        <span
          title={`Faltó ${r.persona.noVinoAntes} ${r.persona.noVinoAntes === 1 ? "vez" : "veces"} sin avisar`}
          aria-label="Faltó antes sin avisar"
          className="text-danger-text"
        >
          <AlertTriangle className="size-3.5" />
        </span>
      )}
      {notas && (
        <span title={[r.notas, r.observaciones].filter(Boolean).join(" · ")} aria-label="Tiene notas" className="text-text-3">
          <StickyNote className="size-3.5" />
        </span>
      )}
    </span>
  );
}
