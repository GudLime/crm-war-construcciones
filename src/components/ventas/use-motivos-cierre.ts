"use client";

import { useEffect, useState } from "react";
import { MOTIVOS_POR_DEFECTO } from "@/lib/motivos-cierre";

/**
 * War — Los motivos de cierre de Ajustes, para los desplegables. Mientras
 * carga (o si falla) usa la lista de siempre, así el desplegable nunca queda
 * vacío. Se pide una vez por página.
 */
let cache: Promise<string[]> | null = null;

function pedir(): Promise<string[]> {
  cache ??= fetch("/api/motivos-cierre")
    .then(async (r) => {
      if (!r.ok) throw new Error(String(r.status));
      const d = (await r.json()) as { motivos: { nombre: string }[] };
      return d.motivos.map((m) => m.nombre);
    })
    .catch(() => {
      cache = null;
      return [...MOTIVOS_POR_DEFECTO];
    });
  return cache;
}

export function useMotivosCierre(): readonly string[] {
  const [motivos, setMotivos] = useState<readonly string[]>(MOTIVOS_POR_DEFECTO);
  useEffect(() => {
    let vivo = true;
    void pedir().then((m) => {
      if (vivo) setMotivos(m);
    });
    return () => {
      vivo = false;
    };
  }, []);
  return motivos;
}
