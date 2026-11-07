"use client";

import { useState } from "react";
import { FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * War — Importar Notion. Se elige el archivo que armó Claude desde los CSV,
 * se prueba (no guarda nada y muestra qué haría) y recién después se importa.
 * Se manda en lotes; se puede repetir sin duplicar.
 */

type Informe = {
  contactos: { nuevos: number; unidos: number; yaImportados: number; sinTelefono: number };
  oportunidades: { nuevas: number; yaImportadas: number; unidasPorLead: number; unidasConExistente: number };
  notas: number;
  tareas: number;
  edificiosCreados: string[];
  problemas: string[];
};
type Archivo = { edificios: unknown[]; contactos: unknown[]; oportunidadesSinContacto: unknown[] };

const LOTE = 100;

function sumar(a: Informe | null, b: Informe): Informe {
  if (!a) return b;
  return {
    contactos: {
      nuevos: a.contactos.nuevos + b.contactos.nuevos,
      unidos: a.contactos.unidos + b.contactos.unidos,
      yaImportados: a.contactos.yaImportados + b.contactos.yaImportados,
      sinTelefono: a.contactos.sinTelefono + b.contactos.sinTelefono,
    },
    oportunidades: {
      nuevas: a.oportunidades.nuevas + b.oportunidades.nuevas,
      yaImportadas: a.oportunidades.yaImportadas + b.oportunidades.yaImportadas,
      unidasPorLead: a.oportunidades.unidasPorLead + b.oportunidades.unidasPorLead,
      unidasConExistente: a.oportunidades.unidasConExistente + b.oportunidades.unidasConExistente,
    },
    notas: a.notas + b.notas,
    tareas: a.tareas + b.tareas,
    edificiosCreados: [...new Set([...a.edificiosCreados, ...b.edificiosCreados])],
    problemas: [...new Set([...a.problemas, ...b.problemas])],
  };
}

export function ImportarNotionClient() {
  const [archivo, setArchivo] = useState<Archivo | null>(null);
  const [nombre, setNombre] = useState("");
  const [corriendo, setCorriendo] = useState<null | "prueba" | "importar">(null);
  const [avance, setAvance] = useState(0);
  const [informe, setInforme] = useState<{ modo: "prueba" | "importar"; datos: Informe } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function leer(f: File | null) {
    setError(null);
    setInforme(null);
    if (!f) return;
    try {
      const d = JSON.parse(await f.text()) as Archivo & { fuente?: string };
      if (d.fuente !== "notion-csv" || !Array.isArray(d.contactos)) throw new Error("formato");
      setArchivo(d);
      setNombre(f.name);
    } catch {
      setError("Ese archivo no es el de la importación de Notion.");
    }
  }

  async function correr(modo: "prueba" | "importar") {
    if (!archivo) return;
    if (modo === "importar" && !window.confirm("¿Importar los datos de Notion al CRM? Se puede repetir sin duplicar.")) return;
    setCorriendo(modo);
    setError(null);
    setInforme(null);
    setAvance(0);
    let total: Informe | null = null;
    const lotes: Archivo[] = [];
    for (let i = 0; i < archivo.contactos.length; i += LOTE) {
      lotes.push({ edificios: archivo.edificios, contactos: archivo.contactos.slice(i, i + LOTE), oportunidadesSinContacto: [] });
    }
    lotes.push({ edificios: archivo.edificios, contactos: [], oportunidadesSinContacto: archivo.oportunidadesSinContacto });
    for (const [i, lote] of lotes.entries()) {
      const r = await fetch("/api/importar/notion", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ aplicar: modo === "importar", ...lote }),
      }).catch(() => null);
      if (!r?.ok) {
        const d = (await r?.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(`Se cortó en la parte ${i + 1} de ${lotes.length}: ${d?.error?.message ?? "error de conexión"}. Podés volver a correrlo: lo ya importado no se duplica.`);
        break;
      }
      total = sumar(total, ((await r.json()) as { informe: Informe }).informe);
      setAvance(Math.round(((i + 1) / lotes.length) * 100));
    }
    if (total) setInforme({ modo, datos: total });
    setCorriendo(null);
  }

  const i = informe?.datos;
  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Importar desde Notion</CardTitle>
          <CardDescription>
            Contactos, oportunidades (con su estado, motivo y edificios), comentarios de las tareas como notas y las tareas
            abiertas. Primero probá: no guarda nada y muestra qué haría. Se puede repetir sin duplicar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent">
            <FileUp className="h-4 w-4" />
            {nombre || "Elegir el archivo de importación (.json)"}
            <input type="file" accept="application/json,.json" className="hidden" onChange={(e) => void leer(e.target.files?.[0] ?? null)} />
          </label>
          {archivo && (
            <p className="text-sm text-text-2">
              {archivo.contactos.length.toLocaleString("es-AR")} contactos en el archivo.
            </p>
          )}
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={!archivo || corriendo !== null} onClick={() => void correr("prueba")}>
              {corriendo === "prueba" ? `Probando… ${avance}%` : "Probar (no guarda)"}
            </Button>
            <Button size="sm" disabled={!archivo || corriendo !== null || informe?.modo !== "prueba"} onClick={() => void correr("importar")}>
              {corriendo === "importar" ? `Importando… ${avance}%` : "Importar"}
            </Button>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {i && (
            <div className="space-y-3 rounded-md border bg-subtle p-4 text-sm" data-testid="informe-importacion">
              <p className="font-semibold">{informe.modo === "prueba" ? "Así quedaría (todavía no se guardó nada)" : "Importación terminada"}</p>
              <ul className="space-y-1">
                <li>
                  Contactos: {i.contactos.nuevos} nuevos · {i.contactos.unidos} unidos con uno que ya estaba · {i.contactos.yaImportados} ya
                  importados · {i.contactos.sinTelefono} sin teléfono
                </li>
                <li>
                  Oportunidades: {i.oportunidades.nuevas} nuevas · {i.oportunidades.unidasPorLead} unidas por ID de lead ·{" "}
                  {i.oportunidades.unidasConExistente} unidas con una del CRM · {i.oportunidades.yaImportadas} ya importadas
                </li>
                <li>Notas: {i.notas} · Tareas abiertas: {i.tareas}</li>
                {i.edificiosCreados.length > 0 && <li>Edificios que se crean: {i.edificiosCreados.join(", ")}</li>}
              </ul>
              {i.problemas.length > 0 && (
                <details>
                  <summary className="cursor-pointer">Para revisar ({i.problemas.length})</summary>
                  <ul className="mt-2 max-h-72 list-disc space-y-0.5 overflow-auto pl-5 text-xs text-text-2">
                    {i.problemas.slice(0, 500).map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
