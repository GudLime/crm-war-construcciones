import { iconoDeOrigen } from "@/lib/origenes";
import { cn } from "@/lib/utils";

/**
 * El ícono de un origen (Configuración → Orígenes): su imagen propia si la
 * tiene (el logo de Zonaprop…), si no el de la librería. Clave desconocida:
 * etiqueta.
 */
export function OrigenIcono({
  icono,
  imagen,
  className,
}: {
  icono: string | null | undefined;
  imagen?: string | null;
  className?: string;
}) {
  if (imagen) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- imagen privada servida con sesión; no hay host que optimizar
      <img
        src={imagen}
        alt=""
        aria-hidden
        className={cn("size-4 shrink-0 rounded-[3px] object-contain", className)}
      />
    );
  }
  const Icono = iconoDeOrigen(icono);
  return <Icono aria-hidden className={cn("size-4 shrink-0 text-text-2", className)} />;
}
