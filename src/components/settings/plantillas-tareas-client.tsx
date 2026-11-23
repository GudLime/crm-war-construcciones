"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { IconoTipo } from "@/components/ventas/tareas-client";
import {
  completarMensaje,
  SITUACIONES,
  VARIABLES,
  VENCIMIENTOS,
  type Plantilla,
} from "@/lib/sugerencias";
import { nombreEstado } from "@/lib/vocabulario";
import { useVocabulario } from "@/components/vocabulario";
import { etiqueta, TIPOS_TAREA } from "@/lib/ventas";
import { cn } from "@/lib/utils";

/** Los cinco tipos que se ofrecen (los mismos botones de la oportunidad). */
const TIPOS = ["mensaje", "llamada", "visita", "correo", "tarea"] as const;

const EJEMPLO = { nombre: "Lucía", vendedor: "Sebastián", edificio: "Lavalle", unidad: "3B", fecha_visita: "13/11 a las 11:00" };

type Borrador = Omit<Plantilla, "id" | "orden"> & { id: string | null };

const NUEVA: Borrador = {
  id: null,
  nombre: "",
  tipo: "mensaje",
  situacion: "sin_contacto",
  diasSinRespuesta: null,
  vence: "hoy",
  mensaje: "",
  activa: true,
  origenes: [],
};

function resumen(p: Plantilla): string {
  const venc = VENCIMIENTOS.find((v) => v.value === p.vence)?.label.toLowerCase() ?? p.vence;
  return [
    etiqueta(TIPOS_TAREA, p.tipo),
    `vence ${venc}`,
    p.situacion === "no_contesta" ? `sin respuesta hace ${p.diasSinRespuesta ?? 3} días` : null,
    p.mensaje ? "con mensaje" : null,
    p.origenes?.length ? `solo ${p.origenes.join(", ")}` : null,
    p.situacion === "al_asignar" ? "se crea sola" : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * 0059 — Configuración → Plantillas de tareas. A la izquierda, agrupadas por
 * situación, con su interruptor; a la derecha, el panel para editar, con la
 * vista previa de cómo le llega al vendedor.
 */
export function PlantillasTareasClient() {
  const voc = useVocabulario();
  const [plantillas, setPlantillas] = useState<Plantilla[] | null>(null);
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const mensajeRef = useRef<HTMLTextAreaElement>(null);
  // 0061 — Los orígenes de Configuración → Orígenes, para limitar una plantilla.
  const [origenes, setOrigenes] = useState<string[]>([]);
  useEffect(() => {
    void fetch("/api/origenes")
      .then((r) => (r.ok ? r.json() : { origenes: [] }))
      .then((d: { origenes: { nombre: string }[] }) => setOrigenes(d.origenes.map((o) => o.nombre)))
      .catch(() => undefined);
  }, []);

  async function cargar() {
    const r = await fetch("/api/settings/tareas").catch(() => null);
    if (!r?.ok) {
      setError("No se pudieron cargar las plantillas");
      return;
    }
    const d = (await r.json()) as { plantillas: Plantilla[] };
    setPlantillas(d.plantillas);
    setBorrador((b) => b ?? (d.plantillas[0] ? { ...d.plantillas[0] } : { ...NUEVA }));
  }
  useEffect(() => {
    void cargar();
  }, []);

  const grupos = useMemo(
    () =>
      SITUACIONES.map((s) => ({ ...s, plantillas: (plantillas ?? []).filter((p) => p.situacion === s.clave) })).filter(
        (g) => g.plantillas.length > 0
      ),
    [plantillas]
  );

  async function alternar(p: Plantilla, activa: boolean) {
    setPlantillas((ps) => ps?.map((x) => (x.id === p.id ? { ...x, activa } : x)) ?? ps);
    const r = await fetch(`/api/settings/tareas/${p.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ activa }),
    }).catch(() => null);
    if (!r?.ok) void cargar();
  }

  async function guardar() {
    if (!borrador) return;
    setError(null);
    setAviso(null);
    const cuerpo = {
      nombre: borrador.nombre,
      tipo: borrador.tipo,
      situacion: borrador.situacion,
      diasSinRespuesta: borrador.situacion === "no_contesta" ? (borrador.diasSinRespuesta ?? 3) : null,
      vence: borrador.vence,
      mensaje: borrador.mensaje || null,
      activa: borrador.activa,
      origenes: borrador.origenes ?? [],
    };
    const r = await fetch(borrador.id ? `/api/settings/tareas/${borrador.id}` : "/api/settings/tareas", {
      method: borrador.id ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(cuerpo),
    }).catch(() => null);
    if (!r?.ok) {
      const e = (await r?.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(e?.error?.message ?? "No se pudo guardar");
      return;
    }
    const d = (await r.json()) as { plantilla: Plantilla };
    setBorrador({ ...d.plantilla });
    setAviso("Guardado");
    await cargar();
  }

  async function eliminar() {
    if (!borrador?.id || !window.confirm(`¿Eliminar la plantilla «${borrador.nombre}»?`)) return;
    const r = await fetch(`/api/settings/tareas/${borrador.id}`, { method: "DELETE" }).catch(() => null);
    if (!r?.ok) {
      setError("No se pudo eliminar");
      return;
    }
    setBorrador(null);
    await cargar();
  }

  function insertar(variable: string) {
    if (!borrador) return;
    const el = mensajeRef.current;
    const texto = borrador.mensaje ?? "";
    const a = el?.selectionStart ?? texto.length;
    const b = el?.selectionEnd ?? texto.length;
    const nuevo = `${texto.slice(0, a)}{${variable}}${texto.slice(b)}`;
    setBorrador({ ...borrador, mensaje: nuevo });
    window.setTimeout(() => {
      el?.focus();
      const pos = a + variable.length + 2;
      el?.setSelectionRange(pos, pos);
    }, 0);
  }

  if (!plantillas) return <p className="text-sm text-text-3">{error ?? "Cargando…"}</p>;
  const situacion = SITUACIONES.find((s) => s.clave === borrador?.situacion);
  const pastilla = (activo: boolean) =>
    cn(
      "inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium transition-colors",
      activo ? "border-brand bg-brand-tint text-brand-ink" : "border-border bg-card hover:bg-accent"
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-bold tracking-tight">Plantillas de tareas</h1>
          <p className="text-sm text-text-2">
            Lo que se le sugiere al vendedor en cada oportunidad según en qué situación está. Solo las de «Al
            asignarle responsable» se crean solas; las demás las elige el vendedor.
          </p>
        </div>
        <Button size="sm" onClick={() => setBorrador({ ...NUEVA })}>
          <Plus className="size-4" /> Nueva plantilla
        </Button>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-4">
          {grupos.length === 0 && <p className="text-sm text-text-3">No hay plantillas. Creá la primera.</p>}
          {grupos.map((g) => (
            <section key={g.clave} className="rounded-xl border border-border bg-card">
              <header className="flex items-center gap-2 border-b px-4 py-2.5">
                <h2 className="text-[13.5px] font-semibold">{g.nombre}</h2>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-text-2">
                  {nombreEstado(voc, g.etapa)}
                </span>
              </header>
              <ul className="divide-y divide-border">
                {g.plantillas.map((p) => (
                  <li
                    key={p.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-accent",
                      borrador?.id === p.id && "bg-brand-tint",
                      !p.activa && "opacity-55"
                    )}
                    onClick={() => {
                      setBorrador({ ...p });
                      setError(null);
                      setAviso(null);
                    }}
                  >
                    <IconoTipo tipo={p.tipo} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-medium">{p.nombre}</p>
                      <p className="truncate text-[11.5px] text-text-3">{resumen(p)}</p>
                    </div>
                    <span className="text-[11.5px] text-text-3">{p.activa ? "Activa" : "Pausada"}</span>
                    <span onClick={(e) => e.stopPropagation()}>
                      <Switch checked={p.activa} onCheckedChange={(v) => void alternar(p, v)} label={`Activa: ${p.nombre}`} />
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        {borrador && (
          <aside className="space-y-4 rounded-xl border border-border bg-card p-4 lg:sticky lg:top-4">
            <h2 className="text-[15px] font-bold">{borrador.id ? "Editar plantilla" : "Nueva plantilla"}</h2>
            <label className="block space-y-1">
              <span className="text-[12px] font-medium text-text-3">Nombre</span>
              <input
                value={borrador.nombre}
                onChange={(e) => setBorrador({ ...borrador, nombre: e.target.value })}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              />
            </label>
            <div className="space-y-1">
              <span className="text-[12px] font-medium text-text-3">Tipo</span>
              <div className="flex flex-wrap gap-1.5">
                {TIPOS.map((t) => (
                  <button key={t} type="button" onClick={() => setBorrador({ ...borrador, tipo: t })} className={pastilla(borrador.tipo === t)}>
                    {etiqueta(TIPOS_TAREA, t)}
                  </button>
                ))}
              </div>
            </div>
            <label className="block space-y-1">
              <span className="text-[12px] font-medium text-text-3">{borrador.situacion === "al_asignar" ? "Cuándo se crea" : "Cuándo se sugiere"}</span>
              <Select
                value={borrador.situacion}
                onValueChange={(s) =>
                  setBorrador({
                    ...borrador,
                    situacion: s,
                    vence: borrador.vence === "antes_visita" && s !== "visita_agendada" ? "hoy" : borrador.vence,
                  })
                }
                className="w-full"
              >
                {SITUACIONES.map((s) => (
                  <option key={s.clave} value={s.clave}>
                    {s.nombre} · {nombreEstado(voc, s.etapa)}
                  </option>
                ))}
              </Select>
              {situacion && <span className="block text-[11.5px] text-text-3">{situacion.ayuda}</span>}
            </label>
            {borrador.situacion === "no_contesta" && (
              <div className="flex items-center gap-2 text-[13px]">
                Sin respuesta hace
                <button
                  type="button"
                  aria-label="Un día menos"
                  onClick={() => setBorrador({ ...borrador, diasSinRespuesta: Math.max(1, (borrador.diasSinRespuesta ?? 3) - 1) })}
                  className="grid size-7 place-items-center rounded-md border border-border hover:bg-accent"
                >
                  <Minus className="size-3.5" />
                </button>
                <span className="w-6 text-center font-mono font-semibold">{borrador.diasSinRespuesta ?? 3}</span>
                <button
                  type="button"
                  aria-label="Un día más"
                  onClick={() => setBorrador({ ...borrador, diasSinRespuesta: Math.min(60, (borrador.diasSinRespuesta ?? 3) + 1) })}
                  className="grid size-7 place-items-center rounded-md border border-border hover:bg-accent"
                >
                  <Plus className="size-3.5" />
                </button>
                días
              </div>
            )}
            <div className="space-y-1">
              <span className="text-[12px] font-medium text-text-3">Solo si llegó por</span>
              <div className="flex flex-wrap gap-1.5">
                {origenes.length === 0 && <span className="text-[12px] text-text-3">No hay orígenes cargados.</span>}
                {[...new Set([...origenes, ...(borrador.origenes ?? [])])].map((o) => {
                  const on = (borrador.origenes ?? []).includes(o);
                  return (
                    <button
                      key={o}
                      type="button"
                      onClick={() =>
                        setBorrador({
                          ...borrador,
                          origenes: on ? (borrador.origenes ?? []).filter((x) => x !== o) : [...(borrador.origenes ?? []), o],
                        })
                      }
                      className={pastilla(on)}
                    >
                      {o}
                    </button>
                  );
                })}
              </div>
              <span className="block text-[11.5px] text-text-3">
                {(borrador.origenes ?? []).length ? "Solo para las que llegaron por esos orígenes." : "Ninguno elegido: vale para todos los orígenes."}
              </span>
            </div>
            <div className="space-y-1">
              <span className="text-[12px] font-medium text-text-3">Vence</span>
              <div className="flex flex-wrap gap-1.5">
                {VENCIMIENTOS.filter((v) => v.value !== "antes_visita" || borrador.situacion === "visita_agendada").map((v) => (
                  <button key={v.value} type="button" onClick={() => setBorrador({ ...borrador, vence: v.value })} className={pastilla(borrador.vence === v.value)}>
                    {v.label}
                  </button>
                ))}
              </div>
            </div>
            <label className="block space-y-1">
              <span className="text-[12px] font-medium text-text-3">Mensaje sugerido (opcional)</span>
              <textarea
                ref={mensajeRef}
                value={borrador.mensaje ?? ""}
                onChange={(e) => setBorrador({ ...borrador, mensaje: e.target.value })}
                rows={4}
                className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
              <span className="flex flex-wrap gap-1">
                {VARIABLES.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => insertar(v)}
                    className="rounded-md border border-border px-1.5 py-0.5 font-mono text-[11px] hover:bg-accent"
                  >
                    {`{${v}}`}
                  </button>
                ))}
              </span>
            </label>
            <div className="space-y-1">
              <span className="text-[12px] font-medium text-text-3">Así le llega al vendedor</span>
              <div className="rounded-lg border border-brand-soft bg-gradient-to-b from-brand-tint to-card p-3">
                <p className="mb-1.5 flex items-center gap-1.5 text-[11.5px] font-semibold text-brand-ink">
                  <Sparkles className="size-3.5" /> {borrador.situacion === "al_asignar" ? "Se crea sola al asignar" : "Sugerida para esta etapa"}
                </p>
                <div className="flex items-start gap-2">
                  <IconoTipo tipo={borrador.tipo} />
                  <div className="min-w-0 text-[13px]">
                    <p className="font-semibold">
                      {borrador.nombre || "Sin nombre"}{" "}
                      <span className="font-normal text-text-3">
                        · para {VENCIMIENTOS.find((v) => v.value === borrador.vence)?.label.toLowerCase() ?? "hoy"}
                      </span>
                    </p>
                    <p className="text-[12px] text-text-3">{situacion?.ayuda}</p>
                    {borrador.mensaje && (
                      <p className="mt-1 truncate text-[12px] text-text-2">«{completarMensaje(borrador.mensaje, EJEMPLO)}»</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
            {error && <p className="text-sm text-danger-text">{error}</p>}
            <div className="flex items-center gap-2 border-t pt-3">
              {borrador.id && (
                <Button type="button" size="sm" variant="ghost" onClick={() => void eliminar()} className="text-danger-text">
                  Eliminar
                </Button>
              )}
              {aviso && <span className="text-sm text-text-3">{aviso}</span>}
              <Button type="button" size="sm" className="ml-auto" onClick={() => void guardar()} disabled={!borrador.nombre.trim()}>
                {borrador.id ? "Guardar cambios" : "Crear plantilla"}
              </Button>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
