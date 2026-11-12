"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Flame, ListTodo, Plus, Sparkles, UserPlus, type LucideIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Pagina } from "@/components/ventas/ui";
import { cn } from "@/lib/utils";
import { DERIVADA_URGENTE_MIN, LINKS_INICIO, fechaLarga, hace, saludo, type InicioDto } from "@/lib/inicio";

/** La hora (0–23) en la zona del negocio. */
function horaEn(zona: string): number {
  try {
    const h = new Intl.DateTimeFormat("es-AR", { hour: "numeric", hourCycle: "h23", timeZone: zona }).format(new Date());
    return Number.parseInt(h, 10);
  } catch {
    return new Date().getHours();
  }
}

function horaCorta(iso: string, zona: string): string {
  try {
    return new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: zona }).format(
      new Date(iso)
    );
  } catch {
    return iso.slice(11, 16);
  }
}

type Tono = "brand" | "info" | "success" | "warning" | "danger";
const TONO: Record<Tono, string> = {
  brand: "bg-brand-tint text-brand-ink",
  info: "bg-info-tint text-info-text",
  success: "bg-success-tint text-success-text",
  warning: "bg-warning-tint text-warning-text",
  danger: "bg-danger-tint text-danger-text",
};

function Tarjeta({
  titulo,
  icono: Icono,
  tono,
  numero,
  contexto,
  contextoUrgente,
  boton,
}: {
  titulo: string;
  icono: LucideIcon;
  tono: Tono;
  numero: number;
  contexto: React.ReactNode;
  contextoUrgente?: boolean;
  boton?: { texto: string; href: string; filtro: string };
}) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-[13.5px] font-semibold text-text-2">{titulo}</h3>
        <span className={cn("grid size-8 place-items-center rounded-lg", TONO[tono])}>
          <Icono className="size-4" strokeWidth={1.9} />
        </span>
      </header>
      <p className="font-mono text-[34px] font-bold leading-none tracking-tight">{numero}</p>
      <p className={cn("min-h-[2.5em] text-[12.5px]", contextoUrgente ? "font-medium text-danger-text" : "text-text-3")}>
        {contexto}
      </p>
      {boton && (
        <div className="mt-auto space-y-1">
          <Link href={boton.href} className={cn(buttonVariants({ size: "sm", variant: "secondary" }), "w-full")}>
            {boton.texto}
          </Link>
          <p className="truncate text-[11px] text-text-3" title={`Se abre filtrado: ${boton.filtro}`}>
            Se abre filtrado: {boton.filtro}
          </p>
        </div>
      )}
    </section>
  );
}

/**
 * Inicio del vendedor: qué tiene que atender hoy quien entra. Se refresca al
 * volver a la pestaña y cada minuto.
 */
export function InicioClient() {
  const [datos, setDatos] = useState<InicioDto | null>(null);
  const [error, setError] = useState(false);

  const cargar = useCallback(async () => {
    const res = await fetch("/api/inicio?usuario=me").catch(() => null);
    if (!res?.ok) {
      setError(true);
      return;
    }
    setError(false);
    setDatos((await res.json()) as InicioDto);
  }, []);

  useEffect(() => {
    void cargar();
    const cada = window.setInterval(() => void cargar(), 60_000);
    const alVolver = () => {
      if (document.visibilityState === "visible") void cargar();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      window.clearInterval(cada);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [cargar]);

  const c = datos?.contadores;
  const nombre = datos?.usuario.nombre.trim().split(/\s+/)[0] ?? "";
  const titulo = c ? `${saludo(horaEn(c.zona))}${nombre ? `, ${nombre}` : ""}` : "Inicio";
  const yo = datos?.usuario.nombre ?? "vos";
  const esperaMin = c?.derivadaMasViejaAt ? (Date.now() - Date.parse(c.derivadaMasViejaAt)) / 60_000 : 0;

  return (
    <Pagina
      titulo={titulo}
      detalle={c ? fechaLarga(c.hoy) : undefined}
      accion={
        <Link href="/oportunidades?nueva=1" className={buttonVariants({ size: "sm" })}>
          <Plus className="h-4 w-4" strokeWidth={1.8} />
          Nueva oportunidad
        </Link>
      }
    >
      {error && !datos && <p className="text-sm text-text-3">No se pudo cargar el Inicio. Probá de nuevo en un rato.</p>}
      {!error && !c && <p className="text-sm text-text-3">Cargando…</p>}
      {c && datos && (
        <div className="grid gap-[var(--hueco)] [grid-template-columns:repeat(auto-fit,minmax(210px,1fr))]">
          <Tarjeta
            titulo="Nuevas para vos"
            icono={UserPlus}
            tono="brand"
            numero={c.nuevas}
            contexto="Asignadas a vos y sin primer contacto"
            boton={{
              texto: "Revisar en Oportunidades",
              href: LINKS_INICIO.nuevas,
              filtro: `Responsable ${yo} · Sin primer contacto`,
            }}
          />
          <Tarjeta
            titulo="Tareas de hoy"
            icono={ListTodo}
            tono="info"
            numero={c.tareasHoy}
            contexto={
              c.tareasVencidas > 0
                ? `${c.tareasVencidas} ${c.tareasVencidas === 1 ? "vencida" : "vencidas"} de días anteriores`
                : "Ninguna vencida"
            }
            contextoUrgente={c.tareasVencidas > 0}
            boton={{
              texto: "Revisar en Tareas",
              href: LINKS_INICIO.tareas,
              filtro: `Responsable ${yo} · Realizar · hasta hoy`,
            }}
          />
          <Tarjeta
            titulo="Visitas de hoy"
            icono={CalendarDays}
            tono="success"
            numero={c.visitasHoy}
            contexto={
              c.proximaVisita
                ? `Próxima: ${horaCorta(c.proximaVisita.at, c.zona)}${c.proximaVisita.contacto ? ` · ${c.proximaVisita.contacto}` : ""}`
                : c.visitasHoy > 0
                  ? "No quedan más por hoy"
                  : "Sin visitas para hoy"
            }
            boton={{
              texto: "Revisar en Tareas",
              href: LINKS_INICIO.visitas,
              filtro: `Responsable ${yo} · Visitas y reuniones · hoy`,
            }}
          />
          <Tarjeta
            titulo={`Derivadas por ${datos.agente}`}
            icono={Sparkles}
            tono="warning"
            numero={c.derivadas}
            contexto={
              c.derivadaMasViejaAt
                ? `Del equipo · la más vieja espera hace ${hace(c.derivadaMasViejaAt)}`
                : "Del equipo · ninguna esperando"
            }
            contextoUrgente={esperaMin > DERIVADA_URGENTE_MIN}
          />
          <Tarjeta
            titulo="Leads calientes"
            icono={Flame}
            tono="danger"
            numero={c.calientes}
            contexto="Ya visitaron y siguen abiertas"
            boton={{
              texto: "Revisar en Oportunidades",
              href: LINKS_INICIO.calientes,
              filtro: `Responsable ${yo} · Estado: Visitó`,
            }}
          />
        </div>
      )}
    </Pagina>
  );
}
