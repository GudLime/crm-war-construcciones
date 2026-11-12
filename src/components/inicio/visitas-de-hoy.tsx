"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAvisoGuardado } from "@/components/ui/aviso-guardado";
import { LINKS_INICIO, VENTANA_URGENTE_MIN, quedan, type VentanaPorCerrar, type VisitaDeHoy } from "@/lib/inicio";
import { cn } from "@/lib/utils";

function hora(iso: string, zona: string): string {
  try {
    return new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: zona }).format(
      new Date(iso)
    );
  } catch {
    return iso.slice(11, 16);
  }
}

function iniciales(nombre: string): string {
  const p = nombre.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "?") + (p[1]?.[0] ?? "")).toUpperCase();
}

/**
 * Inicio · Visitas de hoy — las citas (visita o reunión) de hoy. Las agenda
 * una persona o el agente; «Confirmar» la marca confirmada por quien la toca
 * (no le manda nada al cliente).
 */
export function VisitasDeHoy({
  visitas,
  agente,
  zona,
  onCambio,
}: {
  visitas: VisitaDeHoy[];
  agente: string;
  zona: string;
  onCambio: () => void;
}) {
  const avisar = useAvisoGuardado();
  const [confirmando, setConfirmando] = useState<string | null>(null);

  async function confirmar(v: VisitaDeHoy) {
    setConfirmando(v.id);
    const res = await fetch(`/api/bookings/${v.id}/confirmar`, { method: "POST" }).catch(() => null);
    setConfirmando(null);
    if (!res?.ok) {
      const e = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
      avisar(e?.error?.message ?? "No se pudo confirmar", "error");
      return;
    }
    avisar("Visita confirmada");
    onCambio();
  }

  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <h3 className="text-[15px] font-bold tracking-tight">Visitas de hoy</h3>
        <Link href={LINKS_INICIO.visitas} className="text-[12.5px] font-medium text-brand-ink hover:underline">
          Ver la agenda →
        </Link>
      </header>
      {visitas.length === 0 ? (
        <p className="px-4 py-6 text-center text-[13px] text-text-3">Sin visitas para hoy.</p>
      ) : (
        <ul className="divide-y divide-border">
          {visitas.map((v) => {
            const pasada = v.estado === "realizada" || v.estado === "no_show";
            return (
              <li key={v.id} className={cn("flex items-center gap-3 px-4 py-3", pasada && "opacity-60")}>
                <span className="flex w-14 shrink-0 flex-col items-center rounded-lg bg-brand-tint px-1 py-1.5 text-brand-ink">
                  <span className="font-mono text-[14px] font-bold leading-none">{hora(v.at, zona)}</span>
                  <span className="mt-0.5 text-[10px]">hoy</span>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold">{v.contacto ?? "Sin contacto"}</p>
                  <p className="flex flex-wrap items-center gap-1 text-[11.5px] text-text-3">
                    {v.edificio && (
                      <span className="inline-flex items-center gap-1">
                        <span className="size-2 rounded-full" style={{ background: v.edificio.color ?? "var(--text-3)" }} />
                        {v.edificio.nombre}
                      </span>
                    )}
                    {v.unidad && <span>· Unidad {v.unidad}</span>}
                    <span>· {v.source === "ai" ? `la agendó ${agente}` : "agendada a mano"}</span>
                  </p>
                </div>
                {v.confirmada ? (
                  <span className="shrink-0 rounded-full bg-success-tint px-2 py-0.5 text-[11px] font-medium text-success-text">
                    Confirmada
                  </span>
                ) : (
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="rounded-full bg-warning-tint px-2 py-0.5 text-[11px] font-medium text-warning-text">
                      Sin confirmar
                    </span>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={confirmando === v.id}
                      onClick={() => void confirmar(v)}
                    >
                      Confirmar
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Inicio · Ventana de 24 h por cerrar — todavía se puede escribir sin plantilla. */
export function VentanasPorCerrar({ ventanas }: { ventanas: VentanaPorCerrar[] }) {
  if (ventanas.length === 0) return null;
  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      <header className="border-b px-4 py-3">
        <h3 className="text-[15px] font-bold tracking-tight">Ventana de 24 h por cerrar</h3>
        <p className="text-[12px] text-text-3">Te escribieron y nadie respondió. Después hace falta una plantilla.</p>
      </header>
      <ul className="divide-y divide-border">
        {ventanas.map((v) => {
          const urgente = (Date.parse(v.cierraAt) - Date.now()) / 60_000 < VENTANA_URGENTE_MIN;
          return (
            <li key={v.conversationId} className="flex items-center gap-3 px-4 py-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-soft text-[11px] font-bold text-brand-ink">
                {iniciales(v.contacto)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-medium">{v.contacto}</p>
                <p className={cn("text-[11.5px]", urgente ? "font-medium text-danger-text" : "text-text-3")}>
                  {quedan(v.cierraAt)}
                </p>
              </div>
              <Link
                href={`/inbox?conversation=${encodeURIComponent(v.conversationId)}`}
                className="shrink-0 rounded-lg border border-border px-2.5 py-1 text-[12.5px] font-medium hover:bg-accent"
              >
                Escribir
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
