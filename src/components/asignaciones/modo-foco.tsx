"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import {
  accionDeTecla,
  iniciales,
  ordenDeFoco,
  textoEspera,
  type TarjetaAsignacion,
  type VendedorAsignacion,
} from "@/lib/asignaciones";
import { esCampoDeTexto } from "@/lib/atajos";
import { tonoDeEdificio } from "@/lib/colores-edificio";
import { etiqueta, TIPOS_OPORTUNIDAD } from "@/lib/ventas";
import { cn } from "@/lib/utils";

/**
 * Asignaciones — modo foco (`claude/asignaciones.md` §3): una tarjeta por vez,
 * estilo Tinder. → o Enter la da al sugerido, ← la manda al final, 1–9 a ese
 * vendedor, Z deshace y Esc vuelve a la mesa.
 */

type Salida = "derecha" | "izquierda" | "abajo";
const MS_SALIDA = 200;

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

export function ModoFoco({
  tarjetas,
  vendedores,
  onAsignar,
  onDeshacer,
  onSalir,
}: {
  tarjetas: TarjetaAsignacion[];
  vendedores: VendedorAsignacion[];
  onAsignar: (t: TarjetaAsignacion, v: { userId: string; nombre: string }) => void;
  onDeshacer: () => void;
  onSalir: () => void;
}) {
  const [saltadas, setSaltadas] = useState<string[]>([]);
  const [hechas, setHechas] = useState(0);
  // Las ya asignadas desde acá salen de la fila sin esperar a que la mesa recargue.
  const [idas, setIdas] = useState<Set<string>>(() => new Set());
  const [salida, setSalida] = useState<Salida | null>(null);
  const animando = useRef(false);

  const cola = useMemo(() => ordenDeFoco(tarjetas, saltadas).filter((t) => !idas.has(t.id)), [tarjetas, saltadas, idas]);
  const actual = cola[0] ?? null;
  const total = hechas + cola.length;
  const sugerido = actual?.sugerencia ? vendedores.find((v) => v.userId === actual.sugerencia!.userId) : undefined;

  // La tarjeta sale (~200 ms) hacia donde va y recién ahí se asigna o se salta.
  const despues = (s: Salida, hacer: () => void) => {
    if (animando.current) return;
    animando.current = true;
    setSalida(s);
    window.setTimeout(() => {
      hacer();
      setSalida(null);
      animando.current = false;
    }, MS_SALIDA);
  };

  const asignar = (v: { userId: string; nombre: string }, s: Salida = "abajo") => {
    if (!actual) return;
    const t = actual;
    despues(s, () => {
      setHechas((n) => n + 1);
      setIdas((prev) => new Set(prev).add(t.id));
      onAsignar(t, v);
    });
  };
  const aceptar = () => {
    if (actual?.sugerencia) asignar(actual.sugerencia, "derecha");
  };
  const saltar = () => {
    if (!actual || cola.length < 2) return;
    const id = actual.id;
    despues("izquierda", () => setSaltadas((prev) => [...prev.filter((x) => x !== id), id]));
  };

  const ref = useRef({ asignar, aceptar, saltar, onDeshacer, onSalir, vendedores });
  ref.current = { asignar, aceptar, saltar, onDeshacer, onSalir, vendedores };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (esCampoDeTexto(e.target) || document.querySelector('[role="dialog"]')) return;
      const a = accionDeTecla(e);
      if (!a) return;
      const h = ref.current;
      if (a.tipo === "vendedor") {
        const v = h.vendedores.find((x) => x.tecla === a.tecla);
        if (v) h.asignar(v);
      } else if (a.tipo === "aceptar") {
        if (e.key === "Enter" && (e.target as HTMLElement | null)?.closest?.("button, a")) return;
        h.aceptar();
      } else if (a.tipo === "saltar") h.saltar();
      else if (a.tipo === "deshacer") {
        // Lo deshecho vuelve a la fila cuando la mesa recarga.
        setHechas((n) => Math.max(0, n - 1));
        setIdas(new Set());
        h.onDeshacer();
      } else if (a.tipo === "soltar" || a.tipo === "foco") h.onSalir();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const transformSalida =
    salida === "derecha"
      ? "translate-x-[120%] rotate-6 opacity-0"
      : salida === "izquierda"
        ? "-translate-x-[120%] -rotate-6 opacity-0"
        : salida === "abajo"
          ? "translate-y-[60%] scale-90 opacity-0"
          : "";

  if (!actual) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-10 text-center">
        <p className="text-[40px]">🎉</p>
        <h3 className="text-[20px] font-bold">¡Todo asignado!</h3>
        <button type="button" onClick={onSalir} className="rounded-md bg-brand px-4 py-2 text-[13.5px] font-semibold text-brand-fg">
          Volver a la mesa
        </button>
      </div>
    );
  }

  const tono = tonoDeEdificio(actual.edificio?.color);
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-[720px] px-4 pt-5">
        <div className="flex items-center justify-between text-[12.5px] text-text-3">
          <span>
            <strong className="text-foreground">
              {hechas + 1} de {total}
            </strong>{" "}
            · quedan {cola.length}
          </span>
          <button type="button" onClick={onSalir} className="hover:underline">
            Volver a la mesa <Kbd>Esc</Kbd>
          </button>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${total ? (hechas / total) * 100 : 0}%` }} />
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-[760px] items-center justify-center gap-5 px-4 py-8">
        <button
          type="button"
          onClick={saltar}
          disabled={cola.length < 2}
          title="Saltar (la manda al final)"
          className="grid size-14 shrink-0 place-items-center rounded-full border border-border bg-card shadow-sm hover:bg-subtle disabled:opacity-40"
        >
          <ArrowLeft className="size-5" />
          <span className="sr-only">Saltar</span>
        </button>

        <div className="relative h-[330px] w-full max-w-[520px]">
          {cola[2] && <div className="absolute inset-0 translate-y-4 rotate-[3deg] scale-[0.92] rounded-[20px] border border-border bg-card opacity-60" />}
          {cola[1] && <div className="absolute inset-0 translate-y-2 -rotate-[2deg] scale-[0.96] rounded-[20px] border border-border bg-card opacity-80" />}
          <article
            key={actual.id}
            className={cn(
              "absolute inset-0 flex flex-col rounded-[20px] border border-border bg-card p-6 shadow-lg transition-all duration-200 ease-out",
              transformSalida
            )}
          >
            <div className="flex flex-wrap items-center gap-2 text-[12px]">
              {actual.tipo && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10.5px] font-semibold uppercase text-text-2">
                  {etiqueta(TIPOS_OPORTUNIDAD, actual.tipo)}
                </span>
              )}
              {actual.edificio && (
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium" style={{ background: tono.fondo, color: tono.texto }}>
                  <span className="size-1.5 rounded-full" style={{ background: tono.punto }} />
                  {actual.edificio.nombre}
                </span>
              )}
              <span className="ml-auto text-text-3">{textoEspera(actual.esperaMin)}</span>
            </div>
            <h3 className="mt-4 truncate text-[26px] font-bold tracking-tight">{actual.nombre}</h3>
            <p className="mt-1 text-[13px] text-text-3">
              {[actual.origen, actual.ambientes.length ? `${actual.ambientes.join(", ")} amb.` : null, actual.telefono]
                .filter(Boolean)
                .join(" · ") || "Sin datos"}
            </p>
            {actual.ultimoMensaje ? (
              <p className="mt-4 line-clamp-3 rounded-2xl rounded-tl-sm bg-muted px-4 py-3 text-[14px]">{actual.ultimoMensaje}</p>
            ) : (
              <p className="mt-4 text-[13px] text-text-3">Todavía no escribió.</p>
            )}
            <p className="mt-auto pt-4 text-[12.5px] text-text-3">
              {actual.sugerencia ? (
                <>
                  Sugerido: <strong className="font-semibold text-foreground">{actual.sugerencia.porque}</strong>
                </>
              ) : (
                "Sin sugerencia: elegí a quién con 1–9."
              )}
            </p>
          </article>
        </div>

        <button
          type="button"
          onClick={aceptar}
          disabled={!actual.sugerencia}
          title={actual.sugerencia ? `A ${actual.sugerencia.nombre} (→ o Enter)` : "Sin sugerencia"}
          className="flex shrink-0 flex-col items-center gap-1 disabled:opacity-40"
        >
          <span className="grid size-14 place-items-center rounded-full bg-brand text-brand-fg shadow-md">
            <ArrowRight className="size-5" />
          </span>
          <span className="max-w-[90px] truncate text-[11.5px] font-medium">
            {actual.sugerencia ? `A ${actual.sugerencia.nombre.split(" ")[0]}` : "—"}
          </span>
        </button>
      </div>

      <div className="mx-auto grid w-full max-w-[900px] gap-2.5 px-4 sm:grid-cols-2 lg:grid-cols-4">
        {vendedores.map((v) => {
          const esSugerido = sugerido?.userId === v.userId;
          return (
            <button
              key={v.userId}
              type="button"
              onClick={() => asignar(v)}
              className={cn(
                "relative flex items-center gap-2.5 rounded-xl border-2 bg-card p-3 text-left hover:bg-subtle",
                esSugerido ? "border-brand" : "border-border"
              )}
            >
              {esSugerido && (
                <span className="absolute -top-2 right-3 rounded-full bg-brand px-1.5 text-[10px] font-bold text-brand-fg">Sugerido</span>
              )}
              {v.tecla !== null && <Kbd>{v.tecla}</Kbd>}
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-tint text-[12px] font-bold text-brand-ink">
                {iniciales(v.nombre)}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13.5px] font-semibold">{v.nombre}</span>
                <span
                  className={cn(
                    "block text-[11.5px]",
                    v.carga.nivel === "normal" ? "text-text-3" : v.carga.nivel === "alta" ? "text-warning-text" : "text-danger-text"
                  )}
                >
                  {v.abiertas} abiertas · {v.carga.pct}% · {v.carga.nivel}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-auto flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 bg-[#0f172a] px-4 py-2 text-[12px] text-white/80">
        {vendedores
          .filter((v) => v.tecla !== null)
          .map((v) => (
            <span key={v.userId} className="inline-flex items-center gap-1.5">
              <Kbd oscuro>{v.tecla}</Kbd>
              {v.nombre.split(" ")[0]}
            </span>
          ))}
        <span className="inline-flex items-center gap-1.5">
          <Kbd oscuro>→</Kbd>o<Kbd oscuro>Enter</Kbd> Aceptar
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Kbd oscuro>←</Kbd> Saltar
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Kbd oscuro>Z</Kbd> Deshacer
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Kbd oscuro>Esc</Kbd> Volver a la mesa
        </span>
      </div>
    </div>
  );
}
