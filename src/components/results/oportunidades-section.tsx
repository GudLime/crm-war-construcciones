"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Select } from "@/components/ui/select";
import { rate, type RateDto } from "@/lib/analytics";
import {
  SIN_VALOR,
  type BloqueEstadisticas,
  type EstadisticasOportunidadesDto,
  type GrupoEstadisticasDto,
} from "@/lib/estadisticas-oportunidades";
import { cn } from "@/lib/utils";
import { BarChart } from "./bar-chart";
import { Funnel } from "./funnel";
import { Rate, Section, Subhead } from "./section";
import { RateCard, StatCard } from "./stat-card";

/**
 * Motor (paso 7) — Oportunidades: embudo, tiempos por etapa, motivos de
 * pérdida y orígenes de las oportunidades que entraron en el período, con
 * «Ver por» (agrupar) y filtros armados solos desde la estructura del cliente.
 */

export type Consulta = { verPor: string | null | undefined; filtros: Record<string, string[]> };

const dias = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("es-AR")} d`);
const pct = (r: RateDto) => (r.value === null ? "—" : `${r.value}%`);

function Tabla({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full min-w-[520px] text-sm">{children}</table>
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={cn("px-3 py-2 text-xs font-medium text-text-3", right ? "text-right" : "text-left")}>{children}</th>;
}

function Td({ children, right, strong }: { children: React.ReactNode; right?: boolean; strong?: boolean }) {
  return (
    <td className={cn("px-3 py-2 align-top", right && "text-right tabular-nums", strong && "font-medium")}>{children}</td>
  );
}

/** El total primero y después cada grupo. */
function filas(data: EstadisticasOportunidadesDto): GrupoEstadisticasDto[] {
  return [data.total, ...data.grupos];
}

function EmbudoBloque({ data }: { data: EstadisticasOportunidadesDto }) {
  if (!data.grupos.length) {
    return (
      <Funnel
        steps={data.total.embudo.map((e) => ({
          stageId: e.estado,
          name: e.nombre,
          kind: e.estado === "compro" ? "won" : "open",
          reached: e.llegaron,
          advanceRate: e.avance,
        }))}
      />
    );
  }
  const etapas = data.total.embudo;
  return (
    <Tabla>
      <thead className="border-b bg-secondary/40">
        <tr>
          <Th>&nbsp;</Th>
          {etapas.map((e) => (
            <Th key={e.estado} right>
              {e.nombre}
            </Th>
          ))}
          <Th right>Conversión</Th>
        </tr>
      </thead>
      <tbody>
        {filas(data).map((g, i) => (
          <tr key={g.clave} className={cn("border-b last:border-0", i === 0 && "bg-subtle")}>
            <Td strong>{g.nombre}</Td>
            {g.embudo.map((e, j) => (
              <Td key={e.estado} right>
                {e.llegaron}
                {j > 0 && g.entraron > 0 && (
                  <span className="ml-1 text-[11px] text-text-3">{pct(rate(e.llegaron, g.entraron))}</span>
                )}
              </Td>
            ))}
            <Td right>
              <span className={cn(!g.conversion.reliable && "text-text-2")}>{pct(g.conversion)}</span>
            </Td>
          </tr>
        ))}
      </tbody>
    </Tabla>
  );
}

function TiemposBloque({ data }: { data: EstadisticasOportunidadesDto }) {
  const etapas = data.total.tiempos;
  if (etapas.every((t) => t.casos === 0)) {
    return <p className="py-2 text-sm text-text-3">Todavía no hay cambios de etapa con tiempo medido en este período.</p>;
  }
  if (!data.grupos.length) {
    return (
      <Tabla>
        <thead className="border-b bg-secondary/40">
          <tr>
            <Th>Etapa</Th>
            <Th right>Mitad tarda menos de</Th>
            <Th right>Promedio</Th>
            <Th right>Casos</Th>
          </tr>
        </thead>
        <tbody>
          {etapas.map((t) => (
            <tr key={t.estado} className="border-b last:border-0">
              <Td strong>{t.nombre}</Td>
              <Td right>{dias(t.medianaDias)}</Td>
              <Td right>{dias(t.promedioDias)}</Td>
              <Td right>{t.casos}</Td>
            </tr>
          ))}
        </tbody>
      </Tabla>
    );
  }
  return (
    <Tabla>
      <thead className="border-b bg-secondary/40">
        <tr>
          <Th>&nbsp;</Th>
          {etapas.map((t) => (
            <Th key={t.estado} right>
              {t.nombre}
            </Th>
          ))}
        </tr>
      </thead>
      <tbody>
        {filas(data).map((g, i) => (
          <tr key={g.clave} className={cn("border-b last:border-0", i === 0 && "bg-subtle")}>
            <Td strong>{g.nombre}</Td>
            {g.tiempos.map((t) => (
              <Td key={t.estado} right>
                <span title={`${t.casos} casos · promedio ${dias(t.promedioDias)}`}>{dias(t.medianaDias)}</span>
              </Td>
            ))}
          </tr>
        ))}
      </tbody>
    </Tabla>
  );
}

function resumenTop(items: { nombre: string; n: number }[], max = 3): string {
  if (!items.length) return "—";
  const top = items.slice(0, max).map((x) => `${x.nombre} (${x.n})`);
  return items.length > max ? `${top.join(", ")}…` : top.join(", ");
}

function MotivosBloque({ data }: { data: EstadisticasOportunidadesDto }) {
  if (!data.grupos.length) {
    return (
      <BarChart
        items={data.total.motivos.map((m) => ({ key: m.motivo, label: m.motivo, count: m.n }))}
        emptyText="Ninguna oportunidad de este período se perdió todavía."
      />
    );
  }
  return (
    <Tabla>
      <thead className="border-b bg-secondary/40">
        <tr>
          <Th>&nbsp;</Th>
          <Th right>Perdidas</Th>
          <Th right>No calificadas</Th>
          <Th>Motivos más comunes</Th>
        </tr>
      </thead>
      <tbody>
        {filas(data).map((g, i) => (
          <tr key={g.clave} className={cn("border-b last:border-0", i === 0 && "bg-subtle")}>
            <Td strong>{g.nombre}</Td>
            <Td right>{g.perdidas}</Td>
            <Td right>{g.noCalificadas}</Td>
            <Td>
              <span className="text-text-2">{resumenTop(g.motivos.map((m) => ({ nombre: m.motivo, n: m.n })))}</span>
            </Td>
          </tr>
        ))}
      </tbody>
    </Tabla>
  );
}

function OrigenesBloque({ data }: { data: EstadisticasOportunidadesDto }) {
  if (!data.grupos.length || data.verPor === "origen") {
    const lista = data.total.origenes;
    return (
      <Tabla>
        <thead className="border-b bg-secondary/40">
          <tr>
            <Th>Origen</Th>
            <Th right>Entraron</Th>
            <Th right>Compraron</Th>
            <Th>Conversión</Th>
          </tr>
        </thead>
        <tbody>
          {lista.map((o) => (
            <tr key={o.origen} className="border-b last:border-0">
              <Td strong>{o.origen}</Td>
              <Td right>{o.entraron}</Td>
              <Td right>{o.compraron}</Td>
              <Td>
                <Rate rate={o.conversion} unit="oportunidades" />
              </Td>
            </tr>
          ))}
        </tbody>
      </Tabla>
    );
  }
  return (
    <Tabla>
      <thead className="border-b bg-secondary/40">
        <tr>
          <Th>&nbsp;</Th>
          <Th>De dónde vinieron</Th>
        </tr>
      </thead>
      <tbody>
        {filas(data).map((g, i) => (
          <tr key={g.clave} className={cn("border-b last:border-0", i === 0 && "bg-subtle")}>
            <Td strong>{g.nombre}</Td>
            <Td>
              <span className="text-text-2">
                {resumenTop(g.origenes.map((o) => ({ nombre: o.origen, n: o.entraron })), 4)}
              </span>
            </Td>
          </tr>
        ))}
      </tbody>
    </Tabla>
  );
}

const TITULOS: Record<BloqueEstadisticas, string> = {
  embudo: "Embudo: hasta dónde llegaron",
  tiempos: "Tiempo en cada etapa",
  motivos: "Por qué se perdieron",
  origenes: "De dónde vinieron",
};

function Controles({
  data,
  consulta,
  onChange,
}: {
  data: EstadisticasOportunidadesDto;
  consulta: Consulta;
  onChange: (c: Consulta) => void;
}) {
  const [dim, setDim] = useState("");
  const opcion = data.opciones.find((o) => o.clave === dim);
  const nombreDe = (clave: string) => data.opciones.find((o) => o.clave === clave);

  function agregar(valor: string) {
    if (!dim || !valor) return;
    const actuales = consulta.filtros[dim] ?? [];
    if (!actuales.includes(valor)) onChange({ ...consulta, filtros: { ...consulta.filtros, [dim]: [...actuales, valor] } });
    setDim("");
  }

  function quitar(clave: string, valor: string) {
    const resto = (consulta.filtros[clave] ?? []).filter((v) => v !== valor);
    const filtros = { ...consulta.filtros };
    if (resto.length) filtros[clave] = resto;
    else delete filtros[clave];
    onChange({ ...consulta, filtros });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-text-3">Ver por</span>
        <Select
          value={data.verPor ?? ""}
          onValueChange={(v) => onChange({ ...consulta, verPor: v || null })}
          className="w-auto min-w-[170px]"
          aria-label="Ver por"
        >
          <option value="">Sin agrupar</option>
          {data.opciones.map((o) => (
            <option key={o.clave} value={o.clave}>
              {o.nombre}
            </option>
          ))}
        </Select>
        <span className="ml-2 text-text-3">Filtrar</span>
        <Select value={dim} onValueChange={setDim} className="w-auto min-w-[150px]" aria-label="Filtrar por">
          <option value="">Elegí qué…</option>
          {data.opciones.map((o) => (
            <option key={o.clave} value={o.clave}>
              {o.nombre}
            </option>
          ))}
        </Select>
        {opcion && (
          <Select value="" onValueChange={agregar} className="w-auto min-w-[150px]" aria-label={`Valor de ${opcion.nombre}`}>
            <option value="">Elegí el valor…</option>
            {opcion.valores.map((v) => (
              <option key={v.clave} value={v.clave}>
                {`${v.nombre} (${v.n})`}
              </option>
            ))}
          </Select>
        )}
      </div>
      {Object.keys(data.filtros).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(data.filtros).flatMap(([clave, valores]) =>
            valores.map((v) => {
              const o = nombreDe(clave);
              const nombre =
                o?.valores.find((x) => x.clave === v)?.nombre ?? (v === SIN_VALOR ? `Sin ${o?.nombre.toLowerCase() ?? ""}` : v);
              return (
                <button
                  key={`${clave}:${v}`}
                  type="button"
                  onClick={() => quitar(clave, v)}
                  className="inline-flex items-center gap-1 rounded-full border border-border-strong bg-subtle px-2.5 py-0.5 text-xs hover:border-foreground"
                  aria-label={`Quitar filtro ${o?.nombre ?? clave}: ${nombre}`}
                >
                  <span className="text-text-3">{o?.nombre ?? clave}:</span> {nombre}
                  <X className="h-3 w-3" strokeWidth={2} />
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export function OportunidadesSection({
  data,
  loading,
  error,
  consulta,
  onConsulta,
}: {
  data: EstadisticasOportunidadesDto | null;
  loading: boolean;
  error: string | null;
  consulta: Consulta;
  onConsulta: (c: Consulta) => void;
}) {
  const t = data?.total;
  const filtrando = !!data && Object.keys(data.filtros).length > 0;
  return (
    <Section
      id="oportunidades"
      title="Oportunidades"
      hint="De las que entraron en el período: hasta dónde llegaron, cuánto tardaron, por qué se perdieron y de dónde vinieron."
      loading={loading}
      error={error}
      hasData={!!data}
      empty={!!data?.empty}
      emptyText="No entraron oportunidades en este período. Probá con un rango más amplio."
    >
      {data && t && (
        <div className="space-y-6">
          <Controles data={data} consulta={consulta} onChange={onConsulta} />
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-5">
            <StatCard label={filtrando ? "Entraron (con filtros)" : "Entraron"} value={String(t.entraron)} />
            <StatCard label="Compraron" value={String(t.compraron)} />
            <RateCard label="Conversión" rate={t.conversion} unit="oportunidades" />
            <StatCard label="Siguen abiertas" value={String(t.abiertas)} />
            <StatCard label="Perdidas / no calificadas" value={`${t.perdidas} / ${t.noCalificadas}`} />
          </div>
          {data.multiple && (
            <p className="rounded-md bg-subtle px-3 py-2 text-xs text-text-2">
              Algunas oportunidades tienen más de un valor y suman en cada grupo: la suma de los grupos puede pasar el total.
            </p>
          )}
          {data.bloques.map((b) => (
            <div key={b}>
              <Subhead>{TITULOS[b]}</Subhead>
              {b === "embudo" && <EmbudoBloque data={data} />}
              {b === "tiempos" && <TiemposBloque data={data} />}
              {b === "motivos" && <MotivosBloque data={data} />}
              {b === "origenes" && <OrigenesBloque data={data} />}
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}
