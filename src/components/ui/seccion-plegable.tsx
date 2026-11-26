"use client";

import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * v5 — Una sección del panel del chat que se abre y se cierra al tocar su
 * título. Arranca plegada: el panel muestra solo lo que se usa siempre (la IA
 * y los botones de acción) y el resto se abre cuando hace falta. El
 * `resumen` se ve con la sección cerrada (por ejemplo, la etapa).
 */
export function SeccionPlegable({
  titulo,
  resumen,
  abiertaAlInicio = false,
  children,
  className,
}: {
  titulo: string;
  resumen?: ReactNode;
  abiertaAlInicio?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const [abierta, setAbierta] = useState(abiertaAlInicio);
  return (
    <section className={cn("border-b", className)}>
      <button
        type="button"
        aria-expanded={abierta}
        onClick={() => setAbierta((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-accent"
      >
        <ChevronRight
          className={cn("size-4 shrink-0 text-text-3 transition-transform", abierta && "rotate-90")}
          strokeWidth={1.8}
        />
        <span className="kicker shrink-0">{titulo}</span>
        {resumen && !abierta && <span className="min-w-0 flex-1 truncate text-right text-[12px] text-text-3">{resumen}</span>}
      </button>
      {abierta && <div className="px-4 pb-4">{children}</div>}
    </section>
  );
}
