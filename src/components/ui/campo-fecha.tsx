"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { Calendario, hoyISO, sumarDias } from "@/components/ui/calendario";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

/**
 * v2, punto 2 — La fecha de una tarea o una cita en UN solo campo («Hoy · jue
 * 12 · 14:50», «Ayer · mié 11 · sin hora»). Al tocarlo abre el calendario del
 * mes con «Agregar hora» (opcional) y «Quitar fecha» / «Listo». Cambiar la
 * fecha es reprogramar.
 *
 * El valor es `AAAA-MM-DDTHH:mm` (hora local del navegador, como el resto de
 * los formularios) o null. Sin hora se guarda a las 00:00 y se muestra
 * «sin hora».
 */
const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

export function textoDeFecha(valor: string | null, hoy = hoyISO()): string {
  if (!valor) return "Sin fecha";
  const [dia, hora] = valor.split("T") as [string, string | undefined];
  const d = new Date(`${dia}T12:00:00`);
  const relativo = dia === hoy ? "Hoy" : dia === sumarDias(hoy, -1) ? "Ayer" : dia === sumarDias(hoy, 1) ? "Mañana" : null;
  const base = `${DIAS[d.getDay()]} ${d.getDate()}`;
  const h = !hora || hora.startsWith("00:00") ? "sin hora" : hora.slice(0, 5);
  return [relativo, base, h].filter(Boolean).join(" · ");
}

export function CampoFecha({
  valor,
  onCambio,
  permitirSinFecha = true,
  disabled = false,
  enLinea = false,
}: {
  valor: string | null;
  onCambio: (v: string | null) => void;
  permitirSinFecha?: boolean;
  disabled?: boolean;
  /** Dentro de una ventana con scroll: el calendario se abre debajo, sin flotar. */
  enLinea?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [dia, setDia] = useState<string | null>(null);
  const [conHora, setConHora] = useState(false);
  const [hora, setHora] = useState("10:00");
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const [d, h] = (valor ?? "").split("T") as [string, string | undefined];
    setDia(d || hoyISO());
    const tiene = Boolean(h && !h.startsWith("00:00"));
    setConHora(tiene);
    setHora(tiene ? h!.slice(0, 5) : "10:00");
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [abierto, valor]);

  return (
    <div ref={caja} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setAbierto((v) => !v)}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-[13px] hover:bg-accent disabled:opacity-60",
          !valor && "text-text-3"
        )}
      >
        <CalendarDays className="size-3.5 text-text-3" />
        {textoDeFecha(valor)}
      </button>
      {abierto && (
        <div className={cn("w-[290px] space-y-3 rounded-xl border border-border bg-popover p-3 shadow-pop", enLinea ? "mt-2" : "absolute left-0 top-9 z-50")}>
          <Calendario valor={dia} onElegir={setDia} />
          <div className="flex items-center justify-between gap-2 text-[13px]">
            <Switch checked={conHora} onCheckedChange={setConHora} label="Agregar hora" />
            <span className="mr-auto">Agregar hora</span>
            {conHora && (
              <input
                type="time"
                value={hora}
                onChange={(e) => setHora(e.target.value)}
                aria-label="Hora"
                className="h-8 rounded-md border border-input bg-background px-2 text-[13px]"
              />
            )}
          </div>
          <div className="flex items-center justify-between gap-2 border-t pt-2.5">
            {permitirSinFecha ? (
              <button
                type="button"
                onClick={() => {
                  onCambio(null);
                  setAbierto(false);
                }}
                className="text-[12.5px] text-text-2 hover:underline"
              >
                Quitar fecha
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={() => {
                if (dia) onCambio(`${dia}T${conHora ? hora : "00:00"}`);
                setAbierto(false);
              }}
              className="rounded-md bg-brand px-3 py-1 text-[12.5px] font-semibold text-brand-fg"
            >
              Listo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
