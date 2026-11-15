"use client";

import { ChevronLeft, ChevronRight, ExternalLink, StickyNote, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useAvisoGuardado } from "@/components/ui/aviso-guardado";
import { useVocabulario } from "@/components/vocabulario";
import { Acciones, Campo, EstadoPill, Ficha, grilla } from "@/components/ventas/ui";
import { aMinutos, fechaCorta, sentar, sumarDias, type LugarEnSalon } from "@/lib/reservas";
import { ESTADOS_ABIERTOS } from "@/lib/ventas";
import { enFrase, nombreEstado, opcionesEstado } from "@/lib/vocabulario";
import { cn } from "@/lib/utils";

/**
 * 071 — Vista Mosaico de Reservas: el salón de un día, horario por horario.
 * Cada sector muestra sus mesas; las reservas se sientan en orden de llegada
 * (no hay mesas con nombre: se reserva cupo) y debajo de cada una va quién
 * reservó. Tocar una mesa libre abre la carga con ese horario, sector y
 * tamaño; tocar una reserva abre sus acciones (Llegó, No vino, Cancelada,
 * cambiar de sector).
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
  nombre: string;
  telefono: string;
  hora: string;
  sector: string;
  personas: string;
  observaciones: string;
};

/** Las que ocupan mesa: Confirmada (abiertas) y Llegó. */
const OCUPA = new Set<string>([...ESTADOS_ABIERTOS, "compro"]);
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
  const [cancelando, setCancelando] = useState<string | null>(null);
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
    setForm({ nombre: "", telefono: "", hora: hora ?? "", sector: CUALQUIERA, personas: "2", observaciones: "" });
    // Solo cuando se pide de nuevo, no cuando cambia el horario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nuevaPedida]);

  const irA = (fecha: string) => {
    setElegida(null);
    setCancelando(null);
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
    { titulo: "Llegaron", valor: delDia.filter((r) => r.estado === "compro").length, tono: "text-success-text" },
    {
      titulo: hora ? `Mesas libres a las ${hora}` : "Mesas libres",
      valor: salon.reduce((a, s) => a + s.libres, 0),
    },
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
    setCancelando(null);
    setElegida(null);
    avisar(`${r.nombre}: ${nombreEstado(voc, estado)}`);
    await cargar(dia?.fecha ?? null);
  }

  async function moverSector(r: Reserva, sector: string) {
    const res = await fetch(`/api/reservas/${r.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sector }),
    }).catch(() => null);
    if (!res?.ok) {
      const d = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
      avisar(d?.error?.message ?? "No se pudo mover", "error");
    } else avisar(`${r.nombre} pasó a ${sector}`);
    await cargar(dia?.fecha ?? null);
  }

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    if (!form || !dia) return;
    setError(null);
    const res = await fetch("/api/reservas", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        nombre: form.nombre,
        telefono: form.telefono || null,
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
                  setCancelando(null);
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
        <Ficha titulo={`Nueva ${singular} · ${fechaCorta(dia.fecha)}`}>
          <form onSubmit={(e) => void crear(e)} className={grilla}>
            <Campo label="A nombre de">
              <Input
                required
                autoFocus
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              />
            </Campo>
            <Campo label="Teléfono (opcional)">
              <Input
                value={form.telefono}
                inputMode="tel"
                placeholder="11 2345 6789"
                onChange={(e) => setForm({ ...form, telefono: e.target.value })}
              />
            </Campo>
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
            <Campo label="Observaciones">
              <Input
                value={form.observaciones}
                placeholder="Cumpleaños, silla de bebé…"
                onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
              />
            </Campo>
            <Acciones error={error}>
              <Button type="submit" size="sm" disabled={!form.hora}>
                Guardar
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setForm(null)}>
                Cancelar
              </Button>
            </Acciones>
          </form>
        </Ficha>
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
          const abierta = s.lugares.find(
            (l): l is Extract<LugarEnSalon<Reserva>, { tipo: "reserva" }> =>
              l.tipo === "reserva" && l.reserva.id === elegida
          )?.reserva;
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
                    <button
                      key={`libre-${i}`}
                      type="button"
                      aria-label={`Mesa de ${l.capacidad} libre en ${s.sector}`}
                      onClick={() => {
                        setElegida(null);
                        setError(null);
                        setForm({
                          nombre: "",
                          telefono: "",
                          hora: horario.hora,
                          sector: s.sector,
                          personas: String(l.capacidad),
                          observaciones: "",
                        });
                      }}
                      className="group flex w-[112px] flex-col items-center gap-2 rounded-lg p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      <Mesas capacidades={[l.capacidad]} tono="libre" />
                      <span className="text-[12px] text-text-3 group-hover:text-text-2">Libre</span>
                    </button>
                  ) : (
                    <button
                      key={l.reserva.id}
                      type="button"
                      aria-label={`${l.reserva.nombre}, ${l.reserva.personas} personas`}
                      aria-pressed={elegida === l.reserva.id}
                      onClick={() => {
                        setCancelando(null);
                        setElegida(elegida === l.reserva.id ? null : l.reserva.id);
                      }}
                      className={cn(
                        "flex flex-col items-center gap-2 rounded-lg p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                        l.mesas.length > 1 ? "w-[164px]" : "w-[112px]",
                        elegida === l.reserva.id && "bg-subtle"
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
                        {l.reserva.observaciones && (
                          <StickyNote className="mx-auto mt-0.5 size-3 text-text-3" aria-label="Tiene observaciones" />
                        )}
                      </span>
                    </button>
                  )
                )}
              </div>

              {abierta && (
                <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border bg-subtle px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{abierta.nombre}</p>
                    <p className="text-[13px] text-text-3">
                      {abierta.personas} persona{abierta.personas === 1 ? "" : "s"} ·{" "}
                      {abierta.mesas.map((m) => `mesa de ${m.capacidad}`).join(" + ")}
                      {abierta.telefono && ` · ${abierta.telefono}`}
                      {abierta.canal === "whatsapp" && " · por WhatsApp"}
                    </p>
                    {abierta.observaciones && <p className="text-[13px] text-text-2">{abierta.observaciones}</p>}
                  </div>
                  <EstadoPill opciones={estados} value={abierta.estado} />
                  {dia.sectores.length > 1 && (
                    <Select
                      aria-label={`Sector de ${abierta.nombre}`}
                      value={abierta.sector}
                      onValueChange={(v) => void moverSector(abierta, v)}
                      className="h-8 w-44"
                    >
                      {dia.sectores.map((x) => (
                        <option key={x} value={x}>
                          {x}
                        </option>
                      ))}
                    </Select>
                  )}
                  {cancelando === abierta.id ? (
                    <MotivoDeCancelacion
                      motivos={voc.motivos}
                      etiqueta={nombreEstado(voc, "perdido")}
                      onConfirmar={(motivo) => void cambiarEstado(abierta, "perdido", motivo)}
                      onVolver={() => setCancelando(null)}
                    />
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {abierta.estado !== "compro" && (
                        <>
                          <Button size="sm" onClick={() => void cambiarEstado(abierta, "compro")}>
                            {nombreEstado(voc, "compro")}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => void cambiarEstado(abierta, "no_calificado")}>
                            {nombreEstado(voc, "no_calificado")}
                          </Button>
                        </>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => setCancelando(abierta.id)}>
                        Cancelar {singular}
                      </Button>
                      <Link
                        href={`/oportunidades/${abierta.oportunidadId}`}
                        className={buttonVariants({ size: "sm", variant: "ghost" })}
                      >
                        <ExternalLink className="size-3.5" /> Ver
                      </Link>
                    </div>
                  )}
                  <Button size="sm" variant="ghost" aria-label="Cerrar" onClick={() => setElegida(null)}>
                    <X className="size-4" />
                  </Button>
                </div>
              )}
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

      {horario && (
        <p className="flex flex-wrap gap-4 text-[12px] text-text-3">
          <Leyenda tono="confirmada" texto={nombreEstado(voc, "recibido")} />
          <Leyenda tono="llego" texto={nombreEstado(voc, "compro")} />
          <Leyenda tono="libre" texto="Libre: tocala para cargar una reserva" />
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
