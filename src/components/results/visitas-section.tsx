"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { tonoDeEdificio } from "@/lib/colores-edificio";
import { DIAS_SEMANA, tonoDeCalor, type VisitasDto } from "@/lib/visitas-resultados";
import { etiqueta, TIPOS_OPORTUNIDAD } from "@/lib/ventas";
import { nombreEstado } from "@/lib/vocabulario";
import { useVocabulario } from "@/components/vocabulario";
import { cn } from "@/lib/utils";
import { Dona } from "./dona";
import { Section } from "./section";

/**
 * Resultados — Visitas (reemplaza a Ventas): cuántas se agendaron, cuántas se
 * hicieron y qué pasó después. Sale de las citas con fecha en el período.
 */

const pct = (n: number, total: number) => (total > 0 ? `${Math.round((n / total) * 100)}%` : "—");
const corto = (dia: string) => `${dia.slice(8)}/${dia.slice(5, 7)}`;
const NOMBRE_DIA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const TONOS_CALOR = [
  "bg-[#f1f5f9] dark:bg-muted",
  "bg-[color-mix(in_srgb,var(--accent)_30%,transparent)]",
  "bg-[color-mix(in_srgb,var(--accent)_60%,transparent)]",
  "bg-brand text-brand-fg",
];

function Numero({ titulo, n, detalle, tono }: { titulo: string; n: number; detalle: string; tono?: "verde" | "rojo" | "ambar" }) {
  const color = tono === "verde" ? "text-success-text" : tono === "rojo" ? "text-danger-text" : tono === "ambar" ? "text-warning-text" : "";
  return (
    <div className="rounded-lg border border-border p-4">
      <p className="text-[12.5px] text-text-3">{titulo}</p>
      <p className={cn("mt-1 font-mono text-[28px] font-bold leading-none", color)}>{n}</p>
      <p className="mt-1.5 text-[12px] text-text-3">{detalle}</p>
    </div>
  );
}

function MapaDeCalor({ calor }: { calor: VisitasDto["calor"] }) {
  const semanas = useMemo(() => {
    const out: (typeof calor.dias)[] = [];
    for (let i = 0; i < calor.dias.length; i += 7) out.push(calor.dias.slice(i, i + 7));
    return out;
  }, [calor]);
  const maxSemana = Math.max(1, ...calor.porDiaSemana);
  const fuerte = calor.porDiaSemana.indexOf(Math.max(...calor.porDiaSemana));
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[14px] font-semibold">Qué días se visita más</h3>
        <p className="text-[12.5px] text-text-3">
          {calor.total > 0
            ? `Día más fuerte: ${DIAS_SEMANA[fuerte]} · ${calor.porDiaSemana[fuerte]} de ${calor.total} visitas realizadas`
            : "Sin visitas realizadas en el período"}
          {calor.recortado && " · últimas 13 semanas"}
        </p>
      </div>
      <div className="flex flex-wrap gap-6">
        <div>
          <div className="flex gap-1">
            <div className="grid grid-rows-7 gap-1 pr-1 text-[10.5px] text-text-3">
              {NOMBRE_DIA.map((d) => (
                <span key={d} className="flex h-[26px] items-center">
                  {d}
                </span>
              ))}
            </div>
            {semanas.map((s) => (
              <div key={s[0]!.dia} className="grid grid-rows-7 gap-1">
                {s.map((d) => (
                  <span
                    key={d.dia}
                    title={d.enPeriodo ? `${NOMBRE_DIA[(new Date(`${d.dia}T12:00:00Z`).getUTCDay() + 6) % 7]} ${corto(d.dia)}: ${d.n} ${d.n === 1 ? "visita" : "visitas"}` : undefined}
                    className={cn(
                      "grid size-[26px] place-items-center rounded-[5px] text-[10px] tabular-nums",
                      d.enPeriodo ? TONOS_CALOR[tonoDeCalor(d.n, calor.maximo)] : "opacity-0"
                    )}
                  >
                    {d.enPeriodo ? Number(d.dia.slice(8)) : ""}
                  </span>
                ))}
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-1 text-[11px] text-text-3">
            Menos
            {TONOS_CALOR.map((t, i) => (
              <span key={i} className={cn("size-3 rounded-[3px]", t)} />
            ))}
            Más
          </div>
        </div>
        <ul className="min-w-[200px] flex-1 space-y-1.5 text-[12.5px]">
          {calor.porDiaSemana.map((n, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="w-8 text-text-3">{NOMBRE_DIA[i]}</span>
              <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                <span className="block h-full rounded-full bg-brand" style={{ width: `${(n / maxSemana) * 100}%` }} />
              </span>
              <span className="w-6 text-right font-mono tabular-nums">{n}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Lineas({ serie, totales }: { serie: VisitasDto["serie"]; totales: VisitasDto["totales"] }) {
  const [encima, setEncima] = useState<number | null>(null);
  const W = 520;
  const H = 180;
  const pad = { l: 26, r: 8, t: 10, b: 22 };
  const max = Math.max(1, ...serie.map((d) => Math.max(d.agendadas, d.realizadas)));
  const x = (i: number) => pad.l + (serie.length > 1 ? (i / (serie.length - 1)) * (W - pad.l - pad.r) : 0);
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const linea = (k: "agendadas" | "realizadas") => serie.map((d, i) => `${i ? "L" : "M"} ${x(i)} ${y(d[k])}`).join(" ");
  const area = `${linea("realizadas")} L ${x(serie.length - 1)} ${y(0)} L ${x(0)} ${y(0)} Z`;
  const marcas = serie.map((d, i) => ({ d, i })).filter(({ i }) => i % 7 === 0);
  const activa = encima !== null ? serie[encima] : null;
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[14px] font-semibold">Visitas por día</h3>
        <span className="flex items-center gap-3 text-[11.5px] text-text-3">
          <span className="inline-flex items-center gap-1">
            <span className="h-0.5 w-4 bg-brand" /> Realizadas
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-0 w-4 border-t-2 border-dashed border-text-3" /> Agendadas
          </span>
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" onMouseLeave={() => setEncima(null)}>
        {[0, Math.round(max / 2), max].map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="var(--border)" />
            <text x={pad.l - 6} y={y(v) + 3} textAnchor="end" fontSize="10" fill="var(--text-3)">
              {v}
            </text>
          </g>
        ))}
        {marcas.map(({ d, i }) => (
          <text key={d.dia} x={x(i)} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--text-3)">
            {corto(d.dia)}
          </text>
        ))}
        {serie.length > 1 && <path d={area} fill="var(--accent)" fillOpacity={0.12} />}
        <path d={linea("agendadas")} fill="none" stroke="var(--text-3)" strokeWidth={1.5} strokeDasharray="4 4" />
        <path d={linea("realizadas")} fill="none" stroke="var(--accent)" strokeWidth={2} />
        {serie.map((d, i) => (
          <g key={d.dia} onMouseEnter={() => setEncima(i)}>
            <rect x={x(i) - 6} y={pad.t} width={12} height={H - pad.t - pad.b} fill="transparent" />
            {d.realizadas > 0 && <circle cx={x(i)} cy={y(d.realizadas)} r={2.5} fill="var(--accent)" />}
          </g>
        ))}
      </svg>
      <p className="mt-1 text-[12px] text-text-3">
        {activa
          ? `${corto(activa.dia)}: ${activa.realizadas} realizadas de ${activa.agendadas} agendadas`
          : `${totales.realizadas} realizadas de ${totales.agendadas} agendadas en el período`}
      </p>
    </div>
  );
}

export function VisitasSection({
  data,
  loading,
  error,
}: {
  data: VisitasDto | null;
  loading: boolean;
  error: string | null;
}) {
  const voc = useVocabulario();
  const t = data?.totales;
  const d = data?.despues;
  return (
    <Section
      id="visitas"
      title="Visitas"
      hint="Cuántas se agendaron, cuántas se hicieron y qué pasó después."
      loading={loading}
      error={error}
      hasData={!!data}
      empty={data ? data.totales.agendadas === 0 : false}
      emptyText="No hubo visitas agendadas en este período."
    >
      {data && t && d && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Numero titulo="Agendadas" n={t.agendadas} detalle="Todas las del período" />
            <Numero titulo="Realizadas" n={t.realizadas} detalle={`${pct(t.realizadas, t.agendadas)} de las agendadas`} tono="verde" />
            <Numero titulo="No vinieron" n={t.noVinieron} detalle={`${pct(t.noVinieron, t.agendadas)} · sin aviso`} tono="rojo" />
            <Numero titulo="Canceladas" n={t.canceladas} detalle={`${pct(t.canceladas, t.agendadas)} · avisaron antes`} tono="ambar" />
          </div>

          <MapaDeCalor calor={data.calor} />

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <Lineas serie={data.serie} totales={t} />
            <div className="rounded-lg border border-border p-4">
              <h3 className="mb-3 text-[14px] font-semibold">Visitas realizadas por edificio</h3>
              <Dona
                tamano={140}
                grosor={20}
                etiquetaCentro="realizadas"
                porciones={data.porEdificio.map((e) => ({ clave: e.nombre, nombre: e.nombre, n: e.n, color: tonoDeEdificio(e.color).punto }))}
              />
            </div>
            <div className="rounded-lg border border-border p-4">
              <h3 className="mb-3 text-[14px] font-semibold">Quién agendó la visita</h3>
              <Dona
                tamano={140}
                grosor={20}
                etiquetaCentro="agendadas"
                porciones={[
                  { clave: "ai", nombre: `${data.agente} (IA)`, n: data.quienAgendo.ia, color: "var(--accent)" },
                  { clave: "manual", nombre: "Vendedor", n: data.quienAgendo.manual, color: "#94a3b8" },
                ].filter((p) => p.n > 0)}
              />
            </div>
          </div>

          <div className="rounded-lg border border-border p-4">
            <h3 className="mb-3 text-[14px] font-semibold">Qué pasó después de visitar</h3>
            {d.total === 0 ? (
              <p className="text-sm text-text-3">Nadie visitó en este período.</p>
            ) : (
              <>
                <div className="flex h-3.5 overflow-hidden rounded-full bg-muted">
                  <span className="bg-brand" style={{ width: `${(d.reservo / d.total) * 100}%` }} />
                  <span className="bg-[#cbd5e1]" style={{ width: `${(d.abierta / d.total) * 100}%` }} />
                  <span className="bg-[#ef4444]" style={{ width: `${(d.perdida / d.total) * 100}%` }} />
                </div>
                <ul className="mt-2 flex flex-wrap gap-4 text-[12.5px]">
                  {[
                    { n: d.reservo, nombre: "Reservó o compró", c: "bg-brand" },
                    { n: d.abierta, nombre: "Sigue abierta", c: "bg-[#cbd5e1]" },
                    { n: d.perdida, nombre: "Perdida", c: "bg-[#ef4444]" },
                  ].map((x) => (
                    <li key={x.nombre} className="inline-flex items-center gap-1.5">
                      <span className={cn("size-2.5 rounded-sm", x.c)} />
                      {x.nombre}: <strong className="font-semibold">{x.n}</strong>
                      <span className="text-text-3">({pct(x.n, d.total)})</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          <div className="rounded-lg border border-border">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
              <h3 className="text-[14px] font-semibold">
                {voc.plural} que visitaron · {data.oportunidadesQueVisitaron}
              </h3>
              {data.oportunidadesQueVisitaron > 0 && (
                <Link
                  href={`/oportunidades?situacion=todas&visitaDesde=${data.desde}&visitaHasta=${data.hasta}`}
                  className="text-[12.5px] font-medium text-brand-ink hover:underline"
                >
                  Ver las {data.oportunidadesQueVisitaron} en {voc.plural} →
                </Link>
              )}
            </header>
            {data.tabla.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-text-3">Sin visitas realizadas en el período.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-[13px]">
                  <thead className="border-b text-left text-[11.5px] text-text-3">
                    <tr>
                      <th className="px-4 py-2 font-medium">Visita</th>
                      <th className="px-4 py-2 font-medium">{voc.singular}</th>
                      <th className="px-4 py-2 font-medium">Edificio · unidad</th>
                      <th className="px-4 py-2 font-medium">Responsable</th>
                      <th className="px-4 py-2 font-medium">Estado hoy</th>
                      <th className="px-4 py-2 font-medium">Comentario de la visita</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.tabla.slice(0, 10).map((v) => (
                      <tr key={v.id} className="border-b last:border-0 hover:bg-subtle">
                        <td className="whitespace-nowrap px-4 py-2 tabular-nums">
                          {new Date(v.at).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </td>
                        <td className="px-4 py-2">
                          {v.oportunidad ? (
                            <Link href={`/oportunidades/${v.oportunidad.id}`} className="inline-flex items-center gap-1.5 hover:underline">
                              {v.oportunidad.tipo && (
                                <span className="rounded bg-muted px-1.5 py-0.5 text-[10.5px] font-semibold uppercase text-text-2">
                                  {etiqueta(TIPOS_OPORTUNIDAD, v.oportunidad.tipo)}
                                </span>
                              )}
                              <span className="font-medium">{v.oportunidad.nombre}</span>
                            </Link>
                          ) : (
                            <span className="text-text-3">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          {v.edificio ? (
                            <span className="inline-flex items-center gap-1.5">
                              <span className="size-2 rounded-full" style={{ background: tonoDeEdificio(v.edificio.color).punto }} />
                              {v.edificio.nombre}
                            </span>
                          ) : (
                            <span className="text-text-3">—</span>
                          )}
                          {(v.ambientes.length > 0 || v.unidad) && (
                            <span className="block text-[11.5px] text-text-3">
                              {[v.ambientes.length ? `${v.ambientes.join(", ")} amb.` : null, v.unidad ? `Unidad ${v.unidad}` : null]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2">{v.responsable ?? <span className="text-text-3">Sin asignar</span>}</td>
                        <td className="px-4 py-2">
                          {v.estado ? (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[11.5px] font-medium">{nombreEstado(voc, v.estado)}</span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="max-w-[260px] truncate px-4 py-2" title={v.comentario ?? undefined}>
                          {v.comentario ?? <span className="text-text-3 opacity-70">Sin comentario</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </Section>
  );
}
