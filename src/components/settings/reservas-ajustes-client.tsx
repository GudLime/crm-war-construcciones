"use client";

import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { esFecha, esHora } from "@/lib/reservas";

/**
 * 071 — Configuración → Reservas: en qué horarios se reserva cada día, cuántas
 * mesas hay por sector, cuánto antes y con cuánta anticipación, y los días
 * cerrados. Se guarda todo junto.
 */

type Horario = { diaSemana: number; hora: string; activo: boolean };
type Cupo = { sector: string; capacidad: number; cantidad: number };
type Cierre = { fecha: string; motivo: string | null };
type Ajustes = {
  zonaHoraria: string;
  anticipacionDias: number;
  minutosAntes: number;
  maxPersonas: number;
  duracionMinutos: number;
  enlaceCarta: string | null;
  direccion: string | null;
};
type Config = { ajustes: Ajustes; horarios: Horario[]; cupo: Cupo[]; cierres: Cierre[] };

/** Lunes primero, como se lee una semana acá. */
const DIAS: { valor: number; corto: string }[] = [
  { valor: 1, corto: "Lun" },
  { valor: 2, corto: "Mar" },
  { valor: 3, corto: "Mié" },
  { valor: 4, corto: "Jue" },
  { valor: 5, corto: "Vie" },
  { valor: 6, corto: "Sáb" },
  { valor: 0, corto: "Dom" },
];

export function ReservasAjustesClient() {
  const [config, setConfig] = useState<Config | null>(null);
  const [puedeEditar, setPuedeEditar] = useState(false);
  /** Los sectores de Configuración → Sectores, para el desplegable de cada fila de mesas. */
  const [sectores, setSectores] = useState<string[]>([]);
  const [horaNueva, setHoraNueva] = useState("");
  const [cierreNuevo, setCierreNuevo] = useState({ fecha: "", motivo: "" });
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/reservas/configuracion").catch(() => null);
      if (!res?.ok) return;
      const d = (await res.json()) as Config & { puedeEditar: boolean; sectores: string[] };
      setConfig({ ajustes: d.ajustes, horarios: d.horarios, cupo: d.cupo, cierres: d.cierres });
      setPuedeEditar(d.puedeEditar);
      setSectores(d.sectores);
    })();
  }, []);

  /** Las horas que aparecen en algún día: las columnas de la grilla. */
  const horas = useMemo(
    () => [...new Set((config?.horarios ?? []).map((h) => h.hora))].sort(),
    [config?.horarios]
  );

  if (!config) return <p className="text-sm text-text-3">Cargando…</p>;
  const c = config;

  const activo = (dia: number, hora: string) =>
    c.horarios.some((h) => h.diaSemana === dia && h.hora === hora && h.activo);

  function alternar(dia: number, hora: string) {
    const sin = c.horarios.filter((h) => !(h.diaSemana === dia && h.hora === hora));
    setConfig({ ...c, horarios: activo(dia, hora) ? sin : [...sin, { diaSemana: dia, hora, activo: true }] });
  }

  function agregarHora() {
    if (!esHora(horaNueva) || horas.includes(horaNueva)) return;
    setConfig({
      ...c,
      horarios: [...c.horarios, ...DIAS.map((d) => ({ diaSemana: d.valor, hora: horaNueva, activo: true }))],
    });
    setHoraNueva("");
  }

  function quitarHora(hora: string) {
    setConfig({ ...c, horarios: c.horarios.filter((h) => h.hora !== hora) });
  }

  function ajuste<K extends keyof Ajustes>(k: K, v: Ajustes[K]) {
    setConfig({ ...c, ajustes: { ...c.ajustes, [k]: v } });
  }

  function numero(k: "anticipacionDias" | "minutosAntes" | "maxPersonas" | "duracionMinutos", v: string) {
    const n = Number.parseInt(v, 10);
    ajuste(k, Number.isFinite(n) ? n : 0);
  }

  function cambiarCupo(i: number, cambio: Partial<Cupo>) {
    setConfig({ ...c, cupo: c.cupo.map((q, j) => (j === i ? { ...q, ...cambio } : q)) });
  }

  const totalMesas = c.cupo.reduce((a, q) => a + q.cantidad, 0);
  const totalLugares = c.cupo.reduce((a, q) => a + q.cantidad * q.capacidad, 0);

  async function guardar() {
    setGuardando(true);
    setAviso(null);
    const res = await fetch("/api/reservas/configuracion", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(c),
    }).catch(() => null);
    setGuardando(false);
    if (!res?.ok) {
      const d = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
      setAviso({ tipo: "error", texto: d?.error?.message ?? "No se pudo guardar. Revisá los valores." });
      return;
    }
    const d = (await res.json()) as Config & { sectores: string[] };
    setConfig({ ajustes: d.ajustes, horarios: d.horarios, cupo: d.cupo, cierres: d.cierres });
    setSectores(d.sectores);
    setAviso({ tipo: "ok", texto: "Guardado" });
  }

  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Horarios de reserva</CardTitle>
          <CardDescription>
            Los horarios en los que se puede reservar, día por día. Tocá un casillero para abrirlo o cerrarlo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {horas.length === 0 ? (
            <p className="text-sm text-text-3">Todavía no hay horarios. Agregá el primero abajo.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="text-sm">
                <thead>
                  <tr>
                    <th className="w-14" />
                    {horas.map((h) => (
                      <th key={h} className="px-2 pb-2 text-center font-medium tabular-nums">
                        <span className="inline-flex items-center gap-1">
                          {h}
                          {puedeEditar && (
                            <button
                              type="button"
                              aria-label={`Quitar el horario de las ${h}`}
                              onClick={() => quitarHora(h)}
                              className="text-text-3 hover:text-danger-text"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          )}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DIAS.map((d) => (
                    <tr key={d.valor}>
                      <td className="pr-3 font-medium text-text-2">{d.corto}</td>
                      {horas.map((h) => {
                        const on = activo(d.valor, h);
                        return (
                          <td key={h} className="px-2 py-1 text-center">
                            <button
                              type="button"
                              disabled={!puedeEditar}
                              aria-pressed={on}
                              aria-label={`${d.corto} ${h}`}
                              onClick={() => alternar(d.valor, h)}
                              className={
                                on
                                  ? "h-8 w-14 rounded-md bg-brand text-[12px] font-semibold text-white"
                                  : "h-8 w-14 rounded-md border border-dashed border-border text-[12px] text-text-3"
                              }
                            >
                              {on ? "Abre" : "—"}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {puedeEditar && (
            <div className="flex items-end gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="hora-nueva">Nuevo horario</Label>
                <Input
                  id="hora-nueva"
                  type="time"
                  value={horaNueva}
                  onChange={(e) => setHoraNueva(e.target.value)}
                  className="w-32"
                />
              </div>
              <Button variant="outline" onClick={agregarHora} disabled={!esHora(horaNueva)}>
                <Plus className="size-4" /> Agregar a todos los días
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mesas por horario</CardTitle>
          <CardDescription>
            Cuántas mesas de cada tamaño hay en cada sector. Cada horario arranca con todas libres. Una
            reserva usa la mesa más chica que alcanza; si ninguna sola alcanza, junta dos del mismo sector.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {c.cupo.map((q, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2">
              <div className="space-y-1.5">
                <Label htmlFor={`sector-${i}`}>Sector</Label>
                <Select
                  id={`sector-${i}`}
                  aria-label={`Sector de la fila ${i + 1}`}
                  value={q.sector}
                  disabled={!puedeEditar}
                  onValueChange={(v) => cambiarCupo(i, { sector: v })}
                  className="w-44"
                >
                  {[...new Set([...sectores, q.sector])].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`cap-${i}`}>Personas por mesa</Label>
                <Input
                  id={`cap-${i}`}
                  type="number"
                  min={1}
                  value={q.capacidad}
                  disabled={!puedeEditar}
                  onChange={(e) => cambiarCupo(i, { capacidad: Number.parseInt(e.target.value, 10) || 0 })}
                  className="w-28"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`cant-${i}`}>Mesas</Label>
                <Input
                  id={`cant-${i}`}
                  type="number"
                  min={0}
                  value={q.cantidad}
                  disabled={!puedeEditar}
                  onChange={(e) => cambiarCupo(i, { cantidad: Number.parseInt(e.target.value, 10) || 0 })}
                  className="w-20"
                />
              </div>
              {puedeEditar && (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Quitar"
                  onClick={() => setConfig({ ...c, cupo: c.cupo.filter((_, j) => j !== i) })}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
          ))}
          {sectores.length === 0 ? (
            <p className="text-sm text-text-2">
              Primero cargá los sectores del local en{" "}
              <Link href="/settings/sectores" className="font-medium underline">
                Configuración → Sectores
              </Link>
              .
            </p>
          ) : (
            puedeEditar && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setConfig({
                    ...c,
                    cupo: [...c.cupo, { sector: c.cupo.at(-1)?.sector ?? sectores[0]!, capacidad: 2, cantidad: 1 }],
                  })
                }
              >
                <Plus className="size-4" /> Agregar mesas
              </Button>
            )
          )}
          {c.cupo.length > 0 && (
            <p className="rounded-lg bg-subtle px-3 py-2 text-[13px] text-text-2">
              Por horario: {totalMesas} mesa{totalMesas === 1 ? "" : "s"} para {totalLugares} personas.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cuándo se puede reservar</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="anticipacion">Días de anticipación</Label>
            <Input
              id="anticipacion"
              type="number"
              min={0}
              max={90}
              value={c.ajustes.anticipacionDias}
              disabled={!puedeEditar}
              onChange={(e) => numero("anticipacionDias", e.target.value)}
            />
            <p className="text-[12px] text-text-3">Hoy y los próximos {c.ajustes.anticipacionDias} días.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="minutos">Hasta cuántos minutos antes</Label>
            <Input
              id="minutos"
              type="number"
              min={0}
              value={c.ajustes.minutosAntes}
              disabled={!puedeEditar}
              onChange={(e) => numero("minutosAntes", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="max">Más personas que esto, atiende alguien del equipo</Label>
            <Input
              id="max"
              type="number"
              min={1}
              value={c.ajustes.maxPersonas}
              disabled={!puedeEditar}
              onChange={(e) => numero("maxPersonas", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="duracion">Duración en el calendario (minutos)</Label>
            <Input
              id="duracion"
              type="number"
              min={15}
              value={c.ajustes.duracionMinutos}
              disabled={!puedeEditar}
              onChange={(e) => numero("duracionMinutos", e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="direccion">Dirección (va en el evento del calendario)</Label>
            <Input
              id="direccion"
              value={c.ajustes.direccion ?? ""}
              disabled={!puedeEditar}
              onChange={(e) => ajuste("direccion", e.target.value || null)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="carta">Enlace de la carta</Label>
            <Input
              id="carta"
              type="url"
              placeholder="https://"
              value={c.ajustes.enlaceCarta ?? ""}
              disabled={!puedeEditar}
              onChange={(e) => ajuste("enlaceCarta", e.target.value || null)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Días cerrados</CardTitle>
          <CardDescription>Feriados o eventos privados: esos días no se toman reservas.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {c.cierres.length === 0 && <p className="text-sm text-text-3">Ninguno.</p>}
          {c.cierres.map((x) => (
            <div key={x.fecha} className="flex items-center gap-3 text-sm">
              <span className="font-medium tabular-nums">{x.fecha}</span>
              <span className="text-text-2">{x.motivo ?? ""}</span>
              {puedeEditar && (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Quitar ${x.fecha}`}
                  onClick={() => setConfig({ ...c, cierres: c.cierres.filter((y) => y.fecha !== x.fecha) })}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
          ))}
          {puedeEditar && (
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="cierre-fecha">Fecha</Label>
                <Input
                  id="cierre-fecha"
                  type="date"
                  value={cierreNuevo.fecha}
                  onChange={(e) => setCierreNuevo({ ...cierreNuevo, fecha: e.target.value })}
                  className="w-44"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cierre-motivo">Motivo (opcional)</Label>
                <Input
                  id="cierre-motivo"
                  value={cierreNuevo.motivo}
                  onChange={(e) => setCierreNuevo({ ...cierreNuevo, motivo: e.target.value })}
                  className="w-56"
                />
              </div>
              <Button
                variant="outline"
                disabled={!esFecha(cierreNuevo.fecha) || c.cierres.some((x) => x.fecha === cierreNuevo.fecha)}
                onClick={() => {
                  setConfig({
                    ...c,
                    cierres: [...c.cierres, { fecha: cierreNuevo.fecha, motivo: cierreNuevo.motivo || null }].sort(
                      (a, b) => a.fecha.localeCompare(b.fecha)
                    ),
                  });
                  setCierreNuevo({ fecha: "", motivo: "" });
                }}
              >
                <Plus className="size-4" /> Agregar
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {puedeEditar ? (
        <div className="flex items-center gap-3">
          <Button onClick={() => void guardar()} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar"}
          </Button>
          {aviso && (
            <span className={aviso.tipo === "ok" ? "text-sm text-success-text" : "text-sm text-danger-text"}>
              {aviso.texto}
            </span>
          )}
        </div>
      ) : (
        <p className="text-sm text-text-3">Solo quien administra puede cambiar estos ajustes.</p>
      )}
    </div>
  );
}
