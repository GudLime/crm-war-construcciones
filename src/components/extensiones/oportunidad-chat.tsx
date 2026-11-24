"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { Select } from "@/components/ui/select";
import type { InteresDto } from "@/lib/motor/dto";
import { cn } from "@/lib/utils";

/**
 * WAR — En el sidebar del chat (v4), debajo del edificio y la tipología: las
 * unidades que le interesan, sin el piso ni el precio, con «+ elegir». Se
 * guardan en la oportunidad al tocarlas (las mismas de la ficha).
 *
 * Este archivo reemplaza al del núcleo (`components/extensiones/`), que el
 * núcleo no vuelve a tocar.
 */
export type PropsExtraOportunidadChat = {
  oportunidadId: string;
  refreshKey: number;
};

/** «Olazábal · Piso 3 · 3A» → «3A». */
function sinPiso(titulo: string): string {
  const ultimo = titulo.split("·").pop()?.trim() ?? titulo;
  return ultimo.replace(/^piso\s*\d+\s*[-·]?\s*/i, "").trim() || titulo;
}

function UnidadesWar({ oportunidadId, refreshKey }: PropsExtraOportunidadChat) {
  const [interes, setInteres] = useState<InteresDto | null>(null);
  const [eligiendo, setEligiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const r = await fetch(`/api/oportunidades/${oportunidadId}/objetos`).catch(() => null);
    if (r?.ok) setInteres(((await r.json()) as { interes: InteresDto | null }).interes);
  }, [oportunidadId]);

  useEffect(() => {
    void cargar();
  }, [cargar, refreshKey]);

  async function vincular(registros: string[]) {
    if (!interes) return;
    setError(null);
    const r = await fetch(`/api/oportunidades/${oportunidadId}/objetos`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ relacion: interes.relacion, registros }),
    }).catch(() => null);
    if (!r?.ok) setError("No se pudo guardar la unidad");
    await cargar();
  }

  if (!interes) return null;
  const elegidas = interes.unidades.filter((u) => interes.elegidas.includes(u.id));
  const paraElegir = interes.unidades.filter((u) => u.ofrecida && !interes.elegidas.includes(u.id));
  const pastilla = (on: boolean) =>
    cn(
      "inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[12px] font-semibold",
      on ? "border-brand bg-brand text-brand-fg" : "border-border bg-card text-text-2 hover:bg-accent"
    );

  return (
    <div>
      <p className="mb-1.5 text-[11px] font-medium text-text-2">Unidades</p>
      <span className="flex flex-wrap items-center gap-1.5">
        {elegidas.map((u) => (
          <span key={u.id} className={pastilla(true)}>
            {sinPiso(u.titulo)}
            <button
              type="button"
              aria-label={`Quitar ${sinPiso(u.titulo)}`}
              onClick={() => void vincular(interes.elegidas.filter((x) => x !== u.id))}
              className="-mr-1 grid size-4 place-items-center rounded-full hover:bg-white/20"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        {paraElegir.length > 0 && !eligiendo && (
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
            className="h-7 w-full"
          >
            {paraElegir.map((u) => (
              <option key={u.id} value={u.id}>
                {sinPiso(u.titulo)}
                {u.ambientes ? ` · ${u.ambientes} amb.` : ""}
              </option>
            ))}
          </Select>
        )}
        {elegidas.length === 0 && paraElegir.length === 0 && (
          <span className="text-[11px] text-text-3">Elegí el edificio para ver sus unidades.</span>
        )}
      </span>
      {error && <p className="mt-1 text-[11px] text-danger-text">{error}</p>}
    </div>
  );
}

export const ExtraOportunidadChat: ((props: PropsExtraOportunidadChat) => React.ReactNode) | null = UnidadesWar;
