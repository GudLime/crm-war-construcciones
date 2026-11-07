"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabla, Td, Th, mensajeDe } from "@/components/ventas/ui";
import { decodificarArchivo } from "@/lib/unidades-csv";

/**
 * Motor — importar un CSV a cualquier objeto: elegir el archivo, ver qué se
 * crea, qué cambia y qué tiene errores, y recién ahí confirmar.
 */

type Accion = "crear" | "actualizar" | "sin_cambios" | "error";
type Resultado = {
  columnas: string[];
  noReconocidas: string[];
  filas: { fila: number; titulo: string; accion: Accion; cambios: string[]; mensaje?: string }[];
  resumen: Record<Accion, number>;
  aplicado: boolean;
};

const ETIQUETA: Record<Accion, { texto: string; variant: "success" | "warning" | "secondary" | "destructive" }> = {
  crear: { texto: "Nuevo", variant: "success" },
  actualizar: { texto: "Cambia", variant: "warning" },
  sin_cambios: { texto: "Igual", variant: "secondary" },
  error: { texto: "Error", variant: "destructive" },
};

export function ImportarCsv({
  objeto,
  nombrePlural,
  padre,
  onAplicado,
  onCancelar,
}: {
  objeto: string;
  nombrePlural: string;
  /** Importar dentro de un padre: todas las filas quedan relacionadas con él. */
  padre?: { relacion: string; id: string };
  onAplicado: () => void;
  onCancelar: () => void;
}) {
  const [texto, setTexto] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  async function enviar(contenido: string, aplicar: boolean) {
    setTrabajando(true);
    setError(null);
    const res = await fetch(`/api/objetos/${encodeURIComponent(objeto)}/importar`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ texto: contenido, padre, aplicar }),
    }).catch(() => null);
    setTrabajando(false);
    if (!res?.ok) {
      setError(res ? await mensajeDe(res) : "No se pudo leer el archivo");
      return;
    }
    setResultado((await res.json()) as Resultado);
  }

  const aCargar = resultado ? resultado.resumen.crear + resultado.resumen.actualizar : 0;

  return (
    <div className="mb-5 rounded-lg border bg-card p-4 shadow-sm">
      <p className="mb-3 text-sm font-semibold">Importar {nombrePlural.toLowerCase()} desde un CSV</p>
      {!resultado?.aplicado && (
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={async (e) => {
            const archivo = e.target.files?.[0];
            if (!archivo) return;
            const contenido = decodificarArchivo(await archivo.arrayBuffer());
            setTexto(contenido);
            setResultado(null);
            void enviar(contenido, false);
          }}
          className="mb-2 block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-secondary file:px-3 file:py-1.5 file:text-sm"
        />
      )}
      <p className="mb-3 text-[11px] text-text-3">
        La primera fila son los nombres de las columnas, iguales a los campos. Una celda vacía no cambia nada.
        Exportá la lista para tener el formato exacto.
      </p>

      {resultado && (
        <>
          <p className="mb-2 text-sm">
            {resultado.aplicado ? "Listo: " : ""}
            {resultado.resumen.crear} {resultado.aplicado ? "creados" : "nuevos"} · {resultado.resumen.actualizar}{" "}
            {resultado.aplicado ? "actualizados" : "con cambios"} · {resultado.resumen.sin_cambios} iguales ·{" "}
            {resultado.resumen.error} con errores
          </p>
          {resultado.noReconocidas.length > 0 && (
            <p className="mb-2 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning-text">
              Estas columnas no se cargaron porque no son campos de {nombrePlural.toLowerCase()}:{" "}
              {resultado.noReconocidas.join(", ")}. Las tiene que agregar un administrador.
            </p>
          )}
          {resultado.filas.some((f) => f.accion !== "sin_cambios") && (
            <div className="mb-3 max-h-80 overflow-auto">
              <Tabla className="min-w-[560px]">
                <thead className="border-b bg-secondary/40">
                  <tr>
                    <Th>Fila</Th>
                    <Th>Nombre</Th>
                    <Th>Qué pasa</Th>
                    <Th>Detalle</Th>
                  </tr>
                </thead>
                <tbody>
                  {resultado.filas
                    .filter((f) => f.accion !== "sin_cambios")
                    .map((f) => (
                      <tr key={f.fila} className="border-b last:border-0">
                        <Td className="tabular-nums text-text-3">{f.fila}</Td>
                        <Td className="font-medium">{f.titulo || "—"}</Td>
                        <Td>
                          <Badge variant={ETIQUETA[f.accion].variant}>{ETIQUETA[f.accion].texto}</Badge>
                        </Td>
                        <Td className="text-text-2">{f.mensaje ?? f.cambios.join(" · ")}</Td>
                      </tr>
                    ))}
                </tbody>
              </Tabla>
            </div>
          )}
        </>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {resultado?.aplicado ? (
          <Button size="sm" onClick={onAplicado}>
            Cerrar
          </Button>
        ) : (
          <>
            <Button
              size="sm"
              disabled={!texto || !resultado || aCargar === 0 || trabajando}
              onClick={() => texto && void enviar(texto, true)}
            >
              {aCargar ? `Cargar ${aCargar}` : "Cargar"}
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancelar}>
              Cancelar
            </Button>
          </>
        )}
        {trabajando && <span className="text-sm text-text-3">Leyendo…</span>}
        {error && <span className="text-sm text-danger-text">{error}</span>}
      </div>
    </div>
  );
}
