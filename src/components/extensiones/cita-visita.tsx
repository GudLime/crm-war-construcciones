"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { Select } from "@/components/ui/select";
import type { InteresDto } from "@/lib/motor/dto";
import { cn } from "@/lib/utils";

/**
 * WAR — Lo que suma WAR a la ventana de una visita (v3): la tipología en
 * ambientes (1 · 2 · 3 AMB, varias) y las unidades que va a ver (sin el piso
 * y sin el precio, varias, con «+ elegir»). Todo se guarda en la OPORTUNIDAD
 * al tocarlo, así que se sincroniza en los dos sentidos: lo que se cambia acá
 * se ve en la ficha y al revés. El edificio de la visita se suma a los
 * edificios de interés de la oportunidad.
 *
 * Este archivo reemplaza al del núcleo (`components/extensiones/`), que el
 * núcleo no vuelve a tocar.
 */
export type PropsExtraCitaVisita = {
  oportunidadId: string;
  edificioId: string | null;
  disabled: boolean;
};

const AMBIENTES = [1, 2, 3];

/** «Olazábal · Piso 3 · 3A» → «3A». */
function sinPiso(titulo: string): string {
  const ultimo = titulo.split("·").pop()?.trim() ?? titulo;
  return ultimo.replace(/^piso\s*\d+\s*[-·]?\s*/i, "").trim() || titulo;
}

function VisitaWar({ oportunidadId, edificioId, disabled }: PropsExtraCitaVisita) {
  const [contactoId, setContactoId] = useState<string | null>(null);
  const [edificios, setEdificios] = useState<string[] | null>(null);
  const [ambientes, setAmbientes] = useState<number[]>([]);
  const [interes, setInteres] = useState<InteresDto | null>(null);
  const [eligiendo, setEligiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargarInteres = useCallback(async () => {
    const r = await fetch(`/api/oportunidades/${oportunidadId}/objetos`).catch(() => null);
    if (r?.ok) setInteres(((await r.json()) as { interes: InteresDto | null }).interes);
  }, [oportunidadId]);

  const cargar = useCallback(async () => {
    const r = await fetch(`/api/oportunidades/${oportunidadId}/detalle`).catch(() => null);
    if (!r?.ok) return;
    const d = (await r.json()) as {
      contacto: { id: string } | null;
      oportunidad: { edificios: { id: string }[]; edificioId: string | null; ambientes: number[] };
    };
    setContactoId(d.contacto?.id ?? null);
    const ids = d.oportunidad.edificios.map((e) => e.id);
    setEdificios(ids.length ? ids : d.oportunidad.edificioId ? [d.oportunidad.edificioId] : []);
    setAmbientes(d.oportunidad.ambientes ?? []);
    await cargarInteres();
  }, [oportunidadId, cargarInteres]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const cambiar = useCallback(
    async (cambios: { edificioIds?: string[]; ambientes?: number[] }) => {
      if (!contactoId) return false;
      setError(null);
      const r = await fetch(`/api/contacts/${contactoId}/oportunidad`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ oportunidadId, ...cambios }),
      }).catch(() => null);
      if (!r?.ok) {
        setError("No se pudo guardar en la oportunidad");
        return false;
      }
      await cargarInteres();
      return true;
    },
    [contactoId, oportunidadId, cargarInteres]
  );

  // El edificio de la visita pasa a ser de interés de la oportunidad.
  useEffect(() => {
    if (!edificioId || !edificios || edificios.includes(edificioId) || disabled) return;
    const next = [...edificios, edificioId];
    setEdificios(next);
    void cambiar({ edificioIds: next });
  }, [edificioId, edificios, disabled, cambiar]);

  async function vincular(registros: string[]) {
    if (!interes) return;
    setError(null);
    const r = await fetch(`/api/oportunidades/${oportunidadId}/objetos`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ relacion: interes.relacion, registros }),
    }).catch(() => null);
    if (!r?.ok) setError("No se pudo guardar la unidad");
    await cargarInteres();
  }

  const delEdificio = (u: { edificioId: string | null }) => !edificioId || u.edificioId === edificioId;
  const elegidas = (interes?.unidades ?? []).filter((u) => interes?.elegidas.includes(u.id) && delEdificio(u));
  const paraElegir = (interes?.unidades ?? []).filter(
    (u) =>
      u.ofrecida &&
      !interes?.elegidas.includes(u.id) &&
      delEdificio(u) &&
      (!ambientes.length || (u.ambientes != null && ambientes.includes(u.ambientes)))
  );
  const pastilla = (on: boolean) =>
    cn(
      "inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[12.5px] font-semibold disabled:opacity-60",
      on ? "border-brand bg-brand text-brand-fg" : "border-border bg-card text-text-2 hover:bg-accent"
    );

  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-[96px_1fr] items-center gap-3 text-[13px]">
        <span className="text-text-3">Tipología</span>
        <span role="group" aria-label="Tipología" className="flex flex-wrap gap-1.5">
          {AMBIENTES.map((n) => {
            const on = ambientes.includes(n);
            return (
              <button
                key={n}
                type="button"
                aria-pressed={on}
                disabled={disabled}
                onClick={() => {
                  const next = on ? ambientes.filter((a) => a !== n) : [...ambientes, n].sort((a, b) => a - b);
                  setAmbientes(next);
                  void cambiar({ ambientes: next });
                }}
                className={pastilla(on)}
              >
                {n} AMB
              </button>
            );
          })}
        </span>
      </div>
      {interes && (
        <div className="grid grid-cols-[96px_1fr] items-start gap-3 text-[13px]">
          <span className="pt-1 text-text-3">Unidad</span>
          <span className="flex flex-wrap items-center gap-1.5">
            {elegidas.map((u) => (
              <span key={u.id} className={pastilla(true)}>
                {sinPiso(u.titulo)}
                {!disabled && (
                  <button
                    type="button"
                    aria-label={`Quitar ${sinPiso(u.titulo)}`}
                    onClick={() => void vincular(interes.elegidas.filter((x) => x !== u.id))}
                    className="-mr-1 grid size-4 place-items-center rounded-full hover:bg-white/20"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </span>
            ))}
            {!disabled && paraElegir.length > 0 && !eligiendo && (
              <button type="button" onClick={() => setEligiendo(true)} className={pastilla(false)}>
                <Plus className="size-3" /> elegir
              </button>
            )}
            {eligiendo && (
              <Select
                value=""
                placeholder="Elegí la unidad…"
                aria-label="Unidad"
                onValueChange={(id) => {
                  setEligiendo(false);
                  if (id) void vincular([...interes.elegidas, id]);
                }}
                className="h-7 w-auto"
              >
                {paraElegir.map((u) => (
                  <option key={u.id} value={u.id}>
                    {sinPiso(u.titulo)}
                    {u.ambientes ? ` · ${u.ambientes} amb.` : ""}
                  </option>
                ))}
              </Select>
            )}
            {elegidas.length === 0 && !eligiendo && paraElegir.length === 0 && <span className="text-text-3">—</span>}
          </span>
        </div>
      )}
      <p className="text-[11.5px] text-text-3">Edificio, tipología y unidad se sincronizan con la oportunidad.</p>
      {error && <p className="text-[12px] text-danger-text">{error}</p>}
    </div>
  );
}

export const ExtraCitaVisita: ((props: PropsExtraCitaVisita) => React.ReactNode) | null = VisitaWar;
