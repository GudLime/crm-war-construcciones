"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Un menú que se abre desde un botón (ordenar una columna, elegir columnas,
 * agregar un filtro). Se cierra al tocar afuera o con Escape; no es un
 * desplegable de valores: para eso está `Select`.
 */
export function Menu({
  boton,
  children,
  alinear = "izquierda",
  className,
  abierto: abiertoControlado,
  onAbierto,
}: {
  /** Recibe si está abierto y cómo alternarlo. */
  boton: (abierto: boolean, alternar: () => void) => ReactNode;
  children: ReactNode | ((cerrar: () => void) => ReactNode);
  alinear?: "izquierda" | "derecha";
  className?: string;
  abierto?: boolean;
  onAbierto?: (v: boolean) => void;
}) {
  const [abiertoPropio, setAbiertoPropio] = useState(false);
  const abierto = abiertoControlado ?? abiertoPropio;
  const ref = useRef<HTMLSpanElement>(null);
  const setAbierto = (v: boolean) => {
    if (abiertoControlado === undefined) setAbiertoPropio(v);
    onAbierto?.(v);
  };
  const setRef = useRef(setAbierto);
  setRef.current = setAbierto;

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => {
      const t = e.target as Element;
      if (ref.current?.contains(t) || t.closest?.("[data-capa-flotante]")) return;
      setRef.current(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") setRef.current(false);
    };
    document.addEventListener("pointerdown", fuera, true);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("pointerdown", fuera, true);
      document.removeEventListener("keydown", tecla);
    };
  }, [abierto]);

  const cerrar = () => setAbierto(false);
  return (
    <span ref={ref} className="relative inline-flex">
      {boton(abierto, () => setAbierto(!abierto))}
      {abierto && (
        <div
          role="menu"
          className={cn(
            "absolute top-[calc(100%+4px)] z-40 min-w-[210px] rounded-lg border border-border bg-popover p-1.5 text-popover-foreground shadow-pop",
            alinear === "derecha" ? "right-0" : "left-0",
            className
          )}
        >
          {typeof children === "function" ? children(cerrar) : children}
        </div>
      )}
    </span>
  );
}

export function MenuTitulo({ children }: { children: ReactNode }) {
  return (
    <p className="px-2 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-3">{children}</p>
  );
}

export function MenuSeparador() {
  return <div role="separator" className="my-1 h-px bg-border" />;
}

export function MenuItem({
  onClick,
  icono,
  children,
  marcado,
  casilla,
  disabled,
  extra,
}: {
  onClick: () => void;
  icono?: ReactNode;
  children: ReactNode;
  /** Tilde a la derecha (la opción activa). */
  marcado?: boolean;
  /** Casilla a la izquierda (menús de varias opciones). */
  casilla?: boolean;
  disabled?: boolean;
  extra?: ReactNode;
}) {
  return (
    <button
      type="button"
      role={casilla !== undefined ? "menuitemcheckbox" : "menuitem"}
      aria-checked={casilla}
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13.5px] hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
    >
      {casilla !== undefined && (
        <span
          aria-hidden
          className={cn(
            "grid size-4 shrink-0 place-items-center rounded-[4px]",
            casilla ? "bg-brand text-brand-fg" : "border-[1.5px] border-border-strong"
          )}
        >
          {casilla && <Check className="size-3" strokeWidth={3} />}
        </span>
      )}
      {icono && <span className="grid shrink-0 place-items-center text-text-3">{icono}</span>}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {extra}
      {marcado && <Check aria-hidden className="size-4 shrink-0 text-brand-ink" />}
    </button>
  );
}
