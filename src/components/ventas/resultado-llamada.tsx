"use client";

import { useRef, useState } from "react";
import { Check, PhoneMissed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Ventana } from "@/components/ui/ventana";
import { ExtraLlamadaAtendida, TITULO_LLAMADA_ATENDIDA } from "@/components/extensiones/llamada-atendida";
import { cn } from "@/lib/utils";

/**
 * 0061 — Cómo salió una llamada (cambios 23/11, punto 4b): «Atendió» o «No
 * atendió». «Atendió» abre una ventana opcional (lo que sume el cliente y el
 * comentario); «Saltar» la marca igual. Si la oportunidad estaba en Recibido,
 * pasa a En charlas.
 */
export function ResultadoLlamada({
  tareaId,
  oportunidadId,
  onListo,
  className,
}: {
  tareaId: string;
  oportunidadId: string | null;
  onListo: () => void | Promise<void>;
  className?: string;
}) {
  const [abierta, setAbierta] = useState(false);
  const [comentario, setComentario] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const guardarExtra = useRef<(() => Promise<void>) | null>(null);

  async function enviar(resultado: "atendio" | "no_atendio", nota: string | null) {
    setOcupado(true);
    setError(null);
    const r = await fetch(`/api/tareas/${tareaId}/llamada`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ resultado, comentario: nota }),
    }).catch(() => null);
    setOcupado(false);
    if (!r?.ok) {
      setError("No se pudo guardar. Probá de nuevo.");
      return false;
    }
    setAbierta(false);
    setComentario("");
    await onListo();
    return true;
  }

  async function guardar() {
    setOcupado(true);
    try {
      await guardarExtra.current?.();
    } catch {
      setOcupado(false);
      setError("No se pudo guardar lo que buscaba. Probá de nuevo o tocá Saltar.");
      return;
    }
    await enviar("atendio", comentario.trim() || null);
  }

  const Extra = oportunidadId ? ExtraLlamadaAtendida : null;
  return (
    <>
      <span className={cn("inline-flex gap-1.5", className)}>
        <button
          type="button"
          onClick={() => {
            guardarExtra.current = null;
            setAbierta(true);
          }}
          className="inline-flex h-[26px] items-center gap-1 rounded-full border border-border bg-card px-2.5 text-[12px] font-medium text-text-2 hover:bg-accent hover:text-foreground"
        >
          <Check className="size-3.5" /> Atendió
        </button>
        <button
          type="button"
          disabled={ocupado}
          onClick={() => void enviar("no_atendio", null)}
          title="Lo llamamos y no atendió (cuenta como intento)"
          className="inline-flex h-[26px] items-center gap-1 rounded-full px-2.5 text-[12px] text-text-3 hover:bg-accent hover:text-foreground"
        >
          <PhoneMissed className="size-3.5" /> No atendió
        </button>
      </span>
      {!abierta && error && <span className="text-[12px] text-danger-text">{error}</span>}
      {abierta && (
        <Ventana
          titulo={Extra ? (TITULO_LLAMADA_ATENDIDA ?? "¿Qué buscaba?") : "¿Cómo fue la llamada?"}
          detalle="Es opcional: con «Saltar» queda como atendida igual."
          onCerrar={() => setAbierta(false)}
          className="max-w-[520px]"
        >
          <div className="space-y-4">
            {Extra && oportunidadId && (
              <Extra
                oportunidadId={oportunidadId}
                registrar={(fn) => {
                  guardarExtra.current = fn;
                }}
              />
            )}
            <label className="block space-y-1">
              <span className="text-[12px] font-medium text-text-3">Comentario de la llamada (opcional)</span>
              <textarea
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                rows={3}
                placeholder="Qué te contó, qué quedaron en hacer…"
                className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
            {error && <p className="text-sm text-danger-text">{error}</p>}
            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" disabled={ocupado} onClick={() => void enviar("atendio", null)}>
                Saltar
              </Button>
              <Button type="button" size="sm" disabled={ocupado} onClick={() => void guardar()}>
                Guardar
              </Button>
            </div>
          </div>
        </Ventana>
      )}
    </>
  );
}
