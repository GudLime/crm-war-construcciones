"use client";

import { useEffect, useRef, useState } from "react";
import { Pipette } from "lucide-react";
import { COLORES_EDIFICIO, esVerdoso, HEX_COLOR, tonoDeEdificio, VALORES_COLOR_EDIFICIO } from "@/lib/colores-edificio";
import { cn } from "@/lib/utils";
import { PildoraEdificio } from "./pildora-edificio";

/**
 * El color de un edificio: los de la paleta con un clic, u «Otro color…» con
 * el selector del navegador o pegando el código (`#rrggbb`). La píldora de al
 * lado muestra cómo queda.
 */
export function SelectorColor({
  valor,
  onCambio,
  nombre,
}: {
  valor: string;
  onCambio: (color: string) => void;
  nombre: string;
}) {
  const propio = HEX_COLOR.test(valor) ? valor.toLowerCase() : null;
  const [codigo, setCodigo] = useState(propio ?? "");
  const selector = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (propio) setCodigo(propio);
  }, [propio]);

  const elegirCodigo = (texto: string) => {
    const limpio = texto.trim().startsWith("#") ? texto.trim() : `#${texto.trim()}`;
    setCodigo(texto);
    if (HEX_COLOR.test(limpio)) onCambio(limpio.toLowerCase());
  };

  return (
    <div className="space-y-2.5">
      <div role="radiogroup" aria-label="Color del edificio" className="flex flex-wrap items-center gap-1.5">
        {VALORES_COLOR_EDIFICIO.map((c) => {
          const tono = COLORES_EDIFICIO[c];
          const elegido = valor === c;
          return (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={elegido}
              aria-label={tono.nombre}
              title={tono.nombre}
              onClick={() => onCambio(c)}
              className={cn(
                "grid size-8 place-items-center rounded-full border-2",
                elegido ? "border-foreground" : "border-transparent hover:border-border-strong"
              )}
            >
              <span className="size-5 rounded-full" style={{ background: tono.punto }} />
            </button>
          );
        })}
        <button
          type="button"
          role="radio"
          aria-checked={Boolean(propio)}
          title="Otro color…"
          onClick={() => selector.current?.click()}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-full border-2 px-2.5 text-[12.5px] font-medium",
            propio ? "border-foreground" : "border-border hover:border-border-strong"
          )}
        >
          {propio ? (
            <span className="size-4 rounded-full" style={{ background: propio }} />
          ) : (
            <Pipette className="size-3.5" aria-hidden />
          )}
          Otro color…
        </button>
        <input
          ref={selector}
          type="color"
          tabIndex={-1}
          aria-hidden
          value={propio ?? tonoDeEdificio(valor).punto}
          onChange={(e) => onCambio(e.target.value.toLowerCase())}
          className="sr-only"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={codigo}
          onChange={(e) => elegirCodigo(e.target.value)}
          placeholder="#14b8a6"
          maxLength={7}
          spellCheck={false}
          aria-label="Código del color"
          className="h-8 w-28 rounded-md border border-input bg-background px-2.5 font-mono text-[12.5px]"
        />
        <PildoraEdificio nombre={nombre} color={valor || null} />
        {propio && esVerdoso(propio) && (
          <span className="text-[12px] text-warning-text">Ojo: un verde se puede confundir con el color del avance.</span>
        )}
      </div>
    </div>
  );
}
