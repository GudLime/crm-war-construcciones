"use client";

import { useState } from "react";

/**
 * Resultados — gráfico circular (aro) con el total en el centro y la leyenda
 * a la derecha: cuadradito de color, nombre, % con un decimal y cantidad. Al
 * pasar el mouse por una porción (o por su fila) se ve «Lavalle: 52 (60,5%)».
 */

export type Porcion = { clave: string; nombre: string; n: number; color: string };

const pct1 = (n: number, total: number) =>
  `${(total ? (n / total) * 100 : 0).toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

function arco(cx: number, cy: number, r: number, desde: number, hasta: number): string {
  const p = (a: number) => [cx + r * Math.sin(a), cy - r * Math.cos(a)] as const;
  const [x1, y1] = p(desde);
  const [x2, y2] = p(hasta);
  const largo = hasta - desde > Math.PI ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${largo} 1 ${x2} ${y2}`;
}

export function Dona({
  porciones,
  etiquetaCentro,
  tamano = 180,
  grosor = 26,
  vacio = "Sin datos en el período",
}: {
  porciones: Porcion[];
  etiquetaCentro: string;
  tamano?: number;
  grosor?: number;
  vacio?: string;
}) {
  const [encima, setEncima] = useState<string | null>(null);
  const total = porciones.reduce((s, p) => s + p.n, 0);
  const r = (tamano - grosor) / 2;
  const c = tamano / 2;
  let a = 0;
  const activa = porciones.find((p) => p.clave === encima);

  return (
    <div className="flex flex-wrap items-center gap-5">
      <div className="relative shrink-0" style={{ width: tamano, height: tamano }}>
        <svg width={tamano} height={tamano} viewBox={`0 0 ${tamano} ${tamano}`} role="img" aria-label={`${total} ${etiquetaCentro}`}>
          <circle cx={c} cy={c} r={r} fill="none" stroke="var(--border)" strokeWidth={grosor} opacity={total ? 0 : 1} />
          {total > 0 &&
            porciones.map((p) => {
              const ang = (p.n / total) * Math.PI * 2;
              const desde = a;
              a += ang;
              const hasta = a;
              const titulo = `${p.nombre}: ${p.n} (${pct1(p.n, total)})`;
              // Un aro completo no se dibuja con un arco: va un círculo.
              return ang >= Math.PI * 2 - 1e-6 ? (
                <circle key={p.clave} cx={c} cy={c} r={r} fill="none" stroke={p.color} strokeWidth={grosor}>
                  <title>{titulo}</title>
                </circle>
              ) : (
                <path
                  key={p.clave}
                  d={arco(c, c, r, desde, Math.max(desde, hasta - 0.008))}
                  fill="none"
                  stroke={p.color}
                  strokeWidth={encima === p.clave ? grosor + 4 : grosor}
                  onMouseEnter={() => setEncima(p.clave)}
                  onMouseLeave={() => setEncima(null)}
                  className="transition-[stroke-width] duration-150"
                >
                  <title>{titulo}</title>
                </path>
              );
            })}
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="font-mono text-[30px] font-bold leading-none">{activa ? activa.n : total}</p>
            <p className="mt-1 max-w-[110px] truncate text-[12px] text-text-3">{activa ? activa.nombre : etiquetaCentro}</p>
          </div>
        </div>
      </div>
      {total === 0 ? (
        <p className="text-sm text-text-3">{vacio}</p>
      ) : (
        <ul className="min-w-[160px] flex-1 space-y-1.5 text-[13px]">
          {porciones.map((p) => (
            <li
              key={p.clave}
              className="flex items-center gap-2"
              onMouseEnter={() => setEncima(p.clave)}
              onMouseLeave={() => setEncima(null)}
              title={`${p.nombre}: ${p.n} (${pct1(p.n, total)})`}
            >
              <span className="size-2.5 shrink-0 rounded-sm" style={{ background: p.color }} />
              <span className="min-w-0 flex-1 truncate">{p.nombre}</span>
              <span className="tabular-nums text-text-3">{pct1(p.n, total)}</span>
              <span className="w-8 text-right font-mono font-semibold tabular-nums">{p.n}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
