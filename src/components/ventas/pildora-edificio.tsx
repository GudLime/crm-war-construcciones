import Link from "next/link";
import { tonoDeEdificio } from "@/lib/colores-edificio";
import { cn } from "@/lib/utils";

/**
 * Un edificio como píldora: punto de su color, fondo con tinte y texto oscuro
 * del mismo tono. Con `href` es un link (a la página del edificio).
 */
export function PildoraEdificio({
  nombre,
  color,
  href,
  className,
}: {
  nombre: string;
  color: string | null | undefined;
  href?: string;
  className?: string;
}) {
  const tono = tonoDeEdificio(color);
  const estilo = {
    "--pe-punto": tono.punto,
    "--pe-fondo": tono.fondo,
    "--pe-texto": tono.texto,
  } as React.CSSProperties;
  const clase = cn(
    "pildora-edificio inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12.5px] font-semibold",
    href && "hover:brightness-95",
    className
  );
  const contenido = (
    <>
      <span aria-hidden className="size-[7px] shrink-0 rounded-full" style={{ background: tono.punto }} />
      <span className="truncate">{nombre}</span>
    </>
  );
  return href ? (
    <Link href={href} className={clase} style={estilo}>
      {contenido}
    </Link>
  ) : (
    <span className={clase} style={estilo}>
      {contenido}
    </span>
  );
}

/** Para avatares con iniciales en el color del edificio. */
export function estiloDeEdificio(color: string | null | undefined): React.CSSProperties {
  const tono = tonoDeEdificio(color);
  return { "--pe-punto": tono.punto, "--pe-fondo": tono.fondo, "--pe-texto": tono.texto } as React.CSSProperties;
}
