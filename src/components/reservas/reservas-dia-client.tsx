"use client";

import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useAvisoGuardado } from "@/components/ui/aviso-guardado";
import { useVocabulario } from "@/components/vocabulario";
import { Acciones, Campo, EstadoPill, Ficha, Pagina, grilla } from "@/components/ventas/ui";
import { fechaCorta, sumarDias } from "@/lib/reservas";
import { enFrase, nombreEstado, opcionesEstado } from "@/lib/vocabulario";
import { cn } from "@/lib/utils";

/**
 * 071 — «Hoy»: las reservas de un día por horario, con el cupo que queda.
 * Desde acá el equipo marca Llegó, No vino o Cancelada, mueve una reserva de
 * sector y carga a mano las que entran por teléfono (con la misma regla de
 * cupo que el flujo de WhatsApp).
 */

type Reserva = {
  id: string;
  oportunidadId: string;
  contactId: string;
  nombre: string;
  contactoNombre: string;
  telefono: string | null;
  personas: number;
  sector: string;
  mesas: { capacidad: number }[];
  estado: string;
  canal: string;
  observaciones: string | null;
};
type Horario = {
  hora: string;
  configurado: boolean;
  cupo: { capacidad: number; libres: number; total: number }[];
  personas: number;
  reservas: Reserva[];
};
type Dia = { fecha: string; hoy: string; cerrado: string | null; sectores: string[]; horarios: Horario[] };

const VACIA = { nombre: "", telefono: "", hora: "", personas: "2", observaciones: "" };

export function ReservasDiaClient() {
  const voc = useVocabulario();
  const avisar = useAvisoGuardado();
  const [fecha, setFecha] = useState<string | null>(null);
  const [dia, setDia] = useState<Dia | null>(null);
  const [cargando, setCargando] = useState(true);
  const [form, setForm] = useState<typeof VACIA | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelando, setCancelando] = useState<{ id: string; motivo: string } | null>(null);

  const cargar = useCallback(async (f: string | null) => {
    setCargando(true);
    const res = await fetch(`/api/reservas/dia${f ? `?fecha=${f}` : ""}`).catch(() => null);
    setCargando(false);
    if (!res?.ok) return;
    const d = (await res.json()) as Dia;
    setDia(d);
    setFecha(d.fecha);
  }, []);

  useEffect(() => {
    void cargar(null);
  }, [cargar]);

  // Se refresca solo cada minuto: entran reservas por WhatsApp mientras la pantalla está abierta.
  useEffect(() => {
    const t = setInterval(() => void cargar(fecha), 60_000);
    return () => clearInterval(t);
  }, [cargar, fecha]);

  async function cambiarEstado(r: Reserva, estado: string, motivoCierre?: string) {
    const res = await fetch(`/api/oportunidades/${r.oportunidadId}/estado`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ estado, motivoCierre: motivoCierre ?? null }),
    }).catch(() => null);
    if (!res?.ok) {
      const d = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
      avisar(d?.error?.message ?? "No se pudo cambiar");
      return;
    }
    setCancelando(null);
    avisar(`${r.nombre}: ${nombreEstado(voc, estado)}`);
    await cargar(fecha);
  }

  async function moverSector(r: Reserva, sector: string) {
    const res = await fetch(`/api/reservas/${r.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sector }),
    }).catch(() => null);
    if (!res?.ok) {
      const d = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
      avisar(d?.error?.message ?? "No se pudo mover");
    }
    await cargar(fecha);
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
    avisar(`${voc.singular} creada`);
    await cargar(dia.fecha);
  }

  const singular = enFrase(voc.singular);
  const estados = opcionesEstado(voc);
  const titulo = dia ? (dia.fecha === dia.hoy ? "Hoy" : fechaCorta(dia.fecha)) : "Hoy";

  return (
    <Pagina
      titulo={titulo}
      detalle={dia ? `${voc.plural} del ${fechaCorta(dia.fecha)}, por horario.` : undefined}
      accion={
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            aria-label="Día anterior"
            disabled={!fecha}
            onClick={() => fecha && void cargar(sumarDias(fecha, -1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Input
            type="date"
            aria-label="Fecha"
            value={fecha ?? ""}
            onChange={(e) => e.target.value && void cargar(e.target.value)}
            className="h-9 w-40"
          />
          <Button
            variant="outline"
            size="sm"
            aria-label="Día siguiente"
            disabled={!fecha}
            onClick={() => fecha && void cargar(sumarDias(fecha, 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
          {dia && dia.fecha !== dia.hoy && (
            <Button variant="ghost" size="sm" onClick={() => void cargar(dia.hoy)}>
              Volver a hoy
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => {
              setError(null);
              setForm({ ...VACIA, hora: dia?.horarios[0]?.hora ?? "" });
            }}
          >
            <Plus className="size-4" strokeWidth={1.8} /> Nueva {singular}
          </Button>
        </div>
      }
    >
      {form && dia && (
        <Ficha titulo={`Nueva ${singular} · ${fechaCorta(dia.fecha)}`}>
          <form onSubmit={(e) => void crear(e)} className={grilla}>
            <Campo label="A nombre de">
              <Input required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            </Campo>
            <Campo label="Teléfono (opcional)">
              <Input
                value={form.telefono}
                inputMode="tel"
                placeholder="11 2345 6789"
                onChange={(e) => setForm({ ...form, telefono: e.target.value })}
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
            <Campo label="Personas">
              <Input
                type="number"
                min={1}
                required
                value={form.personas}
                onChange={(e) => setForm({ ...form, personas: e.target.value })}
              />
            </Campo>
            <Campo label="Observaciones" className="sm:col-span-2">
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

      {dia?.cerrado && (
        <p className="mb-4 rounded-lg bg-warning-tint px-3 py-2 text-sm text-warning-text">
          Día cerrado: {dia.cerrado}. No se toman {enFrase(voc.plural)}.
        </p>
      )}

      {cargando && !dia && <p className="text-sm text-text-3">Cargando…</p>}

      {dia && dia.horarios.length === 0 && (
        <p className="text-sm text-text-3">
          Ese día no hay horarios de {singular}. Se configuran en Ajustes → Reservas.
        </p>
      )}

      <div className="space-y-5">
        {dia?.horarios.map((h) => (
          <section key={h.hora} aria-label={`Horario ${h.hora}`} className="rounded-xl border bg-card shadow-sm">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
              <div className="flex items-baseline gap-3">
                <h3 className="text-lg font-bold tabular-nums">{h.hora}</h3>
                <span className="text-sm text-text-3">
                  {h.personas} persona{h.personas === 1 ? "" : "s"}
                  {!h.configurado && " · fuera de los horarios de Ajustes"}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {h.cupo.map((c) => (
                  <span
                    key={c.capacidad}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[12px] font-medium",
                      c.libres > 0 ? "bg-success-tint text-success-text" : "bg-muted text-text-3"
                    )}
                  >
                    Mesas de {c.capacidad}: {Math.max(0, c.libres)} libre{c.libres === 1 ? "" : "s"} de {c.total}
                  </span>
                ))}
              </div>
            </header>
            {h.reservas.length === 0 ? (
              <p className="px-4 py-4 text-sm text-text-3">Sin {enFrase(voc.plural)}.</p>
            ) : (
              <ul className="divide-y">
                {h.reservas.map((r) => {
                  const abierta = r.estado === "recibido";
                  return (
                    <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <Link href={`/oportunidades/${r.oportunidadId}`} className="font-semibold hover:underline">
                          {r.nombre}
                        </Link>
                        <p className="text-[13px] text-text-3">
                          {r.personas} persona{r.personas === 1 ? "" : "s"}
                          {" · "}
                          {r.mesas.map((m) => `mesa de ${m.capacidad}`).join(" + ")}
                          {r.telefono && ` · ${r.telefono}`}
                          {r.canal === "whatsapp" && " · por WhatsApp"}
                        </p>
                        {r.observaciones && <p className="text-[13px] text-text-2">{r.observaciones}</p>}
                      </div>
                      {dia.sectores.length > 1 ? (
                        <Select
                          aria-label={`Sector de ${r.nombre}`}
                          value={r.sector}
                          disabled={!abierta && r.estado !== "compro"}
                          onValueChange={(v) => void moverSector(r, v)}
                          className="h-8 w-40"
                        >
                          {dia.sectores.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <span className="text-sm text-text-2">{r.sector}</span>
                      )}
                      <EstadoPill opciones={estados} value={r.estado} />
                      {abierta && cancelando?.id !== r.id && (
                        <div className="flex gap-1.5">
                          <Button size="sm" onClick={() => void cambiarEstado(r, "compro")}>
                            {nombreEstado(voc, "compro")}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => void cambiarEstado(r, "no_calificado")}>
                            {nombreEstado(voc, "no_calificado")}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setCancelando({ id: r.id, motivo: voc.motivos[0] ?? "" })}
                          >
                            Cancelar
                          </Button>
                        </div>
                      )}
                      {cancelando?.id === r.id && (
                        <div className="flex items-center gap-1.5">
                          <Select
                            aria-label="Motivo"
                            value={cancelando.motivo}
                            onValueChange={(v) => setCancelando({ ...cancelando, motivo: v })}
                            className="h-8 w-48"
                          >
                            {voc.motivos.map((m) => (
                              <option key={m} value={m}>
                                {m}
                              </option>
                            ))}
                          </Select>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => void cambiarEstado(r, "perdido", cancelando.motivo || undefined)}
                          >
                            {nombreEstado(voc, "perdido")}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setCancelando(null)}>
                            Volver
                          </Button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ))}
      </div>
    </Pagina>
  );
}
