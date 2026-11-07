"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

type Conocimiento = { texto: string; memoriaVieja: string; motor: string };
type Respuesta = {
  hoy: Conocimiento;
  simulado: Conocimiento | null;
  simular: string[];
  objetos: { clave: string; nombrePlural: string; visibleAgente: boolean }[];
};

/**
 * Lo que lee el agente, tal cual le llega (la base de conocimiento, la memoria
 * de edificios de antes y los objetos visibles), y cómo quedaría si se
 * prendieran otros objetos. Sirve para comparar antes de cambiar nada.
 */
export function ConocimientoClient() {
  const [simular, setSimular] = useState<string[]>([]);
  const [data, setData] = useState<Respuesta | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctl = new AbortController();
    const q = simular.length ? `?simular=${encodeURIComponent(simular.join(","))}` : "";
    fetch(`/api/agent/conocimiento${q}`, { signal: ctl.signal })
      .then(async (r) => {
        const body = await r.json().catch(() => null);
        if (!r.ok) throw new Error(body?.error?.message ?? "No se pudo cargar");
        setData(body as Respuesta);
        setError(null);
      })
      .catch((e: unknown) => {
        if (!ctl.signal.aborted) setError(e instanceof Error ? e.message : "No se pudo cargar");
      });
    return () => ctl.abort();
  }, [simular]);

  const apagados = data?.objetos.filter((o) => !o.visibleAgente) ?? [];

  return (
    <div className="flex h-full flex-col">
      <header className="border-b px-4 py-3 sm:px-6 sm:py-4">
        <Link href="/agent" className="mb-1 inline-flex items-center gap-1 text-xs text-text-3 hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Agente
        </Link>
        <h2 className="text-[17px] font-bold tracking-tight">Lo que lee el agente</h2>
        <p className="text-xs text-text-3">
          El texto exacto que recibe con cada mensaje: la base de conocimiento y los datos del CRM que tiene visibles.
        </p>
      </header>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3 sm:p-6">
        {error && <p className="text-sm text-danger-text">{error}</p>}
        {apagados.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-text-3">Ver cómo quedaría si el agente también leyera:</span>
            {apagados.map((o) => {
              const activo = simular.includes(o.clave);
              return (
                <button
                  key={o.clave}
                  type="button"
                  aria-pressed={activo}
                  onClick={() => setSimular(activo ? simular.filter((s) => s !== o.clave) : [...simular, o.clave])}
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-xs",
                    activo ? "border-brand bg-brand-tint text-brand-text" : "border-border-strong hover:border-foreground"
                  )}
                >
                  {o.nombrePlural}
                </button>
              );
            })}
          </div>
        )}
        {data && (
          <div className={cn("grid gap-4", data.simulado && "lg:grid-cols-2")}>
            <Bloque titulo="Hoy" c={data.hoy} />
            {data.simulado && <Bloque titulo="Así quedaría (no cambia nada todavía)" c={data.simulado} />}
          </div>
        )}
      </div>
    </div>
  );
}

function Bloque({ titulo, c }: { titulo: string; c: Conocimiento }) {
  return (
    <section className="min-w-0 rounded-lg border border-border-strong bg-card shadow-sm">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-2.5">
        <h3 className="text-[14px] font-bold">{titulo}</h3>
        <span className="text-xs text-text-3">
          {c.texto.length.toLocaleString("es-AR")} caracteres
          {c.memoriaVieja ? " · con la memoria de edificios de antes" : ""}
          {c.motor ? " · con datos del motor" : ""}
        </span>
      </header>
      <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-[12px] leading-relaxed">
        {c.texto}
      </pre>
    </section>
  );
}
