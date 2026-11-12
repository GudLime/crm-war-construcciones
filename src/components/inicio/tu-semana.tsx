"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { duracion, porcentaje, tendencia, type SemanaDto } from "@/lib/inicio";
import { cn } from "@/lib/utils";

type Celda = {
  titulo: string;
  valor: string;
  anterior: string;
  t: ReturnType<typeof tendencia>;
};

/**
 * Inicio · Tu semana — desde el lunes, contra la semana anterior hasta el
 * mismo punto. La flecha va en verde si mejora y en rojo si empeora.
 */
export function TuSemana({ semana }: { semana: SemanaDto }) {
  const { actual: a, anterior: b } = semana;
  const pctA = porcentaje(a.contactadas, a.nuevas);
  const pctB = porcentaje(b.contactadas, b.nuevas);
  const celdas: Celda[] = [
    { titulo: "Nuevas asignadas", valor: String(a.nuevas), anterior: String(b.nuevas), t: tendencia(a.nuevas, b.nuevas, true) },
    {
      titulo: "Contactadas",
      valor: pctA == null ? "—" : `${pctA}%`,
      anterior: pctB == null ? "—" : `${pctB}%`,
      t: tendencia(pctA, pctB, true),
    },
    {
      titulo: "Hasta el 1.er contacto",
      valor: duracion(a.primerContactoSeg),
      anterior: duracion(b.primerContactoSeg),
      t: tendencia(a.primerContactoSeg, b.primerContactoSeg, false),
    },
    { titulo: "Visitas", valor: String(a.visitas), anterior: String(b.visitas), t: tendencia(a.visitas, b.visitas, true) },
    { titulo: "Reservas", valor: String(a.reservas), anterior: String(b.reservas), t: tendencia(a.reservas, b.reservas, true) },
    { titulo: "Perdidas", valor: String(a.perdidas), anterior: String(b.perdidas), t: tendencia(a.perdidas, b.perdidas, false) },
  ];

  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <h3 className="text-[15px] font-bold tracking-tight">Tu semana</h3>
          <p className="text-[12px] text-text-3">Desde el lunes, contra la semana pasada.</p>
        </div>
        <Link href="/results" className="text-[12.5px] font-medium text-brand-ink hover:underline">
          Ver Resultados →
        </Link>
      </header>
      <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3">
        {celdas.map((c) => {
          const Flecha = c.t.sentido === "sube" ? ArrowUp : c.t.sentido === "baja" ? ArrowDown : Minus;
          return (
            <div key={c.titulo} className="bg-card px-3 py-3">
              <p className="text-[11.5px] text-text-3">{c.titulo}</p>
              <p className="mt-1 font-mono text-[20px] font-bold leading-none">{c.valor}</p>
              <p
                className={cn(
                  "mt-1.5 inline-flex items-center gap-1 text-[11px]",
                  c.t.bueno === true ? "text-success-text" : c.t.bueno === false ? "text-danger-text" : "text-text-3"
                )}
                title={`Semana pasada: ${c.anterior}`}
              >
                <Flecha className="size-3" strokeWidth={2.2} />
                {c.anterior} la semana pasada
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
