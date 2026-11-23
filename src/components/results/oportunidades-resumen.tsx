"use client";

import { useMemo } from "react";
import type { EstadisticasOportunidadesDto } from "@/lib/estadisticas-oportunidades";
import { tonoDeEdificio } from "@/lib/colores-edificio";
import { useVocabulario } from "@/components/vocabulario";
import { Dona, type Porcion } from "./dona";
import { EmbudoEtapas } from "./embudo-etapas";
import { Section } from "./section";

/**
 * Resultados — Oportunidades (rediseño §2 y §3): dos gráficos circulares de
 * las consultas del período (por edificio y por origen) y el embudo por
 * etapa. Todo sigue a la barra de período, edificio y filtros.
 */

/** Colores de origen que no chocan con los de edificio ni con el verde de marca. */
const COLORES_ORIGEN = ["#2563eb", "#0891b2", "#16a34a", "#db2777"];
const OTROS = "#94a3b8";

export function porcionesDeOrigen(origenes: { origen: string; entraron: number }[]): Porcion[] {
  const orden = [...origenes].filter((o) => o.entraron > 0).sort((a, b) => b.entraron - a.entraron);
  const grandes = orden.slice(0, COLORES_ORIGEN.length);
  const chicos = orden.slice(COLORES_ORIGEN.length);
  const out: Porcion[] = grandes.map((o, i) => ({ clave: o.origen, nombre: o.origen, n: o.entraron, color: COLORES_ORIGEN[i]! }));
  const resto = chicos.reduce((s, o) => s + o.entraron, 0);
  if (resto > 0) out.push({ clave: "__otros", nombre: "Otros", n: resto, color: OTROS });
  return out;
}

export function OportunidadesResumen({
  data,
  loading,
  error,
}: {
  data: EstadisticasOportunidadesDto | null;
  loading: boolean;
  error: string | null;
}) {
  const voc = useVocabulario();
  const porEdificio = useMemo<Porcion[]>(
    () => (data?.porEdificio ?? []).map((e) => ({ clave: e.id, nombre: e.nombre, n: e.n, color: tonoDeEdificio(e.color).punto })),
    [data]
  );
  const porOrigen = useMemo(() => porcionesDeOrigen(data?.total.origenes ?? []), [data]);

  return (
    <Section
      id="oportunidades"
      title={voc.plural}
      hint="Las consultas que entraron en el período y hasta dónde llegaron."
      loading={loading}
      error={error}
      hasData={!!data}
      empty={data?.empty}
      emptyText="No entraron consultas en este período."
    >
      {data && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-border p-4">
              <h3 className="mb-3 text-[14px] font-semibold">Consultas del período por edificio</h3>
              <Dona porciones={porEdificio} etiquetaCentro="consultas" vacio="Ninguna consulta tiene edificio todavía." />
            </div>
            <div className="rounded-lg border border-border p-4">
              <h3 className="mb-3 text-[14px] font-semibold">Consultas del período por origen</h3>
              <Dona porciones={porOrigen} etiquetaCentro="consultas" />
            </div>
          </div>
          <EmbudoEtapas total={data.total} />
        </div>
      )}
    </Section>
  );
}
