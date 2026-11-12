"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAvisoGuardado } from "@/components/ui/aviso-guardado";
import { CHANNEL_LABEL, type Channel } from "@/lib/channels";
import { DERIVADA_URGENTE_MIN, LINKS_INICIO, hace, type DerivadaDto, type TonoMotivo } from "@/lib/inicio";
import { cn } from "@/lib/utils";

const CHIP: Record<TonoMotivo, string> = {
  rojo: "bg-danger-tint text-danger-text",
  ambar: "bg-warning-tint text-warning-text",
  marca: "bg-brand-tint text-brand-ink",
};

function iniciales(nombre: string): string {
  const p = nombre.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "?") + (p[1]?.[0] ?? "")).toUpperCase();
}

/**
 * Inicio · Derivadas por la IA — del equipo hasta que alguien las toma. «Tomar»
 * la deja a cargo de quien la toca; «Responder» además abre el chat.
 */
export function Derivadas({
  derivadas,
  total,
  agente,
  onCambio,
}: {
  derivadas: DerivadaDto[];
  total: number;
  agente: string;
  onCambio: () => void;
}) {
  const router = useRouter();
  const avisar = useAvisoGuardado();
  const [ocupada, setOcupada] = useState<string | null>(null);

  async function tomar(d: DerivadaDto, abrir: boolean) {
    setOcupada(d.conversationId);
    const res = await fetch(`/api/inicio/derivadas/${d.conversationId}/tomar`, { method: "POST" }).catch(() => null);
    setOcupada(null);
    if (!res?.ok) {
      const e = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
      avisar(e?.error?.message ?? "No se pudo tomar", "error");
      onCambio();
      return;
    }
    if (abrir) {
      router.push(`/inbox?conversation=${encodeURIComponent(d.conversationId)}`);
      return;
    }
    avisar(`Tomaste el chat con ${d.contacto.nombre}`);
    onCambio();
  }

  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <h3 className="text-[15px] font-bold tracking-tight">Derivadas por {agente}</h3>
          <p className="text-[12px] text-text-3">Del equipo: le aparecen a todos hasta que alguien las toma.</p>
        </div>
        {total > 0 && (
          <Link href={LINKS_INICIO.derivadas} className="shrink-0 text-[12.5px] font-medium text-brand-ink hover:underline">
            {total > derivadas.length ? `Ver las ${total} en la Bandeja →` : "Ver en la Bandeja →"}
          </Link>
        )}
      </header>
      {derivadas.length === 0 ? (
        <p className="px-4 py-6 text-center text-[13px] text-text-3">No hay chats esperando a una persona.</p>
      ) : (
        <ul className="divide-y divide-border">
          {derivadas.map((d) => {
            const espera = hace(d.esperaDesde);
            const urgente = (Date.now() - Date.parse(d.esperaDesde)) / 60_000 > DERIVADA_URGENTE_MIN;
            return (
              <li key={d.conversationId} className="flex items-start gap-3 px-4 py-3">
                <span
                  className="grid size-9 shrink-0 place-items-center rounded-full text-[12px] font-bold text-white"
                  style={{ background: d.edificio?.color ?? "var(--text-3)" }}
                >
                  {iniciales(d.contacto.nombre)}
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate font-semibold">{d.contacto.nombre}</span>
                    {d.edificio && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium">
                        <span className="size-2 rounded-full" style={{ background: d.edificio.color ?? "var(--text-3)" }} />
                        {d.edificio.nombre}
                      </span>
                    )}
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", CHIP[d.motivo.tono])}>
                      {d.motivo.texto}
                    </span>
                  </div>
                  {d.ultimoMensaje && (
                    <p className="truncate text-[13px] text-text-2">«{d.ultimoMensaje}»</p>
                  )}
                  <p className={cn("text-[11.5px]", urgente ? "font-medium text-danger-text" : "text-text-3")}>
                    Sin tomar · esperando hace {espera} · {CHANNEL_LABEL[d.canal as Channel] ?? d.canal}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col gap-1.5 sm:flex-row">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={ocupada === d.conversationId}
                    onClick={() => void tomar(d, false)}
                  >
                    Tomar
                  </Button>
                  <Button size="sm" disabled={ocupada === d.conversationId} onClick={() => void tomar(d, true)}>
                    Responder
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
