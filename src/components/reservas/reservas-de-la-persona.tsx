"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { useAvisoGuardado } from "@/components/ui/aviso-guardado";
import { useVocabulario } from "@/components/vocabulario";
import { SegmentoBadge } from "@/components/contacts/contacts-client";
import { EstadoPill } from "@/components/ventas/ui";
import { fechaCorta, type Comensal } from "@/lib/reservas";
import { enFrase, opcionesEstado } from "@/lib/vocabulario";

/**
 * 071 — En la ficha de un contacto de restaurante: sus números (visitas,
 * reservas, faltas, última y próxima), su segmento, si acepta promociones y
 * todas sus reservas.
 */

type Fila = {
  id: string;
  oportunidadId: string;
  fecha: string;
  hora: string;
  personas: number;
  sector: string;
  observaciones: string | null;
  estado: string;
};

export function ReservasDeLaPersona({ contactId }: { contactId: string }) {
  const voc = useVocabulario();
  const avisar = useAvisoGuardado();
  const [datos, setDatos] = useState<{ comensal: Comensal; umbral: number; historial: Fila[] } | null>(null);

  const cargar = useCallback(async () => {
    const res = await fetch(`/api/reservas/comensales/${contactId}`).catch(() => null);
    if (res?.ok) setDatos(await res.json());
  }, [contactId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function promociones(acepta: boolean) {
    const res = await fetch(`/api/reservas/comensales/${contactId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ aceptaPromociones: acepta }),
    }).catch(() => null);
    avisar(res?.ok ? (acepta ? "Acepta promociones" : "No acepta promociones") : "No se pudo guardar", res?.ok ? "ok" : "error");
    await cargar();
  }

  if (!datos) return <p className="p-4 text-sm text-text-3">Cargando…</p>;
  const { comensal: c, historial } = datos;
  const numeros: [string, string][] = [
    ["Visitas", String(c.visitas)],
    [voc.plural, String(c.reservas)],
    ["No vino", String(c.noVino)],
    ["Canceladas", String(c.canceladas)],
    ["Primera visita", c.primeraVisita ? fechaCorta(c.primeraVisita) : "—"],
    ["Última visita", c.ultimaVisita ? fechaCorta(c.ultimaVisita) : "—"],
  ];
  const estados = opcionesEstado(voc);

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="kicker">{voc.plural}</p>
        <SegmentoBadge segmento={c.segmento} />
      </div>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {numeros.map(([k, v]) => (
          <div key={k} className="rounded-lg bg-subtle px-3 py-2">
            <dt className="text-[12px] text-text-3">{k}</dt>
            <dd className="text-[15px] font-semibold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      {c.proxima && (
        <p className="mt-3 text-sm">
          Próxima: <span className="font-semibold">{fechaCorta(c.proxima.fecha)} · {c.proxima.hora}</span>
        </p>
      )}

      <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
        <span>
          <span className="block text-sm font-medium">Acepta promociones</span>
          <span className="block text-[12px] text-text-3">Sin esto no se le mandan campañas.</span>
        </span>
        <Switch
          label="Acepta promociones"
          checked={c.aceptaPromociones}
          onCheckedChange={(v) => void promociones(v)}
        />
      </div>

      <p className="kicker mb-2 mt-5">Historial</p>
      {historial.length === 0 ? (
        <p className="text-sm text-text-3">Todavía no hizo ninguna {enFrase(voc.singular)}.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {historial.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
              <Link href={`/oportunidades/${r.oportunidadId}`} className="font-medium tabular-nums hover:underline">
                {fechaCorta(r.fecha)} · {r.hora}
              </Link>
              <span className="text-text-3">
                {r.personas} persona{r.personas === 1 ? "" : "s"} · {r.sector}
              </span>
              <span className="ml-auto">
                <EstadoPill opciones={estados} value={r.estado} />
              </span>
              {r.observaciones && <p className="w-full text-[12px] text-text-2">{r.observaciones}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
