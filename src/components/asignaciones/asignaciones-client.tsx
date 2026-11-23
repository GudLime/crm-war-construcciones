"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Zap } from "lucide-react";
import {
  EVENTO_ASIGNACIONES,
  iniciales,
  textoEspera,
  tonoEspera,
  type AsignacionesDto,
  type Cambio,
  type TarjetaAsignacion,
  type TarjetaAutomatica,
  type VendedorAsignacion,
} from "@/lib/asignaciones";
import { tonoDeEdificio } from "@/lib/colores-edificio";
import { etiqueta, TIPOS_OPORTUNIDAD } from "@/lib/ventas";
import { useEvents } from "@/components/use-events";
import { cn } from "@/lib/utils";

/**
 * Asignaciones (solo admin) — la mesa de reparto: a la izquierda las que
 * esperan (Sin asignar · Asignadas automáticamente) y a la derecha un carril
 * por vendedor con su carga. Toda asignación se puede deshacer.
 */

type Aviso = { texto: string; cambios: Cambio[] };

const TONO_ESPERA = { normal: "text-text-3", ambar: "text-warning-text", rojo: "text-danger-text" } as const;
const TONO_CARGA = { normal: "bg-brand", alta: "bg-[#f59e0b]", saturada: "bg-[#ef4444]" } as const;

function PildoraEdificio({ e }: { e: TarjetaAsignacion["edificio"] }) {
  if (!e) return null;
  const t = tonoDeEdificio(e.color);
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium" style={{ background: t.fondo, color: t.texto }}>
      <span className="size-1.5 rounded-full" style={{ background: t.punto }} />
      {e.nombre}
    </span>
  );
}

function Tarjeta({
  t,
  pie,
}: {
  t: TarjetaAsignacion;
  pie: React.ReactNode;
}) {
  const tono = tonoEspera(t.esperaMin);
  return (
    <article className="rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="flex items-center gap-1.5">
        {t.tipo && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase text-text-2">
            {etiqueta(TIPOS_OPORTUNIDAD, t.tipo)}
          </span>
        )}
        <Link href={`/oportunidades/${t.id}`} className="min-w-0 flex-1 truncate text-[13.5px] font-semibold hover:underline">
          {t.nombre}
        </Link>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11.5px] text-text-3">
        <PildoraEdificio e={t.edificio} />
        {t.origen && <span>{t.origen}</span>}
        {t.ambientes.length > 0 && <span>· {t.ambientes.join(", ")} amb.</span>}
      </div>
      {t.ultimoMensaje && <p className="mt-1.5 truncate text-[12.5px] text-text-2">“{t.ultimoMensaje}”</p>}
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className={cn("text-[11.5px] tabular-nums", TONO_ESPERA[tono])}>{textoEspera(t.esperaMin)}</span>
        {pie}
      </div>
    </article>
  );
}

function Carril({ v, tope, onAsignar }: { v: VendedorAsignacion; tope: number; onAsignar?: () => void }) {
  return (
    <section className="rounded-xl border border-border bg-card p-3">
      <header className="flex flex-wrap items-center gap-3">
        <span className="grid size-9 place-items-center rounded-full bg-brand-tint text-[12px] font-bold text-brand-ink">{iniciales(v.nombre)}</span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-[14px] font-semibold">
            {v.nombre}
            {v.tecla !== null && <kbd className="rounded border border-border bg-muted px-1.5 font-mono text-[11px]">{v.tecla}</kbd>}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <span className="h-1.5 w-32 overflow-hidden rounded-full bg-muted">
              <span className={cn("block h-full rounded-full", TONO_CARGA[v.carga.nivel])} style={{ width: `${Math.min(100, v.carga.pct)}%` }} />
            </span>
            <span className="text-[11.5px] text-text-3">
              Carga {v.carga.pct}% · {v.carga.nivel}
            </span>
          </div>
        </div>
        <dl className="flex gap-4 text-center text-[11px] text-text-3">
          <div>
            <dt>abiertas</dt>
            <dd className="font-mono text-[15px] font-semibold text-foreground">
              {v.abiertas}
              <span className="text-[11px] text-text-3">/{tope}</span>
            </dd>
          </div>
          <div>
            <dt>sin contactar</dt>
            <dd className={cn("font-mono text-[15px] font-semibold", v.sinContactar >= 5 ? "text-danger-text" : "text-foreground")}>{v.sinContactar}</dd>
          </div>
          <div>
            <dt>visitas hoy</dt>
            <dd className="font-mono text-[15px] font-semibold text-foreground">{v.visitasHoy}</dd>
          </div>
        </dl>
        {onAsignar && (
          <button type="button" onClick={onAsignar} className="rounded-md border border-border px-2.5 py-1 text-[12px] font-medium hover:bg-subtle">
            Asignarle la de arriba
          </button>
        )}
      </header>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {v.asignadasHoy.length === 0 ? (
          <span className="text-[12px] text-text-3">Sin asignadas hoy.</span>
        ) : (
          <>
            {v.asignadasHoy.slice(0, 4).map((a) => (
              <Link
                key={a.id}
                href={`/oportunidades/${a.id}`}
                className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11.5px] hover:bg-subtle"
              >
                <span className="size-1.5 rounded-full" style={{ background: tonoDeEdificio(a.edificio?.color).punto }} />
                {a.nombre}
                {a.auto && <Zap className="size-3 text-warning-text" aria-label="automática" />}
              </Link>
            ))}
            {v.asignadasHoy.length > 4 && <span className="text-[11.5px] text-text-3">+{v.asignadasHoy.length - 4} más</span>}
          </>
        )}
      </div>
    </section>
  );
}

export function AsignacionesClient() {
  const [data, setData] = useState<AsignacionesDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [edificio, setEdificio] = useState("");
  const [pestana, setPestana] = useState<"sin" | "auto">("sin");
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const pila = useRef<Cambio[][]>([]);

  const cargar = useCallback(async () => {
    const q = edificio ? `?edificio=${encodeURIComponent(edificio)}` : "";
    const res = await fetch(`/api/asignaciones${q}`).catch(() => null);
    if (!res?.ok) {
      setError("No se pudo cargar la mesa. Probá de nuevo.");
      return;
    }
    setError(null);
    setData((await res.json()) as AsignacionesDto);
  }, [edificio]);

  useEffect(() => {
    void cargar();
    const alVolver = () => document.visibilityState === "visible" && void cargar();
    document.addEventListener("visibilitychange", alVolver);
    return () => document.removeEventListener("visibilitychange", alVolver);
  }, [cargar]);

  // Una oportunidad nueva llega con su mensaje: la tarjeta aparece sola.
  useEvents({ onMessageNew: () => void cargar(), onReconnect: () => void cargar() });

  useEffect(() => {
    if (!aviso) return;
    const t = window.setTimeout(() => setAviso(null), 6000);
    return () => window.clearTimeout(t);
  }, [aviso]);

  const asignar = useCallback(
    async (ids: string[], v: { userId: string; nombre: string }, texto?: string) => {
      if (!ids.length || ocupado) return;
      setOcupado(true);
      const res = await fetch("/api/asignaciones", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ oportunidadIds: ids, userId: v.userId }),
      }).catch(() => null);
      setOcupado(false);
      if (!res?.ok) {
        setError("No se pudo asignar. Probá de nuevo.");
        return;
      }
      const { cambios } = (await res.json()) as { cambios: Cambio[] };
      if (cambios.length) {
        pila.current.push(cambios);
        setAviso({ texto: texto ?? `${cambios.length} → ${v.nombre}`, cambios });
      }
      window.dispatchEvent(new Event(EVENTO_ASIGNACIONES));
      await cargar();
    },
    [cargar, ocupado]
  );

  const deshacer = useCallback(async () => {
    const cambios = pila.current.pop();
    if (!cambios || ocupado) return;
    setOcupado(true);
    await fetch("/api/asignaciones/deshacer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cambios }),
    }).catch(() => null);
    setOcupado(false);
    setAviso(null);
    window.dispatchEvent(new Event(EVENTO_ASIGNACIONES));
    await cargar();
  }, [cargar, ocupado]);

  const aceptarTodas = useCallback(async () => {
    if (!data) return;
    // Una operación por vendedor, pero se deshacen juntas.
    const porVendedor = new Map<string, { nombre: string; ids: string[] }>();
    for (const t of data.sinAsignar) {
      if (!t.sugerencia) continue;
      const g = porVendedor.get(t.sugerencia.userId) ?? { nombre: t.sugerencia.nombre, ids: [] };
      g.ids.push(t.id);
      porVendedor.set(t.sugerencia.userId, g);
    }
    if (!porVendedor.size || ocupado) return;
    setOcupado(true);
    const todos: Cambio[] = [];
    for (const [userId, g] of porVendedor) {
      const res = await fetch("/api/asignaciones", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ oportunidadIds: g.ids, userId }),
      }).catch(() => null);
      if (res?.ok) todos.push(...((await res.json()) as { cambios: Cambio[] }).cambios);
    }
    setOcupado(false);
    if (todos.length) {
      pila.current.push(todos);
      setAviso({ texto: `${todos.length} asignadas según la sugerencia`, cambios: todos });
    }
    window.dispatchEvent(new Event(EVENTO_ASIGNACIONES));
    await cargar();
  }, [cargar, data, ocupado]);

  const conSugerencia = useMemo(() => data?.sinAsignar.filter((t) => t.sugerencia).length ?? 0, [data]);
  const r = data?.resumen;

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-6 sm:py-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-[17px] font-bold tracking-tight">
            Asignaciones
            <span className="rounded-full bg-foreground px-2 py-0.5 text-[10px] font-bold tracking-wide text-background">SOLO ADMIN</span>
          </h2>
          <p className="text-xs text-text-3">
            {r
              ? [
                  `${r.sinAsignar} sin asignar`,
                  r.masViejaMin !== null ? `la más vieja espera ${textoEspera(r.masViejaMin)}` : null,
                  `${r.automaticasHoy} asignadas automáticamente en 24 h`,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : "Cargando…"}
          </p>
        </div>
        <button
          type="button"
          disabled={!conSugerencia || ocupado}
          onClick={() => void aceptarTodas()}
          className="rounded-md bg-brand px-3 py-1.5 text-[13px] font-semibold text-brand-fg disabled:opacity-50"
        >
          Aceptar todas las sugerencias ({conSugerencia})
        </button>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2 sm:px-6">
        <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
          <span className="mr-1 text-text-3">Edificio</span>
          {[{ id: "", nombre: "Todos", color: null as string | null }, ...(data?.edificios ?? [])].map((e) => (
            <button
              key={e.id || "todos"}
              type="button"
              onClick={() => setEdificio(e.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1",
                edificio === e.id ? "border-foreground bg-foreground text-background" : "border-border hover:bg-subtle"
              )}
            >
              {e.id && <span className="size-2 rounded-full" style={{ background: tonoDeEdificio(e.color).punto }} />}
              {e.nombre}
            </button>
          ))}
        </div>
        <p className="text-[11.5px] text-text-3">Sugerencia: regla por edificio y, si no hay, el que tiene menos carga.</p>
      </div>

      {error && <p className="mx-4 mt-3 rounded-md bg-danger-tint px-3 py-2 text-sm text-danger-text sm:mx-6">{error}</p>}

      <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-3 sm:p-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="min-h-0 space-y-2.5">
          <div role="tablist" className="inline-flex rounded-full border border-border p-0.5 text-[12.5px]">
            {(
              [
                ["sin", `Sin asignar · ${data?.sinAsignar.length ?? 0}`],
                ["auto", `Asignadas automáticamente · ${data?.automaticas.length ?? 0}`],
              ] as const
            ).map(([k, t]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={pestana === k}
                onClick={() => setPestana(k)}
                className={cn("rounded-full px-3 py-1 font-medium", pestana === k ? "bg-foreground text-background" : "text-text-2")}
              >
                {t}
              </button>
            ))}
          </div>
          {!data ? (
            <p className="text-sm text-text-3">Cargando…</p>
          ) : pestana === "sin" ? (
            data.sinAsignar.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-text-3">Nada sin asignar. 🎉</p>
            ) : (
              data.sinAsignar.map((t) => (
                <Tarjeta
                  key={t.id}
                  t={t}
                  pie={
                    t.sugerencia && (
                      <button
                        type="button"
                        title={`Sugerido: ${t.sugerencia.porque}`}
                        disabled={ocupado}
                        onClick={() => void asignar([t.id], t.sugerencia!, `${t.nombre} → ${t.sugerencia!.nombre}`)}
                        className="inline-flex items-center gap-1 rounded-full bg-brand-tint px-2 py-0.5 text-[11.5px] font-semibold text-brand-ink hover:bg-brand-soft"
                      >
                        → {t.sugerencia.nombre}
                        {(() => {
                          const tecla = data.vendedores.find((v) => v.userId === t.sugerencia!.userId)?.tecla;
                          return tecla ? <kbd className="rounded bg-card px-1 font-mono text-[10px]">{tecla}</kbd> : null;
                        })()}
                      </button>
                    )
                  }
                />
              ))
            )
          ) : data.automaticas.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-text-3">
              Ninguna asignada automáticamente en las últimas 24 h.
            </p>
          ) : (
            data.automaticas.map((t: TarjetaAutomatica) => (
              <Tarjeta
                key={t.id}
                t={t}
                pie={
                  t.corregida ? (
                    <span className="rounded-full bg-[#e0f2fe] px-2 py-0.5 text-[11px] font-semibold text-[#075985]">
                      Corregida → {t.actual.nombre ?? "sin asignar"}
                    </span>
                  ) : (
                    <span className="rounded-full bg-warning-tint px-2 py-0.5 text-[11px] font-semibold text-warning-text">
                      Auto → {t.auto.nombre}
                      {t.edificio ? ` · ${t.edificio.nombre} → ${t.auto.nombre}` : ""}
                    </span>
                  )
                }
              />
            ))
          )}
        </div>

        <div className="space-y-3">
          {data && data.vendedores.length === 0 && (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-text-3">
              Nadie del equipo recibe asignaciones todavía.
            </p>
          )}
          {data?.vendedores.map((v) => (
            <Carril
              key={v.userId}
              v={v}
              tope={data.tope}
              onAsignar={
                data.sinAsignar[0]
                  ? () => void asignar([data.sinAsignar[0]!.id], v, `${data.sinAsignar[0]!.nombre} → ${v.nombre}`)
                  : undefined
              }
            />
          ))}
        </div>
      </div>

      {aviso && (
        <div className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg bg-foreground px-4 py-2.5 text-[13px] text-background shadow-lg">
          <span>{aviso.texto}</span>
          <button type="button" onClick={() => void deshacer()} className="font-semibold underline-offset-2 hover:underline">
            Deshacer
          </button>
        </div>
      )}
    </div>
  );
}
