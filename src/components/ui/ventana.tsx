"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/** Las ventanas abiertas, de abajo hacia arriba: Escape cierra solo la de arriba. */
const pila: symbol[] = [];

/**
 * Una ventana flotante sobre la pantalla (modal): título, cerrar con la X,
 * con Escape o tocando afuera, y el foco adentro al abrir. Lo de adentro
 * decide su contenido y sus botones.
 */
export function Ventana({
  titulo,
  detalle,
  accion,
  onCerrar,
  children,
  className,
  encima = false,
}: {
  titulo: React.ReactNode;
  detalle?: React.ReactNode;
  /** Un botón chico junto al título (por ejemplo, Editar). */
  accion?: React.ReactNode;
  onCerrar: () => void;
  children: React.ReactNode;
  className?: string;
  /** Se abre sobre otra ventana: oscurece menos lo de atrás. */
  encima?: boolean;
}) {
  const id = useId();
  const caja = useRef<HTMLDivElement>(null);
  const cerrar = useRef(onCerrar);
  cerrar.current = onCerrar;

  useEffect(() => {
    const yo = Symbol("ventana");
    pila.push(yo);
    const anterior = document.activeElement as HTMLElement | null;
    const enfocable = caja.current?.querySelector<HTMLElement>("[autofocus], input, select, textarea, button");
    (enfocable ?? caja.current)?.focus();
    const onKey = (e: KeyboardEvent) => {
      // Un desplegable abierto adentro se cierra primero con su propio Escape.
      if (e.key === "Escape" && !e.defaultPrevented && pila.at(-1) === yo) {
        e.preventDefault();
        cerrar.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      pila.splice(pila.indexOf(yo), 1);
      anterior?.focus?.();
    };
  }, []);

  // Va al final del documento: así una ventana abierta desde un formulario no
  // queda adentro de ese formulario, y la de arriba tapa a la de abajo.
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4",
        encima ? "bg-black/25" : "bg-overlay"
      )}
      role="dialog"
      aria-modal="true"
      aria-labelledby={id}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCerrar();
      }}
    >
      <div
        ref={caja}
        tabIndex={-1}
        className={cn(
          "max-h-[92vh] w-full overflow-y-auto rounded-t-xl border bg-popover p-5 shadow-pop outline-none sm:max-w-lg sm:rounded-xl",
          className
        )}
      >
        <div className="mb-4 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h3 id={id} className="text-[16px] font-bold">
              {titulo}
            </h3>
            {detalle && <div className="mt-0.5 text-sm text-text-3">{detalle}</div>}
          </div>
          {accion}
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onCerrar}
            className="-mr-1 -mt-1 grid size-8 place-items-center rounded-md text-text-3 hover:bg-accent hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}
