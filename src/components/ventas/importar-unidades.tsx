"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { decodificarArchivo, ETIQUETA_CAMPO } from "@/lib/unidades-csv";
import type { ImportacionUnidades } from "@/server/ventas";
import { mensajeDe } from "./ui";

/**
 * Importar la lista de precios de un edificio desde un CSV. Primero muestra
 * la vista previa (nuevas, cambios, avisos, errores); recién al confirmar
 * escribe. Sirve igual para un edificio recién creado (todo es nuevo) que
 * para actualizar precios y estados de uno existente.
 */
export function ImportarUnidades({
  edificioId,
  moneda,
  textoInicial,
  onAplicado,
  onCancelar,
}: {
  edificioId: string;
  moneda: string;
  /** Si ya se eligió el archivo (al crear el edificio), arranca con su vista previa. */
  textoInicial?: string;
  onAplicado: (resultado: { creadas: number; modificadas: number }) => void;
  onCancelar?: () => void;
}) {
  const [csv, setCsv] = useState<string | null>(null);
  const [previa, setPrevia] = useState<ImportacionUnidades | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const arrancado = useRef(false);

  async function pedir(texto: string, aplicar: boolean) {
    setTrabajando(true);
    setError(null);
    const res = await fetch(`/api/edificios/${edificioId}/unidades-csv`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ csv: texto, aplicar, moneda }),
    }).catch(() => null);
    setTrabajando(false);
    if (!res?.ok) {
      setError(res ? await mensajeDe(res) : "No se pudo leer el archivo. Revisá tu conexión.");
      return null;
    }
    return (await res.json()) as ImportacionUnidades;
  }

  async function elegir(archivo: File | undefined) {
    if (!archivo) return;
    const texto = decodificarArchivo(await archivo.arrayBuffer());
    setCsv(texto);
    setPrevia(await pedir(texto, false));
  }

  // Con el archivo ya elegido (al crear el edificio), la vista previa arranca sola.
  useEffect(() => {
    if (!textoInicial || arrancado.current) return;
    arrancado.current = true;
    setCsv(textoInicial);
    void pedir(textoInicial, false).then(setPrevia);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textoInicial]);

  async function confirmar() {
    if (!csv) return;
    const r = await pedir(csv, true);
    if (r?.aplicado) {
      setPrevia(null);
      setCsv(null);
      onAplicado(r.aplicado);
    }
  }

  const hayAlgo = previa && (previa.nuevas.length > 0 || previa.modificadas.length > 0);

  return (
    <div className="rounded-lg border bg-card p-4">
      {!previa && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Importar unidades desde un CSV</p>
          <p className="text-xs text-text-3">
            Columnas que se leen: Piso, Unidad, AMB, Sup. cubierta, semicubierta,
            descubierta, Terraza (se suma a descubierta), VALOR, Estado,
            Dormitorios, Baños, Toilette, En suite. Las demás se ignoran. Antes de
            guardar vas a ver qué cambia.
          </p>
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={trabajando}
            onChange={(e) => void elegir(e.target.files?.[0])}
            className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-secondary file:px-3 file:py-1.5 file:text-sm"
          />
          {trabajando && <p className="text-xs text-text-3">Leyendo…</p>}
        </div>
      )}

      {previa && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 text-[13px]">
            <Pastilla n={previa.nuevas.length} texto="nuevas" />
            <Pastilla n={previa.modificadas.length} texto="con cambios" />
            <Pastilla n={previa.sinCambios.length} texto="sin cambios" />
            {previa.faltantes.length > 0 && (
              <Pastilla n={previa.faltantes.length} texto="no vienen en el archivo" />
            )}
            {previa.errores.length > 0 && <Pastilla n={previa.errores.length} texto="filas con error" alerta />}
          </div>
          <p className="text-[11px] text-text-3">
            Precios en {previa.moneda}. Columnas reconocidas: {previa.columnas.join(", ") || "ninguna"}.
          </p>

          {previa.avisos.length > 0 && (
            <Bloque titulo="Para revisar">
              {previa.avisos.map((a, i) => (
                <li key={i} className="text-warning-text">
                  <strong>{a.unidad ?? `Fila ${a.fila}`}</strong>: {a.mensaje}
                </li>
              ))}
            </Bloque>
          )}

          {previa.errores.length > 0 && (
            <Bloque titulo="No se importan">
              {previa.errores.map((e, i) => (
                <li key={i} className="text-danger-text">
                  Fila {e.fila}
                  {e.unidad ? ` (${e.unidad})` : ""}: {e.mensaje}
                </li>
              ))}
            </Bloque>
          )}

          {previa.modificadas.length > 0 && (
            <Bloque titulo="Cambios">
              {previa.modificadas.map((m) => (
                <li key={m.id}>
                  <strong>{m.unidad}</strong>:{" "}
                  {m.cambios
                    .map((c) => `${ETIQUETA_CAMPO[c.campo]} ${c.antes} → ${c.despues}`)
                    .join(" · ")}
                </li>
              ))}
            </Bloque>
          )}

          {previa.nuevas.length > 0 && (
            <Bloque titulo="Unidades nuevas">
              <li className="text-text-2">{previa.nuevas.map((n) => n.unidad).join(", ")}</li>
            </Bloque>
          )}

          {previa.faltantes.length > 0 && (
            <Bloque titulo="Están en el CRM pero no en el archivo (no se tocan)">
              <li className="text-text-2">{previa.faltantes.join(", ")}</li>
            </Bloque>
          )}

          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={!hayAlgo || trabajando} onClick={() => void confirmar()}>
              {trabajando
                ? "Guardando…"
                : hayAlgo
                  ? `Confirmar: ${previa.nuevas.length} nuevas y ${previa.modificadas.length} con cambios`
                  : "No hay nada para cambiar"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={trabajando}
              onClick={() => {
                setPrevia(null);
                setCsv(null);
                onCancelar?.();
              }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-danger-text">{error}</p>}
    </div>
  );
}

function Pastilla({ n, texto, alerta }: { n: number; texto: string; alerta?: boolean }) {
  return (
    <span
      className={
        alerta
          ? "rounded-full border border-danger-soft bg-danger-tint px-2.5 py-0.5 text-danger-text"
          : "rounded-full border bg-secondary px-2.5 py-0.5 text-text-2"
      }
    >
      <strong className="tabular-nums">{n}</strong> {texto}
    </span>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-text-2">{titulo}</p>
      <ul className="max-h-56 space-y-0.5 overflow-y-auto rounded-md border bg-subtle p-2.5 text-[12px] leading-relaxed">
        {children}
      </ul>
    </div>
  );
}
