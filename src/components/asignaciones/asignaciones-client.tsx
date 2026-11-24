"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpDown, GripVertical, Zap } from "lucide-react";
import {
  accionDeTecla,
  agruparPorSugerencia,
  EVENTO_ASIGNACIONES,
  iniciales,
  objetivoDe,
  textoDeAviso,
  textoEspera,
  tonoEspera,
  type AsignacionesDto,
  type Cambio,
  type TarjetaAsignacion,
  type TarjetaAutomatica,
  type VendedorAsignacion,
} from "@/lib/asignaciones";
import { esCampoDeTexto } from "@/lib/atajos";
import { tonoDeEdificio } from "@/lib/colores-edificio";
import { etiqueta, TIPOS_OPORTUNIDAD } from "@/lib/ventas";
import { useEvents } from "@/components/use-events";
import { ModoFoco } from "./modo-foco";
import { cn } from "@/lib/utils";

/**
 * Asignaciones (solo admin) — la mesa de reparto (`claude/asignaciones.md` §2):
 * a la izquierda las que esperan (Sin asignar · Asignadas automáticamente) y a
 * la derecha un carril por vendedor con su carga. Se asigna arrastrando, con el
 * chip de la sugerencia o con el teclado (1–9, Enter); todo se deshace con Z.
 */

type Grupo = { userId: string; nombre: string; ids: string[] };
type Aviso = { texto: string; id: number };

const TONO_ESPERA = { normal: "text-text-3", ambar: "text-warning-text", rojo: "text-danger-text" } as const;
const TONO_CARGA = { normal: "bg-brand", alta: "bg-[#f59e0b]", saturada: "bg-[#ef4444]" } as const;
const TIPO_ARRASTRE = "application/x-vocero-oportunidades";

function Kbd({ children, oscuro = false }: { children: React.ReactNode; oscuro?: boolean }) {
  return (
    <kbd
      className={cn(
        "inline-flex min-w-[20px] items-center justify-center rounded border px-1.5 font-mono text-[11px] font-semibold leading-[18px]",
        oscuro ? "border-white/20 bg-white/10 text-white" : "border-border bg-muted text-foreground"
      )}
    >
      {children}
    </kbd>
  );
}

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
  elegida,
  pie,
  onClick,
  onDragStart,
  onDragEnd,
}: {
  t: TarjetaAsignacion;
  elegida: boolean;
  pie: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  const tono = tonoEspera(t.esperaMin);
  return (
    <article
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      data-elegida={elegida || undefined}
      className={cn(
        "cursor-grab select-none rounded-xl border-2 bg-card p-3 shadow-sm transition-colors active:cursor-grabbing",
        elegida ? "border-brand" : "border-transparent outline outline-1 outline-border"
      )}
    >
      <div className="flex items-center gap-1.5">
        <GripVertical className="size-3.5 shrink-0 text-text-3" aria-hidden />
        {t.tipo && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase text-text-2">
            {etiqueta(TIPOS_OPORTUNIDAD, t.tipo)}
          </span>
        )}
        <Link
          href={`/oportunidades/${t.id}`}
          onClick={(e) => e.stopPropagation()}
          className="min-w-0 flex-1 truncate text-[13.5px] font-semibold hover:underline"
        >
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

function Carril({
  v,
  otros,
  tope,
  sobre,
  pulso,
  onDragOver,
  onDragLeave,
  onDrop,
  onPasar,
}: {
  v: VendedorAsignacion;
  otros: VendedorAsignacion[];
  tope: number;
  sobre: boolean;
  pulso: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onPasar: (oportunidadId: string, nombre: string, a: VendedorAsignacion) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <section
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        "rounded-xl border bg-card p-3 transition-all duration-150",
        sobre ? "scale-[1.01] border-2 border-dashed border-brand bg-brand-tint" : "border-border"
      )}
    >
      <header className="flex flex-wrap items-center gap-3">
        <span className="relative grid size-10 shrink-0 place-items-center rounded-full bg-brand-tint text-[12.5px] font-bold text-brand-ink">
          {pulso && <span className="absolute inset-0 animate-ping rounded-full bg-brand opacity-40" />}
          {iniciales(v.nombre)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-[14px] font-semibold">
            <span className="truncate">{v.nombre}</span>
            {v.tecla !== null && <Kbd>{v.tecla}</Kbd>}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <span className="h-1.5 w-32 overflow-hidden rounded-full bg-muted">
              <span className={cn("block h-full rounded-full transition-[width]", TONO_CARGA[v.carga.nivel])} style={{ width: `${Math.min(100, v.carga.pct)}%` }} />
            </span>
            <span className={cn("text-[11.5px]", v.carga.nivel === "normal" ? "text-text-3" : v.carga.nivel === "alta" ? "text-warning-text" : "text-danger-text")}>
              Carga {v.carga.pct}% · {v.carga.nivel}
            </span>
          </div>
        </div>
        <dl className="flex gap-4 text-center text-[11px] text-text-3">
          <div>
            <dd className="font-mono text-[16px] font-semibold text-foreground">
              {v.abiertas}
              <span className="text-[11px] font-normal text-text-3">/{tope}</span>
            </dd>
            <dt>abiertas</dt>
          </div>
          <div>
            <dd className={cn("font-mono text-[16px] font-semibold", v.sinContactar >= 5 ? "text-danger-text" : "text-foreground")}>{v.sinContactar}</dd>
            <dt>sin contactar</dt>
          </div>
          <div>
            <dd className="font-mono text-[16px] font-semibold text-foreground">{v.visitasHoy}</dd>
            <dt>visitas hoy</dt>
          </div>
        </dl>
      </header>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {v.asignadasHoy.length === 0 ? (
          <span className="w-full rounded-lg border border-dashed border-border py-2 text-center text-[12px] text-text-3">Soltá acá para asignar</span>
        ) : (
          <>
            {v.asignadasHoy.slice(0, 4).map((a) => (
              <Link
                key={a.id}
                href={`/oportunidades/${a.id}`}
                className="inline-flex max-w-[200px] items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11.5px] hover:bg-subtle"
              >
                <span className="size-1.5 shrink-0 rounded-full" style={{ background: tonoDeEdificio(a.edificio?.color).punto }} />
                <span className="truncate">{a.nombre}</span>
                {a.auto && <Zap className="size-3 shrink-0 text-warning-text" aria-label="automática" />}
              </Link>
            ))}
            {v.asignadasHoy.length > 4 && <span className="text-[11.5px] text-text-3">+{v.asignadasHoy.length - 4} más</span>}
            <button
              type="button"
              onClick={() => setAbierto((x) => !x)}
              className="ml-auto text-[12px] font-medium text-brand-ink hover:underline"
            >
              {abierto ? "Cerrar" : `Ver y reasignar (${v.asignadasHoy.length})`}
            </button>
          </>
        )}
      </div>
      {abierto && v.asignadasHoy.length > 0 && (
        <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
          {v.asignadasHoy.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-2 px-2.5 py-1.5 text-[12.5px]">
              <span className="size-1.5 rounded-full" style={{ background: tonoDeEdificio(a.edificio?.color).punto }} />
              <Link href={`/oportunidades/${a.id}`} className="min-w-0 flex-1 truncate hover:underline">
                {a.nombre}
              </Link>
              {a.auto && <span className="text-[11px] text-warning-text">auto</span>}
              <span className="text-[11px] text-text-3">pasar a:</span>
              {otros.map((o) => (
                <button
                  key={o.userId}
                  type="button"
                  onClick={() => onPasar(a.id, a.nombre, o)}
                  className="rounded-full border border-border px-2 py-0.5 text-[11px] hover:bg-subtle"
                >
                  {o.tecla ? `${o.tecla} · ` : ""}
                  {o.nombre.split(" ")[0]}
                </button>
              ))}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function AsignacionesClient() {
  const [data, setData] = useState<AsignacionesDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [edificio, setEdificio] = useState("");
  const [pestana, setPestana] = useState<"sin" | "auto">("sin");
  const [modo, setModo] = useState<"mesa" | "foco">("mesa");
  const [elegidas, setElegidas] = useState<Set<string>>(() => new Set());
  const [sobre, setSobre] = useState<string | null>(null);
  const [pulso, setPulso] = useState<string | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const ocupado = useRef(false);
  const arrastradas = useRef<string[]>([]);
  // Pila de deshacer de la sesión: cada entrada, una operación (una o varias).
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
    const alVolver = () => {
      if (document.visibilityState === "visible") void cargar();
    };
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

  useEffect(() => {
    if (!pulso) return;
    const t = window.setTimeout(() => setPulso(null), 700);
    return () => window.clearTimeout(t);
  }, [pulso]);

  /** v3 — Ordenar por llegada: de más nueva a más vieja, o al revés. */
  const [orden, setOrden] = useState<"nuevas" | "viejas">("nuevas");
  useEffect(() => {
    try {
      const o = window.localStorage.getItem("vocero:asignaciones:orden");
      if (o === "nuevas" || o === "viejas") setOrden(o);
    } catch {
      // sin almacenamiento
    }
  }, []);
  const ordenar = useCallback(
    (ts: TarjetaAsignacion[]) =>
      [...ts].sort((a, b) => (orden === "nuevas" ? b.creadaAt.localeCompare(a.creadaAt) : a.creadaAt.localeCompare(b.creadaAt))),
    [orden]
  );
  const lista: TarjetaAsignacion[] = useMemo(
    () => ordenar(pestana === "sin" ? (data?.sinAsignar ?? []) : (data?.automaticas ?? [])),
    [data, pestana, ordenar]
  );
  const nombreDe = useMemo(() => new Map(lista.map((t) => [t.id, t.nombre])), [lista]);

  // Al cambiar de pestaña o de datos, la selección solo guarda lo que sigue en la lista.
  useEffect(() => {
    setElegidas((prev) => {
      const ids = new Set(lista.map((t) => t.id));
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [lista]);

  /** Asigna cada grupo (una llamada por vendedor) y lo guarda como UNA operación para deshacer. */
  const asignar = useCallback(
    async (grupos: Grupo[], nombres: string[]) => {
      const validos = grupos.filter((g) => g.ids.length);
      if (!validos.length || ocupado.current) return;
      ocupado.current = true;
      const todos: Cambio[] = [];
      let fallo = false;
      for (const g of validos) {
        const res = await fetch("/api/asignaciones", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ oportunidadIds: g.ids, userId: g.userId }),
        }).catch(() => null);
        if (res?.ok) todos.push(...((await res.json()) as { cambios: Cambio[] }).cambios);
        else fallo = true;
      }
      ocupado.current = false;
      if (fallo) setError("Alguna no se pudo asignar. Probá de nuevo.");
      if (todos.length) {
        pila.current.push(todos);
        setAviso({ texto: textoDeAviso(nombres, validos.map((g) => g.nombre)), id: Date.now() });
        if (validos.length === 1) setPulso(validos[0]!.userId);
      }
      setElegidas(new Set());
      window.dispatchEvent(new Event(EVENTO_ASIGNACIONES));
      await cargar();
    },
    [cargar]
  );

  const deshacer = useCallback(async () => {
    if (ocupado.current) return;
    const cambios = pila.current.pop();
    if (!cambios) return;
    ocupado.current = true;
    const res = await fetch("/api/asignaciones/deshacer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cambios }),
    }).catch(() => null);
    ocupado.current = false;
    if (!res?.ok) {
      pila.current.push(cambios);
      setError("No se pudo deshacer. Probá de nuevo.");
      return;
    }
    setAviso({ texto: cambios.length === 1 ? "Se deshizo el cambio" : `Se deshicieron ${cambios.length} cambios`, id: Date.now() });
    window.dispatchEvent(new Event(EVENTO_ASIGNACIONES));
    await cargar();
  }, [cargar]);

  const aVendedor = useCallback(
    (ids: string[], v: { userId: string; nombre: string }) =>
      void asignar([{ userId: v.userId, nombre: v.nombre, ids }], ids.map((id) => nombreDe.get(id) ?? "")),
    [asignar, nombreDe]
  );

  const aceptarSugerencias = useCallback(
    (tarjetas: TarjetaAsignacion[]) => void asignar(agruparPorSugerencia(tarjetas), tarjetas.filter((t) => t.sugerencia).map((t) => t.nombre)),
    [asignar]
  );

  // Teclado (§2.3): los números van a las elegidas o, sin ninguna, a la de arriba.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // En foco manda su propio teclado.
      if (modo === "foco") return;
      if (esCampoDeTexto(e.target) || document.querySelector('[role="dialog"]')) return;
      const a = accionDeTecla(e);
      if (!a || !data) return;
      const objetivo = objetivoDe(lista, elegidas);
      if (a.tipo === "vendedor") {
        const v = data.vendedores.find((x) => x.tecla === a.tecla);
        if (!v || !objetivo.length) return;
        e.preventDefault();
        aVendedor(
          objetivo.map((t) => t.id),
          v
        );
      } else if (a.tipo === "aceptar" && e.key === "Enter" && pestana === "sin") {
        // Enter sobre un botón o un enlace es de ese botón.
        if ((e.target as HTMLElement | null)?.closest?.("button, a")) return;
        if (!objetivo.length) return;
        e.preventDefault();
        aceptarSugerencias(objetivo);
      } else if (a.tipo === "deshacer") {
        e.preventDefault();
        void deshacer();
      } else if (a.tipo === "soltar") {
        setElegidas(new Set());
      } else if (a.tipo === "foco") {
        e.preventDefault();
        setModo("foco");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [aVendedor, aceptarSugerencias, data, deshacer, elegidas, lista, modo, pestana]);

  const elegir = (id: string, e: React.MouseEvent) => {
    setElegidas((prev) => {
      if (e.shiftKey) {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }
      return prev.size === 1 && prev.has(id) ? new Set() : new Set([id]);
    });
  };

  const empezarArrastre = (t: TarjetaAsignacion, e: React.DragEvent) => {
    const ids = elegidas.has(t.id) ? lista.filter((x) => elegidas.has(x.id)).map((x) => x.id) : [t.id];
    arrastradas.current = ids;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData(TIPO_ARRASTRE, JSON.stringify(ids));
    e.dataTransfer.setData("text/plain", ids.length === 1 ? t.nombre : `${ids.length} oportunidades`);
  };

  const soltarEn = (v: VendedorAsignacion, e: React.DragEvent) => {
    e.preventDefault();
    setSobre(null);
    let ids = arrastradas.current;
    try {
      const crudo = e.dataTransfer.getData(TIPO_ARRASTRE);
      if (crudo) ids = JSON.parse(crudo) as string[];
    } catch {
      // Se queda con lo que guardó al empezar.
    }
    arrastradas.current = [];
    if (ids.length) aVendedor(ids, v);
  };

  const r = data?.resumen;
  const conSugerencia = data?.sinAsignar.filter((t) => t.sugerencia).length ?? 0;
  const teclas = (data?.vendedores ?? []).filter((v) => v.tecla !== null);

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
        <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" className="inline-flex rounded-full border border-border p-0.5 text-[12.5px]">
          {(
            [
              ["mesa", "Mesa"],
              ["foco", "Foco · F"],
            ] as const
          ).map(([k, t]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={modo === k}
              onClick={() => setModo(k)}
              className={cn("rounded-full px-3 py-1 font-medium", modo === k ? "bg-foreground text-background" : "text-text-2")}
            >
              {t}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={!conSugerencia}
          onClick={() => data && aceptarSugerencias(data.sinAsignar)}
          className="rounded-md bg-brand px-3 py-1.5 text-[13px] font-semibold text-brand-fg disabled:opacity-50"
        >
          Aceptar todas las sugerencias ({conSugerencia})
        </button>
        </div>
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
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => {
              const o = orden === "nuevas" ? "viejas" : "nuevas";
              setOrden(o);
              try {
                window.localStorage.setItem("vocero:asignaciones:orden", o);
              } catch {
                // sin almacenamiento
              }
            }}
            title="Cambiar el orden por llegada"
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[12.5px] font-medium hover:bg-subtle"
          >
            <ArrowUpDown className="size-3.5" />
            {orden === "nuevas" ? "Más nuevas primero" : "Más viejas primero"}
          </button>
          <p className="text-[11.5px] text-text-3">Sugerencia: regla por edificio y, si no hay, el que tiene menos carga.</p>
        </div>
      </div>

      {error && <p className="mx-4 mt-3 rounded-md bg-danger-tint px-3 py-2 text-sm text-danger-text sm:mx-6">{error}</p>}

      {modo === "foco" && data ? (
        <ModoFoco
          tarjetas={ordenar(data.sinAsignar)}
          vendedores={data.vendedores}
          onAsignar={(t, v) => void asignar([{ userId: v.userId, nombre: v.nombre, ids: [t.id] }], [t.nombre])}
          onDeshacer={() => void deshacer()}
          onSalir={() => setModo("mesa")}
        />
      ) : (
        <>
          {/* Barra de teclado (§2.3): siempre visible, con el nombre al lado de cada número. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 bg-[#0f172a] px-4 py-2 text-[12px] text-white/80 sm:px-6">
            {teclas.map((v) => (
              <span key={v.userId} className="inline-flex items-center gap-1.5">
                <Kbd oscuro>{v.tecla}</Kbd>
                {v.nombre.split(" ")[0]}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5">
              <Kbd oscuro>Enter</Kbd> Aceptar sugerencia
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Kbd oscuro>Shift</Kbd>+clic Elegir varias
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Kbd oscuro>Z</Kbd> Deshacer
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Kbd oscuro>Esc</Kbd> Soltar
            </span>
            <span className="ml-auto text-[11.5px] text-white/60">
              Los números van a la tarjeta elegida o, si no elegiste ninguna, a la de arriba de todo.
            </span>
          </div>


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

              {elegidas.size > 0 && (
                <div className="flex items-center justify-between gap-2 rounded-lg bg-brand-tint px-3 py-2 text-[12.5px] text-brand-ink">
                  <span>
                    <strong>{elegidas.size} elegida{elegidas.size === 1 ? "" : "s"}</strong> · apretá 1–{Math.max(1, teclas.length)} o arrastralas juntas
                  </span>
                  <button type="button" onClick={() => setElegidas(new Set())} className="font-semibold hover:underline">
                    Soltar
                  </button>
                </div>
              )}

              {!data ? (
                <p className="text-sm text-text-3">Cargando…</p>
              ) : lista.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-text-3">
                  {pestana === "sin" ? "Nada sin asignar. 🎉" : "Ninguna asignada automáticamente en las últimas 24 h."}
                </p>
              ) : (
                lista.map((t) => {
                  const auto = pestana === "auto" ? (t as TarjetaAutomatica) : null;
                  const tecla = t.sugerencia ? data.vendedores.find((v) => v.userId === t.sugerencia!.userId)?.tecla : null;
                  return (
                    <Tarjeta
                      key={t.id}
                      t={t}
                      elegida={elegidas.has(t.id)}
                      onClick={(e) => elegir(t.id, e)}
                      onDragStart={(e) => empezarArrastre(t, e)}
                      onDragEnd={() => {
                        arrastradas.current = [];
                        setSobre(null);
                      }}
                      pie={
                        auto ? (
                          auto.corregida ? (
                            <span className="rounded-full bg-[#e0f2fe] px-2 py-0.5 text-[11px] font-semibold text-[#075985]">
                              Corregida → {auto.actual.nombre ?? "sin asignar"}
                            </span>
                          ) : (
                            <span className="truncate rounded-full bg-warning-tint px-2 py-0.5 text-[11px] font-semibold text-warning-text">
                              Auto → {auto.auto.nombre}
                              {t.edificio ? ` · ${t.edificio.nombre} → ${auto.auto.nombre.split(" ")[0]}` : ""}
                            </span>
                          )
                        ) : t.sugerencia ? (
                          <button
                            type="button"
                            title={`Sugerido: ${t.sugerencia.porque}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              aceptarSugerencias([t]);
                            }}
                            className="inline-flex items-center gap-1 rounded-full bg-brand-tint px-2 py-0.5 text-[11.5px] font-semibold text-brand-ink hover:bg-brand-soft"
                          >
                            → {t.sugerencia.nombre.split(" ")[0]}
                            {tecla ? <Kbd>{tecla}</Kbd> : null}
                          </button>
                        ) : null
                      }
                    />
                  );
                })
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
                  otros={data.vendedores.filter((o) => o.userId !== v.userId)}
                  tope={data.tope}
                  sobre={sobre === v.userId}
                  pulso={pulso === v.userId}
                  onDragOver={(e) => {
                    if (!arrastradas.current.length && !e.dataTransfer.types.includes(TIPO_ARRASTRE)) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    if (sobre !== v.userId) setSobre(v.userId);
                  }}
                  onDragLeave={() => setSobre((s) => (s === v.userId ? null : s))}
                  onDrop={(e) => soltarEn(v, e)}
                  onPasar={(id, nombre, a) => void asignar([{ userId: a.userId, nombre: a.nombre, ids: [id] }], [nombre])}
                />
              ))}
            </div>
          </div>

        </>
      )}

      {aviso && (
        <div
          key={aviso.id}
          role="status"
          className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg bg-[#0f172a] px-4 py-2.5 text-[13px] text-white shadow-lg"
        >
          <span>{aviso.texto}</span>
          {pila.current.length > 0 && (
            <button type="button" onClick={() => void deshacer()} className="inline-flex items-center gap-1.5 font-semibold hover:underline">
              Deshacer <Kbd oscuro>Z</Kbd>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
