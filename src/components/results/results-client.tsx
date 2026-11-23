"use client";

import { useEffect, useState } from "react";
import type { HygieneBlockDto, SalesBlockDto } from "@/lib/analytics";
import { parametrosResultados, rangoDeAtajo, FECHAS_POR_DEFECTO } from "@/lib/resultados";
import { BarraResultados, type EstadoBarra } from "./barra-resultados";
import { HygieneSection } from "./hygiene-section";
import { OportunidadesResumen } from "./oportunidades-resumen";
import type { EstadisticasOportunidadesDto } from "@/lib/estadisticas-oportunidades";
import { SalesSection } from "./sales-section";
import { useVocabulario } from "@/components/vocabulario";
import { nombrePantalla } from "@/lib/vocabulario";

type Block<T> = { data: T | null; loading: boolean; error: string | null };

const inicial = <T,>(): Block<T> => ({ data: null, loading: true, error: null });

/**
 * Pide un bloque y lo deja en su estado. Mientras llega, CONSERVA lo anterior
 * (la sección lo atenúa): vaciar en cada cambio de rango haría saltar la
 * pantalla. Una respuesta que llega tarde, de un rango que ya no es el
 * elegido, se descarta con el `AbortSignal`.
 */
async function cargar<T>(
  url: string,
  set: (update: (prev: Block<T>) => Block<T>) => void,
  signal: AbortSignal
): Promise<void> {
  set((prev) => ({ ...prev, loading: true, error: null }));
  let res: Response;
  try {
    res = await fetch(url, { signal });
  } catch {
    if (signal.aborted) return;
    set(() => ({ data: null, loading: false, error: "No se pudo cargar. Revisa tu conexión." }));
    return;
  }
  const body = (await res.json().catch(() => null)) as
    | (T & { error?: { message?: string } })
    | null;
  if (signal.aborted) return;
  if (!res.ok || !body) {
    set(() => ({
      data: null,
      loading: false,
      error: body?.error?.message ?? "No se pudo calcular este bloque.",
    }));
    return;
  }
  set(() => ({ data: body, loading: false, error: null }));
}

/**
 * 019 — Pantalla Resultados.
 *
 * Cada bloque carga por su cuenta: son una veintena de consultas repartidas en
 * cuatro grupos, y en una sola respuesta el más lento retrasaría a los tres
 * rápidos. Así la pantalla pinta en cascada y un bloque roto muestra su propio
 * error sin tumbar el resto.
 */
export function ResultsClient({
  currency,
  today,
  admin = true,
}: {
  /** Visibilidad por rol: el operador ve solo las estadísticas de sus oportunidades. */
  admin?: boolean;
  currency: string;
  agenda: boolean;
  /** Hoy en la zona del negocio (`YYYY-MM-DD`), resuelto en el servidor. */
  today: string;
  timezone: string;
}) {
  const voc = useVocabulario();
  // Rediseño — la barra de período, edificio y filtros manda en toda la página.
  const [barra, setBarra] = useState<EstadoBarra>(() => ({
    rango: rangoDeAtajo(FECHAS_POR_DEFECTO, today),
    edificioIds: [],
    filtros: {},
  }));
  const [sales, setSales] = useState<Block<SalesBlockDto>>(inicial);
  const [hygiene, setHygiene] = useState<Block<HygieneBlockDto>>(inicial);
  const [ops, setOps] = useState<Block<EstadisticasOportunidadesDto>>(inicial);

  useEffect(() => {
    const ctl = new AbortController();
    if (!admin) return () => ctl.abort();
    // «Origen y anuncios» y «El agente» salieron por ahora (sus endpoints siguen).
    const q = parametrosResultados(barra.rango, barra.edificioIds, barra.filtros);
    void cargar(`/api/analytics/sales?${q.toString()}`, setSales, ctl.signal);
    return () => ctl.abort();
  }, [barra, admin]);

  // Paso 7 — Oportunidades: depende del rango y de «Ver por» / filtros.
  useEffect(() => {
    const ctl = new AbortController();
    const p = parametrosResultados(barra.rango, barra.edificioIds, barra.filtros);
    // Sin agrupar: los gráficos y el embudo siguen a la pestaña de Edificio.
    p.set("verPor", "");
    void cargar(`/api/analytics/oportunidades?${p.toString()}`, setOps, ctl.signal);
    return () => ctl.abort();
  }, [barra]);

  // La higiene describe el AHORA: no depende del rango elegido.
  useEffect(() => {
    const ctl = new AbortController();
    if (admin) void cargar("/api/analytics/hygiene", setHygiene, ctl.signal);
    return () => ctl.abort();
  }, [admin]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-6 sm:py-4">
        <div className="min-w-0">
          <h2 className="text-[17px] font-bold tracking-tight">{nombrePantalla(voc, "results", "Resultados")}</h2>
          <p className="text-xs text-text-3">
            {voc.plural}, ventas y qué se está cayendo.
          </p>
        </div>
      </header>
      <BarraResultados hoy={today} admin={admin} valor={barra} onCambio={setBarra} />

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3 sm:p-6">
        <OportunidadesResumen {...ops} />
        {admin && (
          <>
            <SalesSection {...sales} currency={currency} />
            <HygieneSection {...hygiene} currency={currency} />
          </>
        )}
      </div>
    </div>
  );
}
