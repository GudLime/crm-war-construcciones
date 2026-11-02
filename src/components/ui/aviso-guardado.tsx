"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Aviso temporal de «Cambios aplicados» (o de error), abajo y al centro de la
 * pantalla, que se va solo a los pocos segundos. Uno a la vez: el último
 * reemplaza al anterior. Se usa con `useAvisoGuardado()` desde cualquier
 * pantalla de la app (el proveedor está en el layout).
 */

type Aviso = { id: number; texto: string; tipo: "ok" | "error" };
type Avisar = (texto?: string, tipo?: "ok" | "error") => void;

const Contexto = createContext<Avisar>(() => {});

export function useAvisoGuardado(): Avisar {
  return useContext(Contexto);
}

const DURACION_MS = 3000;

export function AvisoGuardadoProvider({ children }: { children: React.ReactNode }) {
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const avisar = useCallback<Avisar>((texto = "Cambios aplicados", tipo = "ok") => {
    if (timer.current) clearTimeout(timer.current);
    setAviso({ id: Date.now(), texto, tipo });
    timer.current = setTimeout(() => setAviso(null), tipo === "error" ? DURACION_MS * 2 : DURACION_MS);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  return (
    <Contexto.Provider value={avisar}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4"
      >
        {aviso && (
          <div
            key={aviso.id}
            role={aviso.tipo === "error" ? "alert" : "status"}
            className={cn(
              "pointer-events-auto flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium shadow-lg",
              "animate-in fade-in slide-in-from-bottom-2",
              aviso.tipo === "ok"
                ? "border-success-soft bg-success-tint text-success-text"
                : "border-danger-soft bg-danger-tint text-danger-text"
            )}
          >
            {aviso.tipo === "ok" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" strokeWidth={2} />
            ) : (
              <XCircle className="h-4 w-4 shrink-0" strokeWidth={2} />
            )}
            {aviso.texto}
          </div>
        )}
      </div>
    </Contexto.Provider>
  );
}
