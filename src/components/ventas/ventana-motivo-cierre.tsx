"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Ventana } from "@/components/ui/ventana";

/**
 * v7 — Al elegir cómo se cierra una oportunidad, el motivo se pide en una
 * ventana (antes se desplegaba abajo, en la página). OK y Cancelar; si el
 * motivo es obligatorio, OK no se habilita sin él.
 */
export function VentanaMotivoCierre({
  cierre,
  motivos,
  obligatorio,
  onConfirmar,
  onCerrar,
}: {
  /** El nombre del cierre elegido («Perdido», «No calificado»…). */
  cierre: string;
  motivos: string[];
  obligatorio: boolean;
  /** Devuelve false si no se pudo guardar: la ventana queda abierta. */
  onConfirmar: (motivo: string | null) => Promise<boolean | void>;
  onCerrar: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function confirmar() {
    if (obligatorio && !motivo) return;
    setGuardando(true);
    const ok = await onConfirmar(motivo || null);
    setGuardando(false);
    if (ok !== false) onCerrar();
  }

  return (
    <Ventana titulo={`Cerrar como «${cierre}»`} detalle="¿Cuál es el motivo?" onCerrar={onCerrar}>
      <Select
        value={motivo}
        onValueChange={setMotivo}
        placeholder={obligatorio ? "Elegí el motivo…" : "Sin motivo"}
        aria-label="Motivo de cierre"
        className="w-full"
      >
        {!obligatorio && <option value="">Sin motivo</option>}
        {motivos.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </Select>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" disabled={guardando} onClick={onCerrar}>
          Cancelar
        </Button>
        <Button disabled={guardando || (obligatorio && !motivo)} onClick={() => void confirmar()}>
          OK
        </Button>
      </div>
    </Ventana>
  );
}
