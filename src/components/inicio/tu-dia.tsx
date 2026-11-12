"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { useAvisoGuardado } from "@/components/ui/aviso-guardado";
import { IconoTipo } from "@/components/ventas/tareas-client";
import { LINKS_INICIO, type ItemDelDia } from "@/lib/inicio";
import { cn } from "@/lib/utils";

function hora(iso: string, zona: string, vencida: boolean): string {
  try {
    const opciones: Intl.DateTimeFormatOptions = vencida
      ? { day: "2-digit", month: "2-digit", timeZone: zona }
      : { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: zona };
    return new Intl.DateTimeFormat("es-AR", opciones).format(new Date(iso));
  } catch {
    return iso.slice(11, 16);
  }
}

/**
 * Inicio · Tu día — tareas para hacer y citas de hoy, por hora; arriba las
 * vencidas. Tildar una tarea la pasa a Listo; las citas no se tildan.
 */
export function TuDia({ items, zona, onCambio }: { items: ItemDelDia[]; zona: string; onCambio: () => void }) {
  const avisar = useAvisoGuardado();
  const [hechas, setHechas] = useState<Set<string>>(new Set());

  async function tildar(it: ItemDelDia) {
    setHechas((h) => new Set(h).add(it.id));
    const res = await fetch(`/api/tareas/${it.id}/hecha`, { method: "POST" }).catch(() => null);
    if (!res?.ok) {
      setHechas((h) => {
        const n = new Set(h);
        n.delete(it.id);
        return n;
      });
      avisar("No se pudo marcar", "error");
      return;
    }
    avisar("Tarea hecha");
    window.setTimeout(onCambio, 900);
  }

  const vencidas = items.filter((i) => i.vencida);
  const deHoy = items.filter((i) => !i.vencida);

  const fila = (it: ItemDelDia) => {
    const hecha = hechas.has(it.id);
    return (
      <li key={`${it.clase}-${it.id}`} className="flex items-center gap-3 px-4 py-2.5">
        <span className={cn("w-11 shrink-0 font-mono text-[12px]", it.vencida ? "text-danger-text" : "text-text-2")}>
          {hora(it.at, zona, it.vencida)}
        </span>
        <IconoTipo tipo={it.tipo} />
        <div className="min-w-0 flex-1">
          <p className={cn("truncate text-[13.5px] font-medium", hecha && "text-text-3 line-through")}>{it.titulo}</p>
          {(it.contacto || it.edificio) && (
            <p className="truncate text-[11.5px] text-text-3">{[it.contacto, it.edificio].filter(Boolean).join(" · ")}</p>
          )}
        </div>
        {it.clase === "tarea" && (
          <button
            type="button"
            aria-label={`Marcar «${it.titulo}» como hecha`}
            disabled={hecha}
            onClick={() => void tildar(it)}
            className={cn(
              "grid size-6 shrink-0 place-items-center rounded-full border-[1.5px] transition",
              hecha ? "border-brand bg-brand text-white" : "border-border-strong text-transparent hover:border-brand hover:text-brand"
            )}
          >
            <Check className="size-3.5" strokeWidth={2.4} />
          </button>
        )}
      </li>
    );
  };

  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <h3 className="text-[15px] font-bold tracking-tight">Tu día</h3>
        <Link href={LINKS_INICIO.tareas} className="text-[12.5px] font-medium text-brand-ink hover:underline">
          Revisar en Tareas →
        </Link>
      </header>
      {vencidas.length > 0 && (
        <>
          <p className="px-4 pt-3 text-[11px] font-semibold uppercase tracking-wide text-danger-text">Vencidas</p>
          <ul className="divide-y divide-border">{vencidas.map(fila)}</ul>
        </>
      )}
      {vencidas.length > 0 && deHoy.length > 0 && (
        <p className="px-4 pt-3 text-[11px] font-semibold uppercase tracking-wide text-text-3">Hoy</p>
      )}
      {deHoy.length > 0 && <ul className="divide-y divide-border">{deHoy.map(fila)}</ul>}
      {items.length === 0 && <p className="px-4 py-6 text-center text-[13px] text-text-3">Nada pendiente para hoy.</p>}
      <div className="border-t px-4 py-2.5">
        <Link href="/tareas?nueva=1" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-text-2 hover:text-foreground">
          <Plus className="size-4" /> Agregar tarea
        </Link>
      </div>
    </section>
  );
}
