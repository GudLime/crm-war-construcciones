import { iconoDeOrigen } from "@/lib/origenes";
import { cn } from "@/lib/utils";

/** El ícono de un origen (Configuración → Orígenes). Clave desconocida: etiqueta. */
export function OrigenIcono({ icono, className }: { icono: string | null | undefined; className?: string }) {
  const Icono = iconoDeOrigen(icono);
  return <Icono aria-hidden className={cn("size-4 shrink-0 text-text-2", className)} />;
}
