"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Select } from "@/components/ui/select";
import { tonoDeEdificio } from "@/lib/colores-edificio";
import { ordenarTipologiasUnidad } from "@/lib/ventas";
import type { InteresDto } from "@/lib/motor/dto";
import { cn } from "@/lib/utils";

/**
 * WAR — Lo que suma WAR a la ventana de «Atendió» (cambios 23/11, punto 4c):
 * «¿Qué buscaba?» con el edificio, los ambientes, la tipología (v2, punto 1)
 * y una unidad en particular,
 * precargado con lo que ya tenga la oportunidad. El edificio y los ambientes
 * se guardan al tocarlos (como en la sección Interés, de ahí salen las
 * unidades); la unidad, al tocar «Guardar».
 *
 * Este archivo reemplaza al del núcleo (`components/extensiones/`), que el
 * núcleo no vuelve a tocar.
 */
export type PropsExtraLlamada = {
  oportunidadId: string;
  registrar: (guardar: () => Promise<void>) => void;
};

export const TITULO_LLAMADA_ATENDIDA: string | null = "¿Qué buscaba?";

type Edificio = { id: string; nombre: string; color: string | null };

function QueBuscaba({ oportunidadId, registrar }: PropsExtraLlamada) {
  const [catalogo, setCatalogo] = useState<Edificio[]>([]);
  const [contactoId, setContactoId] = useState<string | null>(null);
  const [edificios, setEdificios] = useState<string[]>([]);
  const [ambientes, setAmbientes] = useState<number[]>([]);
  /** v2, punto 1 — Las unidades tipo de interés («1A», «2B»), opcional. */
  const [tipologias, setTipologias] = useState<string[]>([]);
  const [tiposPorEdificio, setTiposPorEdificio] = useState<Record<string, string[]>>({});
  const [interes, setInteres] = useState<InteresDto | null>(null);
  const [unidad, setUnidad] = useState("");
  const [error, setError] = useState<string | null>(null);
  const unidadRef = useRef("");
  unidadRef.current = unidad;
  const interesRef = useRef<InteresDto | null>(null);
  interesRef.current = interes;

  const cargarInteres = useCallback(async () => {
    const r = await fetch(`/api/oportunidades/${oportunidadId}/objetos`).catch(() => null);
    if (r?.ok) setInteres(((await r.json()) as { interes: InteresDto | null }).interes);
  }, [oportunidadId]);

  useEffect(() => {
    void fetch("/api/edificios")
      .then((r) => (r.ok ? r.json() : { edificios: [] }))
      .then((d: { edificios: Edificio[] }) => setCatalogo(d.edificios.map((e) => ({ id: e.id, nombre: e.nombre, color: e.color ?? null }))))
      .catch(() => undefined);
    void fetch(`/api/oportunidades/${oportunidadId}/detalle`)
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (d: {
          contacto: { id: string } | null;
          oportunidad: { edificios: { id: string }[]; edificioId: string | null; ambientes: number[]; tipologiasUnidad?: string[] };
        } | null) => {
          if (!d) return;
          setContactoId(d.contacto?.id ?? null);
          const ids = d.oportunidad.edificios.map((e) => e.id);
          setEdificios(ids.length ? ids : d.oportunidad.edificioId ? [d.oportunidad.edificioId] : []);
          setAmbientes(d.oportunidad.ambientes ?? []);
          setTipologias(d.oportunidad.tipologiasUnidad ?? []);
        }
      )
      .catch(() => undefined);
    void cargarInteres();
  }, [oportunidadId, cargarInteres]);

  useEffect(() => {
    registrar(async () => {
      const i = interesRef.current;
      if (!unidadRef.current || !i) return;
      const r = await fetch(`/api/oportunidades/${oportunidadId}/objetos`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ relacion: i.relacion, registros: [...new Set([...i.elegidas, unidadRef.current])] }),
      });
      if (!r.ok) throw new Error("no se pudo vincular la unidad");
    });
  }, [registrar, oportunidadId]);

  // Las unidades tipo de cada edificio elegido (de su lista de unidades).
  useEffect(() => {
    for (const id of edificios) {
      if (tiposPorEdificio[id]) continue;
      void fetch(`/api/edificios/${id}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { departamentos: { tipologiaUnidad: string | null }[] } | null) => {
          const tipos = [...new Set((d?.departamentos ?? []).map((u) => u.tipologiaUnidad?.trim()).filter((t): t is string => Boolean(t)))];
          setTiposPorEdificio((m) => ({ ...m, [id]: tipos }));
        })
        .catch(() => undefined);
    }
  }, [edificios, tiposPorEdificio]);

  async function cambiar(cambios: { edificioIds?: string[]; ambientes?: number[]; tipologiasUnidad?: string[] }) {
    if (!contactoId) return;
    setError(null);
    const r = await fetch(`/api/contacts/${contactoId}/oportunidad`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ oportunidadId, ...cambios }),
    }).catch(() => null);
    if (!r?.ok) {
      setError("No se pudo guardar");
      return;
    }
    await cargarInteres();
  }

  const opcionesTipologias = ordenarTipologiasUnidad([...new Set([...edificios.flatMap((id) => tiposPorEdificio[id] ?? []), ...tipologias])]);
  const opcionesAmbientes = interes?.ambientesDisponibles.length ? interes.ambientesDisponibles : [1, 2, 3, 4, 5];
  const unidades = (interes?.unidades ?? []).filter(
    (u) => u.ofrecida && !interes?.elegidas.includes(u.id) && (!ambientes.length || (u.ambientes != null && ambientes.includes(u.ambientes)))
  );

  return (
    <div className="space-y-3">
      <label className="block space-y-1">
        <span className="text-[12px] font-medium text-text-3">Edificio de interés</span>
        <Select
          multiple
          values={edificios}
          onValuesChange={(ids) => {
            setEdificios(ids);
            void cambiar({ edificioIds: ids });
          }}
          placeholder="Elegí un edificio…"
          aria-label="Edificios de interés"
          iconoDe={(v) => (
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: tonoDeEdificio(catalogo.find((e) => e.id === v)?.color).punto }} />
          )}
          className="w-full"
        >
          {catalogo.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nombre}
            </option>
          ))}
        </Select>
      </label>
      <div className="space-y-1">
        <span className="text-[12px] font-medium text-text-3">Ambientes</span>
        <span role="group" aria-label="Ambientes" className="flex flex-wrap gap-1.5">
          {opcionesAmbientes.map((n) => {
            const on = ambientes.includes(n);
            return (
              <button
                key={n}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  const next = on ? ambientes.filter((a) => a !== n) : [...ambientes, n].sort((a, b) => a - b);
                  setAmbientes(next);
                  void cambiar({ ambientes: next });
                }}
                className={cn(
                  "grid h-7 min-w-8 place-items-center rounded-full border px-2 text-[13px] font-semibold",
                  on ? "border-brand bg-brand text-brand-fg" : "border-border bg-card text-text-2 hover:bg-accent"
                )}
              >
                {n}
              </button>
            );
          })}
        </span>
      </div>
      {opcionesTipologias.length > 0 && (
        <div className="space-y-1">
          <span className="text-[12px] font-medium text-text-3">Tipología (opcional)</span>
          <span role="group" aria-label="Tipología" className="flex flex-wrap gap-1.5">
            {opcionesTipologias.map((t) => {
              const on = tipologias.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    const next = ordenarTipologiasUnidad(on ? tipologias.filter((x) => x !== t) : [...tipologias, t]);
                    setTipologias(next);
                    void cambiar({ tipologiasUnidad: next });
                  }}
                  className={cn(
                    "grid h-7 min-w-9 place-items-center rounded-full border px-2 text-[13px] font-semibold",
                    on ? "border-brand bg-brand text-brand-fg" : "border-border bg-card text-text-2 hover:bg-accent"
                  )}
                >
                  {t}
                </button>
              );
            })}
          </span>
        </div>
      )}
      {interes && (
        <label className="block space-y-1">
          <span className="text-[12px] font-medium text-text-3">Una unidad en particular (opcional)</span>
          <Select value={unidad} onValueChange={setUnidad} placeholder="Ninguna en particular" aria-label="Unidad" className="w-full">
            <option value="">Ninguna en particular</option>
            {unidades.map((u) => (
              <option key={u.id} value={u.id}>
                {u.titulo}
                {u.ambientes ? ` · ${u.ambientes} amb.` : ""}
              </option>
            ))}
          </Select>
          {interes.elegidas.length > 0 && (
            <span className="block text-[11.5px] text-text-3">Ya tiene {interes.elegidas.length} unidad(es) de interés cargada(s).</span>
          )}
        </label>
      )}
      {error && <p className="text-[12px] text-danger-text">{error}</p>}
    </div>
  );
}

export const ExtraLlamadaAtendida: ((props: PropsExtraLlamada) => React.ReactNode) | null = QueBuscaba;
