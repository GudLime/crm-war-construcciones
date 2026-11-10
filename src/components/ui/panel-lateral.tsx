"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

/** Un panel que entra desde la derecha, sobre la página. Escape o el fondo lo cierran. */
export function PanelLateral({
  titulo,
  onCerrar,
  children,
  pie,
}: {
  titulo: ReactNode;
  onCerrar: () => void;
  children: ReactNode;
  pie?: ReactNode;
}) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [onCerrar]);
  return (
    <>
      <div aria-hidden className="fixed inset-0 z-40 bg-overlay" onClick={onCerrar} />
      <aside
        role="dialog"
        aria-modal="true"
        className="fixed inset-y-0 right-0 z-50 flex w-[min(400px,94vw)] flex-col border-l bg-popover shadow-pop motion-safe:animate-[panel-entrada_160ms_ease-out]"
      >
        <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0 flex-1">{titulo}</div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="rounded p-1 text-text-3 hover:bg-accent hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto">{children}</div>
        {pie && <footer className="border-t p-3">{pie}</footer>}
      </aside>
    </>
  );
}
