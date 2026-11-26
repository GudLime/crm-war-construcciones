"use client";

import { Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * 0072 — v6: el horario de visitas de un edificio. Días de la semana y sus
 * franjas, con la misma forma que el horario de la agenda. Vacío = usa el
 * horario general de la Agenda.
 */
export type HorarioVisitas = Partial<Record<Dia, { start: string; end: string }[]>>;
type Dia = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export const DIAS: { key: Dia; corto: string; largo: string }[] = [
  { key: "mon", corto: "Lun", largo: "lunes" },
  { key: "tue", corto: "Mar", largo: "martes" },
  { key: "wed", corto: "Mié", largo: "miércoles" },
  { key: "thu", corto: "Jue", largo: "jueves" },
  { key: "fri", corto: "Vie", largo: "viernes" },
  { key: "sat", corto: "Sáb", largo: "sábado" },
  { key: "sun", corto: "Dom", largo: "domingo" },
];

/** «Lun 10:00–13:00 y 15:00–19:00 · Mar …», o null si no tiene horario propio. */
export function resumenHorario(h: HorarioVisitas | null | undefined): string | null {
  if (!h) return null;
  const partes = DIAS.flatMap((d) => {
    const f = h[d.key] ?? [];
    return f.length ? [`${d.corto} ${f.map((x) => `${x.start}–${x.end}`).join(" y ")}`] : [];
  });
  return partes.length ? partes.join(" · ") : null;
}

export function EditorHorarioVisitas({ valor, onCambio }: { valor: HorarioVisitas; onCambio: (h: HorarioVisitas) => void }) {
  const poner = (d: Dia, franjas: { start: string; end: string }[]) => {
    const next = { ...valor };
    if (franjas.length) next[d] = franjas;
    else delete next[d];
    onCambio(next);
  };
  return (
    <div className="space-y-1.5">
      {DIAS.map((d) => {
        const franjas = valor[d.key] ?? [];
        const abierto = franjas.length > 0;
        return (
          <div key={d.key} className="flex flex-wrap items-center gap-2 text-[13px]">
            <button
              type="button"
              aria-pressed={abierto}
              onClick={() => poner(d.key, abierto ? [] : [{ start: "10:00", end: "18:00" }])}
              className={cn(
                "inline-flex h-7 w-14 items-center justify-center rounded-full border text-[12.5px] font-semibold",
                abierto ? "border-brand bg-brand text-brand-fg" : "border-border bg-card text-text-3 hover:bg-accent"
              )}
            >
              {d.corto}
            </button>
            {!abierto && <span className="text-text-3">Sin visitas</span>}
            {franjas.map((f, i) => (
              <span key={i} className="inline-flex items-center gap-1">
                <Input
                  type="time"
                  aria-label={`Desde (${d.largo})`}
                  value={f.start}
                  onChange={(e) => poner(d.key, franjas.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))}
                  className="h-7 w-[104px] px-2"
                />
                –
                <Input
                  type="time"
                  aria-label={`Hasta (${d.largo})`}
                  value={f.end}
                  onChange={(e) => poner(d.key, franjas.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))}
                  className="h-7 w-[104px] px-2"
                />
                <button
                  type="button"
                  aria-label={`Quitar franja (${d.largo})`}
                  onClick={() => poner(d.key, franjas.filter((_, j) => j !== i))}
                  className="grid size-6 place-items-center rounded-full text-text-3 hover:bg-accent"
                >
                  <X className="size-3.5" />
                </button>
              </span>
            ))}
            {abierto && franjas.length < 4 && (
              <button
                type="button"
                onClick={() => poner(d.key, [...franjas, { start: "15:00", end: "19:00" }])}
                className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-[12px] text-text-2 hover:bg-accent"
              >
                <Plus className="size-3" /> franja
              </button>
            )}
          </div>
        );
      })}
      <p className="text-[11.5px] text-text-3">
        Sin ningún día marcado, el edificio usa el horario general (Configuración → Agenda). Mateo solo ofrece visitas en
        este horario; una persona puede agendar fuera, confirmándolo.
      </p>
    </div>
  );
}
