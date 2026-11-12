"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { OrigenIcono } from "@/components/ventas/origen-icono";
import { cn } from "@/lib/utils";

type OrigenDelMenu = { id: string; nombre: string; icono: string; imagen: string | null; abiertas: number };

const GUARDADO = "nav.origenes.abierto";

/** Las subpáginas de Oportunidades por origen, para la barra lateral. */
export function useOrigenesDelMenu(pathname: string) {
  const [origenes, setOrigenes] = useState<OrigenDelMenu[]>([]);
  const [abierto, setAbierto] = useState(true);
  useEffect(() => {
    try {
      const g = window.localStorage.getItem(GUARDADO);
      if (g === "0") setAbierto(false);
    } catch {
      // sin almacenamiento
    }
  }, []);
  // Las cantidades se refrescan al entrar a Oportunidades (no en cada página).
  const enOportunidades = pathname === "/oportunidades" || pathname.startsWith("/oportunidades/");
  useEffect(() => {
    void fetch("/api/oportunidades/por-origen")
      .then((r) => (r.ok ? r.json() : { origenes: [] }))
      .then((d: { origenes: OrigenDelMenu[] }) => setOrigenes(d.origenes ?? []))
      .catch(() => undefined);
  }, [enOportunidades]);
  function alternar() {
    setAbierto((a) => {
      try {
        window.localStorage.setItem(GUARDADO, a ? "0" : "1");
      } catch {
        // sin almacenamiento
      }
      return !a;
    });
  }
  return { origenes, abierto, alternar };
}

/** La flechita que abre y cierra el hilo de orígenes, al lado de «Oportunidades». */
export function FlechaOrigenes({
  abierto,
  onAlternar,
  activo,
}: {
  abierto: boolean;
  onAlternar: () => void;
  activo: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onAlternar();
      }}
      aria-label={abierto ? "Ocultar los orígenes" : "Ver las oportunidades por origen"}
      aria-expanded={abierto}
      className={cn(
        "absolute right-1.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md transition-colors",
        activo ? "text-brand-fg hover:bg-brand-veil" : "text-text-3 hover:bg-accent hover:text-foreground"
      )}
    >
      <ChevronDown className={cn("size-3.5 transition-transform", !abierto && "-rotate-90")} strokeWidth={2} />
    </button>
  );
}

/**
 * El hilo bajo «Oportunidades»: un ítem por origen (Configuración → Orígenes,
 * en su orden) con su ícono y cuántas abiertas tiene. El activo va en el
 * acento sólido.
 */
export function HiloOrigenes({ origenes, pathname }: { origenes: OrigenDelMenu[]; pathname: string }) {
  if (origenes.length === 0) return null;
  return (
    <div className="ml-[19px] flex flex-col gap-0.5 border-l border-border py-0.5 pl-2">
      {origenes.map((o) => {
        const href = `/oportunidades/origen/${o.id}`;
        const activo = pathname === href;
        return (
          <Link
            key={o.id}
            href={href}
            aria-current={activo ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              activo ? "bg-brand text-brand-fg" : "text-text-2 hover:bg-accent hover:text-foreground"
            )}
          >
            <OrigenIcono
              icono={o.icono}
              imagen={o.imagen}
              className={cn("size-3.5", activo && !o.imagen && "text-brand-fg")}
            />
            <span className="min-w-0 flex-1 truncate">{o.nombre}</span>
            <span className={cn("font-mono text-[11px]", activo ? "text-brand-fg opacity-80" : "text-text-3")}>{o.abiertas}</span>
          </Link>
        );
      })}
    </div>
  );
}
