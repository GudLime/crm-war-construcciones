"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Sparkles, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconoTipo } from "@/components/ventas/tareas-client";
import { useVocabulario } from "@/components/vocabulario";
import type { Sugerencia } from "@/lib/sugerencias";
import { nombreEstado } from "@/lib/vocabulario";

type Dto = {
  estado: string;
  sugerencias: Sugerencia[];
  descartadas: { plantillaId: string; titulo: string }[];
  admin?: boolean;
};

/** «para hoy», «para mañana», «para el 25/11». */
function paraCuando(vence: string): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const iso = (x: Date) => `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
  if (vence === iso(d)) return "para hoy";
  if (vence === iso(new Date(d.getTime() + 86_400_000))) return "para mañana";
  return `para el ${vence.slice(8)}/${vence.slice(5, 7)}`;
}

/**
 * 0059 — «Sugeridas para esta etapa» en Próximos pasos: de 1 a 3 tareas
 * sugeridas según en qué situación está la oportunidad. Crear la arma en un
 * paso (con deshacer); la ✕ la oculta mientras siga en esta etapa. Nada se
 * crea solo.
 */
export function SugeridasParaEstaEtapa({
  oportunidadId,
  recalcular,
  onCambio,
}: {
  oportunidadId: string;
  /** Cambia cuando cambia la etapa, un mensaje o una cita: se vuelve a pedir. */
  recalcular: string;
  onCambio: () => Promise<void>;
}) {
  const voc = useVocabulario();
  const [dto, setDto] = useState<Dto | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; tareaId: string } | null>(null);
  const [verDescartadas, setVerDescartadas] = useState(false);
  const [ocupada, setOcupada] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const r = await fetch(`/api/oportunidades/${oportunidadId}/sugerencias`).catch(() => null);
    if (r?.ok) setDto((await r.json()) as Dto);
  }, [oportunidadId]);
  useEffect(() => {
    void cargar();
  }, [cargar, recalcular]);

  async function crear(s: Sugerencia) {
    setOcupada(s.plantillaId);
    const r = await fetch(`/api/oportunidades/${oportunidadId}/sugerencias/${s.plantillaId}/crear`, { method: "POST" }).catch(
      () => null
    );
    setOcupada(null);
    if (!r?.ok) {
      await cargar();
      return;
    }
    const d = (await r.json()) as { tareaId: string };
    setAviso({ texto: `${s.titulo} creada ${paraCuando(s.vence)} · quedó en Próximos pasos`, tareaId: d.tareaId });
    await Promise.all([cargar(), onCambio()]);
  }

  async function deshacer() {
    if (!aviso) return;
    const id = aviso.tareaId;
    setAviso(null);
    await fetch(`/api/tareas/${id}`, { method: "DELETE" }).catch(() => null);
    await Promise.all([cargar(), onCambio()]);
  }

  async function descartar(s: Sugerencia) {
    setDto((d) => (d ? { ...d, sugerencias: d.sugerencias.filter((x) => x.plantillaId !== s.plantillaId) } : d));
    await fetch(`/api/oportunidades/${oportunidadId}/sugerencias/${s.plantillaId}/descartar`, { method: "POST" }).catch(
      () => null
    );
    await cargar();
  }

  async function restaurar(plantillaId: string) {
    await fetch(`/api/oportunidades/${oportunidadId}/sugerencias/${plantillaId}/descartar`, { method: "DELETE" }).catch(
      () => null
    );
    await cargar();
  }

  if (!dto) return null;
  const nada = dto.sugerencias.length === 0;
  if (nada && !aviso && dto.descartadas.length === 0) return null;

  return (
    <div className="mb-3 space-y-2">
      {aviso && (
        <p role="status" className="flex items-center gap-2 rounded-lg bg-success-tint px-3 py-2 text-[12.5px] text-success-text">
          <span className="flex-1">✓ {aviso.texto}</span>
          <button type="button" onClick={() => void deshacer()} className="inline-flex items-center gap-1 font-semibold hover:underline">
            <Undo2 className="size-3.5" /> Deshacer
          </button>
        </p>
      )}
      {(!nada || dto.descartadas.length > 0) && (
        <section className="rounded-xl border border-brand-soft bg-gradient-to-b from-brand-tint to-card p-3">
          <header className="mb-2 flex items-center gap-1.5">
            <Sparkles className="size-3.5 text-brand-ink" />
            <h4 className="flex-1 text-[12.5px] font-semibold text-brand-ink">
              Sugeridas para esta etapa · {nombreEstado(voc, dto.estado)}
            </h4>
            {dto.admin && (
              <Link href="/settings/tareas" className="text-[11.5px] font-medium text-text-3 hover:text-foreground hover:underline">
                Configurar plantillas
              </Link>
            )}
          </header>
          {nada && <p className="text-[12.5px] text-text-3">No hay más sugerencias para esta etapa.</p>}
          <ul className="space-y-2">
            {dto.sugerencias.map((s) => (
              <li key={s.plantillaId} className="flex items-start gap-2.5 rounded-lg bg-card p-2">
                <IconoTipo tipo={s.tipo} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold">
                    {s.titulo} <span className="font-normal text-text-3">· {paraCuando(s.vence)}</span>
                  </p>
                  <p className="truncate text-[12px] text-text-3">{s.porque}</p>
                  {s.mensaje && <p className="truncate text-[12px] text-text-2">«{s.mensaje}»</p>}
                </div>
                <Button size="sm" disabled={ocupada === s.plantillaId} onClick={() => void crear(s)}>
                  Crear
                </Button>
                <button
                  type="button"
                  aria-label={`Descartar «${s.titulo}»`}
                  onClick={() => void descartar(s)}
                  className="grid size-8 shrink-0 place-items-center rounded-md text-text-3 hover:bg-accent hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
          {dto.descartadas.length > 0 && (
            <div className="mt-2 text-[11.5px] text-text-3">
              <button type="button" onClick={() => setVerDescartadas((v) => !v)} className="hover:text-foreground hover:underline">
                {dto.descartadas.length} {dto.descartadas.length === 1 ? "sugerencia descartada" : "sugerencias descartadas"} ·{" "}
                {verDescartadas ? "ocultar" : "mostrar"}
              </button>
              {verDescartadas && (
                <ul className="mt-1 space-y-1">
                  {dto.descartadas.map((d) => (
                    <li key={d.plantillaId} className="flex items-center gap-2">
                      <span className="flex-1 truncate">{d.titulo}</span>
                      <button type="button" onClick={() => void restaurar(d.plantillaId)} className="font-medium text-brand-ink hover:underline">
                        Volver a mostrar
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
