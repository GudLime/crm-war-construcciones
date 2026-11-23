"use client";

import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import type { GrupoEstadisticasDto } from "@/lib/estadisticas-oportunidades";
import { cicloPromedio, conversionTotal, etapasDelEmbudo, tonoDeAvance } from "@/lib/embudo-resultados";
import { cn } from "@/lib/utils";
import { colorDeEtapa } from "@/lib/colores-etapa";

/**
 * Resultados — «Embudo por etapa»: fila de totales (una columna por etapa con
 * el número, el % sobre la anterior y sobre el total), las bandas del embudo y
 * la pastilla de conversión total y ciclo. Funnel | Tabla.
 */

const TONO = {
  verde: "bg-[#dcfce7] text-[#166534]",
  ambar: "bg-[#fef3c7] text-[#92400e]",
  rojo: "bg-[#fee2e2] text-[#991b1b]",
} as const;

const ALTO = 220;
const MEDIO = ALTO / 2;

export function EmbudoEtapas({ total }: { total: GrupoEstadisticasDto }) {
  const [vista, setVista] = useState<"funnel" | "tabla">("funnel");
  const etapas = etapasDelEmbudo(total.embudo);
  const n = etapas.length;
  const ciclo = cicloPromedio(total.tiempos);
  const ancho = 1000;
  const col = n ? ancho / n : ancho;

  // Cada banda: plana el primer 60% y baja en curva hasta la altura de la siguiente.
  const bandas = etapas.map((e, i) => {
    const x0 = i * col;
    const x1 = (i + 1) * col;
    const xp = x0 + col * 0.6;
    const h0 = e.alto / 2;
    const h1 = (etapas[i + 1]?.alto ?? e.alto) / 2;
    const cx = xp + (x1 - xp) / 2;
    const d = [
      `M ${x0} ${MEDIO - h0}`,
      `L ${xp} ${MEDIO - h0}`,
      `C ${cx} ${MEDIO - h0}, ${cx} ${MEDIO - h1}, ${x1} ${MEDIO - h1}`,
      `L ${x1} ${MEDIO + h1}`,
      `C ${cx} ${MEDIO + h1}, ${cx} ${MEDIO + h0}, ${xp} ${MEDIO + h0}`,
      `L ${x0} ${MEDIO + h0}`,
      "Z",
    ].join(" ");
    return { d, e, i };
  });

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-bold tracking-tight">Embudo por etapa</h3>
          <p className="text-[12.5px] text-text-3">
            Cuántos llegaron al menos hasta cada etapa, de las que entraron en el período.
          </p>
        </div>
        <div role="tablist" className="inline-flex rounded-full border border-border p-0.5 text-[12.5px]">
          {(["funnel", "tabla"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={vista === v}
              onClick={() => setVista(v)}
              className={cn("rounded-full px-3 py-1 font-medium", vista === v ? "bg-foreground text-background" : "text-text-2 hover:text-foreground")}
            >
              {v === "funnel" ? "Funnel" : "Tabla"}
            </button>
          ))}
        </div>
      </header>

      {vista === "tabla" ? (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="border-b bg-secondary/40">
              <tr className="text-xs text-text-3">
                <th className="px-3 py-2 text-left font-medium">Etapa</th>
                <th className="px-3 py-2 text-right font-medium">Llegaron</th>
                <th className="px-3 py-2 text-right font-medium">Del total</th>
                <th className="px-3 py-2 text-right font-medium">De la anterior</th>
                <th className="px-3 py-2 text-right font-medium">Mediana en la etapa</th>
              </tr>
            </thead>
            <tbody>
              {etapas.map((e) => {
                const t = total.tiempos.find((x) => x.estado === e.estado);
                return (
                  <tr key={e.estado} className="border-b last:border-0">
                    <td className="px-3 py-2 font-medium">{e.nombre}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{e.n}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{e.delTotal === null ? "—" : `${e.delTotal}%`}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{e.deLaAnterior === null ? "—" : `${e.deLaAnterior}%`}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {t?.medianaDias == null ? "—" : `${t.medianaDias.toLocaleString("es-AR")} d`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div className="grid" style={{ gridTemplateColumns: `repeat(${Math.max(n, 1)}, minmax(0, 1fr))` }}>
            {etapas.map((e, i) => {
              const tono = tonoDeAvance(e.deLaAnterior);
              const anterior = etapas[i - 1];
              return (
                <div key={e.estado} className={cn("min-w-0 px-3 py-1", i > 0 && "border-l border-border")}>
                  <p className="truncate text-[12px] text-text-3">{e.nombre}</p>
                  <p className="font-mono text-[28px] font-bold leading-tight">{e.n}</p>
                  <p className="flex flex-wrap items-center gap-1.5 text-[11.5px]">
                    {i === 0 ? (
                      <span className="text-text-3">100% · punto de partida</span>
                    ) : (
                      <>
                        <span
                          className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold", tono ? TONO[tono] : "bg-muted text-text-3")}
                          title={
                            anterior && e.deLaAnterior !== null
                              ? `${e.deLaAnterior}% de los que llegaron a ${anterior.nombre} pasaron a ${e.nombre}`
                              : undefined
                          }
                        >
                          <ArrowLeft className="size-3" />
                          {e.deLaAnterior === null ? "—" : `${e.deLaAnterior}%`}
                        </span>
                        <span className="text-text-3">{e.delTotal === null ? "" : `${e.delTotal}% del total`}</span>
                      </>
                    )}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="relative pb-5">
            <div className="relative overflow-hidden rounded-lg bg-[#f8fafc] dark:bg-subtle" style={{ height: ALTO }}>
              <svg viewBox={`0 0 ${ancho} ${ALTO}`} preserveAspectRatio="none" className="absolute inset-0 size-full" aria-hidden>
                {bandas.map((b) => (
                  <path key={b.e.estado} d={b.d} fill={colorDeEtapa(b.e.estado).solido} />
                ))}
                {bandas.slice(1).map((b) => (
                  <line key={`s-${b.e.estado}`} x1={b.i * col} x2={b.i * col} y1={0} y2={ALTO} stroke="white" strokeWidth={3} vectorEffect="non-scaling-stroke" />
                ))}
              </svg>
              <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${Math.max(n, 1)}, minmax(0, 1fr))` }}>
                {bandas.map((b) => {
                  // Punto 5 — cada banda en el color de su etapa; el texto, el que va sobre ese sólido.
                  const dentro = b.e.alto >= 36;
                  return (
                    <div key={b.e.estado} className="flex min-w-0 flex-col justify-center px-2.5">
                      {b.e.alto >= 30 ? (
                        <div
                          className={cn("text-[11.5px] leading-tight", !dentro && "text-foreground")}
                          style={dentro ? { color: colorDeEtapa(b.e.estado).sobreSolido } : undefined}
                        >
                          <p className="font-semibold">{b.e.delTotal === null ? "—" : `${b.e.delTotal}% del total`}</p>
                          {b.e.deLaAnterior !== null && <p className="opacity-90">← {b.e.deLaAnterior}% de la anterior</p>}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="absolute inset-x-0 bottom-0 flex justify-center">
              <span className="rounded-full border border-border bg-card px-4 py-1.5 text-[12.5px] shadow-sm">
                Conversión total: <strong className="font-semibold">{conversionTotal(total.compraron, total.entraron)}</strong>{" "}
                <span className="text-text-3">
                  ({total.compraron} de {total.entraron})
                </span>
                <span className="mx-2 text-text-3">|</span>
                Ciclo promedio: <strong className="font-semibold">{ciclo === null ? "—" : `${ciclo} días`}</strong>
              </span>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
