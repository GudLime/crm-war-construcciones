"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Calendario de un mes, propio (sin el `<input type="date">` del navegador).
 * La semana empieza el lunes. Elige un día (`valor`) o, con `rango`, marca un
 * rango [desde, hasta]. Las fechas son AAAA-MM-DD.
 */

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];
const DIAS = ["lu", "ma", "mi", "ju", "vi", "sá", "do"];

function iso(a: number, m: number, d: number): string {
  return `${a}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function hoyISO(): string {
  const d = new Date();
  return iso(d.getFullYear(), d.getMonth(), d.getDate());
}

export function sumarDias(fecha: string, dias: number): string {
  const [a, m, d] = fecha.split("-").map(Number) as [number, number, number];
  const x = new Date(a, m - 1, d + dias);
  return iso(x.getFullYear(), x.getMonth(), x.getDate());
}

export function Calendario({
  valor,
  onElegir,
  rango,
  deshabilitarAntesDe,
  deshabilitarDespuesDe,
  className,
}: {
  /** El día elegido (o el mes que se abre). */
  valor: string | null;
  onElegir: (fecha: string) => void;
  /** Para marcar un rango: los extremos en oscuro, el medio en gris. */
  rango?: { desde: string | null; hasta: string | null };
  deshabilitarAntesDe?: string;
  deshabilitarDespuesDe?: string;
  className?: string;
}) {
  const base = valor ?? rango?.hasta ?? rango?.desde ?? hoyISO();
  const [a0, m0] = base.split("-").map(Number) as [number, number];
  const [mes, setMes] = useState({ a: a0, m: m0 - 1 });
  const hoy = hoyISO();

  const primero = new Date(mes.a, mes.m, 1);
  const offset = (primero.getDay() + 6) % 7; // lunes = 0
  const enMes = new Date(mes.a, mes.m + 1, 0).getDate();
  const celdas: { fecha: string; delMes: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const x = new Date(mes.a, mes.m, 1 - offset + i);
    celdas.push({ fecha: iso(x.getFullYear(), x.getMonth(), x.getDate()), delMes: x.getMonth() === mes.m });
  }
  const filas = Math.ceil((offset + enMes) / 7);
  const mover = (n: number) => setMes((s) => ({ a: s.m + n < 0 ? s.a - 1 : s.m + n > 11 ? s.a + 1 : s.a, m: (s.m + n + 12) % 12 }));

  return (
    <div className={cn("w-[252px] select-none", className)}>
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => mover(-1)}
          aria-label="Mes anterior"
          className="grid size-7 place-items-center rounded-md hover:bg-accent"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="text-[13px] font-semibold capitalize">
          {MESES[mes.m]} {mes.a}
        </span>
        <button
          type="button"
          onClick={() => mover(1)}
          aria-label="Mes siguiente"
          className="grid size-7 place-items-center rounded-md hover:bg-accent"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {DIAS.map((d) => (
          <span key={d} className="pb-1 text-[11px] font-medium text-text-3">
            {d}
          </span>
        ))}
        {celdas.slice(0, filas * 7).map(({ fecha, delMes }) => {
          const deshabilitado =
            (deshabilitarAntesDe && fecha < deshabilitarAntesDe) || (deshabilitarDespuesDe && fecha > deshabilitarDespuesDe);
          const extremo = fecha === valor || fecha === rango?.desde || fecha === rango?.hasta;
          const medio = rango?.desde && rango?.hasta && fecha > rango.desde && fecha < rango.hasta;
          return (
            <button
              key={fecha}
              type="button"
              disabled={Boolean(deshabilitado)}
              onClick={() => onElegir(fecha)}
              aria-pressed={extremo}
              aria-label={fecha.split("-").reverse().join("/")}
              className={cn(
                "h-8 rounded-md text-[12.5px] tabular-nums transition-colors",
                extremo
                  ? "bg-foreground font-semibold text-background"
                  : medio
                    ? "bg-muted"
                    : "hover:bg-accent",
                !delMes && !extremo && "text-text-3 opacity-60",
                deshabilitado && "cursor-not-allowed opacity-35 hover:bg-transparent",
                fecha === hoy && !extremo && "underline underline-offset-4"
              )}
            >
              {Number(fecha.slice(8))}
            </button>
          );
        })}
      </div>
    </div>
  );
}
