/* eslint-disable @next/next/no-img-element -- el icono de la marca, ya chico y servido por el CRM */
import { cn } from "@/lib/utils";

/**
 * v7 — El loguito de la empresa junto al nombre de un contacto que es de la
 * empresa (tipo «propio»): queda fuera de la IA, las oportunidades y
 * Resultados. Usa el icono de la marca (Configuración → Marca).
 */
export function LogoEmpresa({ className }: { className?: string }) {
  return (
    <img
      src="/api/branding/favicon"
      alt="De la empresa"
      title="De la empresa: fuera de la IA, las oportunidades y Resultados"
      className={cn("size-3.5 shrink-0 rounded-[3px] object-contain", className)}
    />
  );
}
