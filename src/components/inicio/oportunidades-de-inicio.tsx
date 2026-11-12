"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Maximize2 } from "lucide-react";
import { OrigenIcono } from "@/components/ventas/origen-icono";
import { hace, type OportunidadDeInicio } from "@/lib/inicio";
import type { OrigenDto } from "@/lib/origenes";
import { cn } from "@/lib/utils";
import { TIPOS_OPORTUNIDAD, etiqueta } from "@/lib/ventas";

type IconoDeOrigen = Map<string, { icono: string; imagen: string | null }>;

/** Los íconos de los orígenes (Configuración → Orígenes), una vez por página. */
export function useIconosDeOrigen(): IconoDeOrigen {
  const [iconos, setIconos] = useState<IconoDeOrigen>(new Map());
  useEffect(() => {
    void fetch("/api/origenes")
      .then((r) => (r.ok ? r.json() : { origenes: [] }))
      .then((d: { origenes: OrigenDto[] }) =>
        setIconos(new Map(d.origenes.map((o) => [o.nombre, { icono: o.icono, imagen: o.imagen }])))
      )
      .catch(() => undefined);
  }, []);
  return iconos;
}

function iniciales(nombre: string): string {
  const p = nombre.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "?") + (p[1]?.[0] ?? "")).toUpperCase();
}

function fechaCorta(iso: string, zona: string): string {
  try {
    return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", timeZone: zona }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

/** «Llamada hoy 15:00», «Visita mañana 11:30», «Llamada 18/11 10:00». */
function textoProximo(p: { tipo: string; titulo: string; at: string }, zona: string): string {
  const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("es-AR", { ...o, timeZone: zona });
  const dia = (d: Date) => fmt({ year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const at = new Date(p.at);
  const hoy = new Date();
  const manana = new Date(hoy.getTime() + 86_400_000);
  const hora = fmt({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
  const cuando = dia(at) === dia(hoy) ? "hoy" : dia(at) === dia(manana) ? "mañana" : fechaCorta(p.at, zona);
  const nombre = { llamada: "Llamada", visita: "Visita", mensaje: "Mensaje", reunion: "Reunión", correo: "Correo" }[p.tipo] ?? p.titulo;
  return `${nombre} ${cuando} ${hora}`;
}

function Fila({
  o,
  iconos,
  detalle,
  derecha,
}: {
  o: OportunidadDeInicio;
  iconos: IconoDeOrigen;
  detalle: React.ReactNode;
  derecha: React.ReactNode;
}) {
  const origen = o.origen ? iconos.get(o.origen) : undefined;
  const interes = [
    o.ambientes.length ? `${o.ambientes.join(", ")} amb.` : null,
    o.unidad ? `Unidad ${o.unidad}` : null,
  ].filter(Boolean);
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span
        className="grid size-9 shrink-0 place-items-center rounded-full text-[12px] font-bold text-white"
        style={{ background: o.edificio?.color ?? "var(--text-3)" }}
      >
        {iniciales(o.nombre)}
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {o.tipo && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-text-2">
              {etiqueta(TIPOS_OPORTUNIDAD, o.tipo)}
            </span>
          )}
          <span className="truncate font-semibold">{o.nombre}</span>
          {o.edificio && (
            <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium">
              <span className="size-2 rounded-full" style={{ background: o.edificio.color ?? "var(--text-3)" }} />
              {o.edificio.nombre}
            </span>
          )}
        </div>
        <p className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-text-3">
          {o.origen && (
            <span className="inline-flex items-center gap-1">
              <OrigenIcono icono={origen?.icono ?? null} imagen={origen?.imagen} className="size-3.5" />
              {o.origen}
            </span>
          )}
          {interes.length > 0 && <span>· {interes.join(" · ")}</span>}
          <span>· {detalle}</span>
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {derecha}
        <Link
          href={`/oportunidades/${o.id}`}
          aria-label={`Abrir ${o.nombre}`}
          className="grid size-8 place-items-center rounded-lg border border-border text-text-2 hover:bg-accent hover:text-foreground"
        >
          <Maximize2 className="size-3.5" />
        </Link>
      </div>
    </li>
  );
}

function Bloque({
  titulo,
  bajada,
  total,
  href,
  vacio,
  children,
}: {
  titulo: string;
  bajada: string;
  total: number;
  href: string;
  vacio: string;
  children: React.ReactNode[];
}) {
  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <h3 className="text-[15px] font-bold tracking-tight">
            {titulo} <span className="font-mono text-[12px] font-medium text-text-3">{total}</span>
          </h3>
          <p className="text-[12px] text-text-3">{bajada}</p>
        </div>
        {total > 0 && (
          <Link href={href} className="shrink-0 text-[12.5px] font-medium text-brand-ink hover:underline">
            Revisar en Oportunidades →
          </Link>
        )}
      </header>
      {children.length === 0 ? (
        <p className="px-4 py-6 text-center text-[13px] text-text-3">{vacio}</p>
      ) : (
        <ul className="divide-y divide-border">{children}</ul>
      )}
    </section>
  );
}

/** Inicio · Nuevas para vos — asignadas y todavía sin primer contacto. */
export function NuevasParaVos({
  lista,
  total,
  href,
  iconos,
}: {
  lista: OportunidadDeInicio[];
  total: number;
  href: string;
  iconos: IconoDeOrigen;
}) {
  return (
    <Bloque
      titulo="Nuevas para vos"
      bajada="Asignadas a vos y todavía sin primer contacto."
      total={total}
      href={href}
      vacio="No tenés oportunidades nuevas sin contactar."
    >
      {lista.map((o) => (
        <Fila
          key={o.id}
          o={o}
          iconos={iconos}
          detalle={`asignada hace ${hace(o.asignadaDesde)}`}
          derecha={
            <span className="hidden rounded-full bg-warning-tint px-2 py-0.5 text-[11px] font-medium text-warning-text sm:inline">
              Sin primer contacto
            </span>
          }
        />
      ))}
    </Bloque>
  );
}

/** Inicio · Leads calientes — visitaron y siguen abiertas; al lado, el próximo paso. */
export function LeadsCalientes({
  lista,
  total,
  href,
  iconos,
  zona,
}: {
  lista: OportunidadDeInicio[];
  total: number;
  href: string;
  iconos: IconoDeOrigen;
  zona: string;
}) {
  return (
    <Bloque
      titulo="Leads calientes"
      bajada="Ya visitaron y siguen abiertas. Arriba, las que no tienen próximo paso."
      total={total}
      href={href}
      vacio="Nadie en Visitó por ahora."
    >
      {lista.map((o) => (
        <Fila
          key={o.id}
          o={o}
          iconos={iconos}
          detalle={`visitó hace ${hace(o.visitoDesde)} (${fechaCorta(o.visitoDesde, zona)})`}
          derecha={
            <span
              className={cn(
                "hidden rounded-full px-2 py-0.5 text-[11px] font-medium sm:inline",
                o.proximoPaso ? "bg-success-tint text-success-text" : "bg-warning-tint text-warning-text"
              )}
            >
              {o.proximoPaso ? textoProximo(o.proximoPaso, zona) : "Sin próximo paso"}
            </span>
          }
        />
      ))}
    </Bloque>
  );
}
