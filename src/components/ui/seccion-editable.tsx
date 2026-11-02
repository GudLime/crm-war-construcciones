"use client";

import { Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Sección que se ve plegada (solo lectura) y se despliega para editar con el
 * lápiz. El patrón del CRM: nada se edita sin tocar el lápiz, y al guardar se
 * vuelve a plegar (con el aviso de «Cambios aplicados»).
 */
export function SeccionEditable({
  titulo,
  descripcion,
  resumen,
  editando,
  onEditar,
  onCancelar,
  children,
  className,
  etiquetaEditar,
}: {
  titulo: React.ReactNode;
  descripcion?: React.ReactNode;
  /** Lo que se ve plegado. */
  resumen: React.ReactNode;
  editando: boolean;
  onEditar: () => void;
  onCancelar: () => void;
  /** El formulario, desplegado. */
  children: React.ReactNode;
  className?: string;
  etiquetaEditar?: string;
}) {
  return (
    <section className={cn("mb-5 rounded-lg border bg-card p-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{titulo}</h3>
          {descripcion && <p className="mt-0.5 text-xs text-text-3">{descripcion}</p>}
        </div>
        {editando ? (
          <Button size="sm" variant="ghost" onClick={onCancelar} aria-label="Cerrar sin guardar">
            <X className="h-4 w-4" strokeWidth={1.8} />
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={onEditar}
            aria-label={etiquetaEditar ?? "Editar"}
            title={etiquetaEditar ?? "Editar"}
          >
            <Pencil className="h-3.5 w-3.5" strokeWidth={1.8} />
            Editar
          </Button>
        )}
      </div>
      <div className="mt-3">{editando ? children : resumen}</div>
    </section>
  );
}

/** Pares etiqueta/valor para el resumen plegado. Lo vacío se muestra como «—». */
export function Resumen({
  items,
  className,
}: {
  items: { etiqueta: string; valor: React.ReactNode; ancho?: boolean }[];
  className?: string;
}) {
  return (
    <dl className={cn("grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3", className)}>
      {items.map((it) => (
        <div key={it.etiqueta} className={cn("min-w-0", it.ancho && "sm:col-span-2 lg:col-span-3")}>
          <dt className="text-[11px] font-medium uppercase tracking-wide text-text-3">{it.etiqueta}</dt>
          <dd className="mt-0.5 whitespace-pre-line break-words text-sm text-foreground">
            {it.valor === null || it.valor === undefined || it.valor === "" ? (
              <span className="text-text-3">—</span>
            ) : (
              it.valor
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
