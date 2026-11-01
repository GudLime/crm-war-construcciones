"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { DEFAULT_CURRENCY, formatMoneyCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { etiqueta } from "@/lib/ventas";

export async function mensajeDe(res: Response): Promise<string> {
  const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  return data?.error?.message ?? "No se pudo guardar";
}

/** La moneda la elige el negocio en Ajustes → Marca. */
export function useMoneda(): string {
  const [moneda, setMoneda] = useState<string>(DEFAULT_CURRENCY);
  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/settings/branding").catch(() => null);
      if (!res?.ok) return;
      const data = (await res.json()) as { branding?: { currency?: string } };
      if (data.branding?.currency) setMoneda(data.branding.currency);
    })();
  }, []);
  return moneda;
}

export function plata(cents: number | null, moneda: string | null, negocio: string): string {
  return formatMoneyCents(cents, moneda ?? negocio, "es-AR") ?? "—";
}

export function aLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function fechaVisible(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

const VERDE = new Set(["disponible", "terminado", "listo", "compro"]);
const AMBAR = new Set([
  "reservado",
  "consultar",
  "en_construccion",
  "en_pozo",
  "en_charlas",
  "conoce_informacion",
  "visito",
  "reservo",
  "realizar",
]);
const ROJO = new Set(["vendido", "perdido", "no_calificado", "no_responde"]);

export function EstadoPill({
  opciones,
  value,
}: {
  opciones: readonly { value: string; label: string }[];
  value: string;
}) {
  const variant = VERDE.has(value)
    ? "success"
    : AMBAR.has(value)
      ? "warning"
      : ROJO.has(value)
        ? "destructive"
        : "secondary";
  return <Badge variant={variant}>{etiqueta(opciones, value)}</Badge>;
}

export function Pagina({
  titulo,
  detalle,
  accion,
  children,
}: {
  titulo: React.ReactNode;
  detalle?: React.ReactNode;
  accion?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-6 sm:py-4">
        <div className="min-w-0">
          <h2 className="text-[17px] font-bold tracking-tight">{titulo}</h2>
          {detalle && <p className="mt-0.5 text-sm text-text-3">{detalle}</p>}
        </div>
        {accion}
      </header>
      <div className="min-h-0 flex-1 overflow-auto px-4 py-4 sm:px-6 sm:py-5">{children}</div>
    </div>
  );
}

export function Campo({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <span className="text-xs font-medium text-text-2">{label}</span>
      {children}
    </label>
  );
}

export function SelectNativo({
  value,
  onChange,
  children,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:border-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-soft",
        className
      )}
    >
      {children}
    </select>
  );
}

export function Ficha({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-5 rounded-lg border bg-card p-4 shadow-sm">
      <p className="mb-3 text-sm font-semibold">{titulo}</p>
      {children}
    </div>
  );
}

export const grilla = "grid gap-3 sm:grid-cols-2 lg:grid-cols-3";

/** El form envuelve la grilla; las acciones van afuera de la grilla. */
export function Acciones({
  error,
  children,
}: {
  error: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-3">
      {children}
      {error && <p className="text-sm text-danger-text">{error}</p>}
    </div>
  );
}

export function Tabla({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className={cn("w-full min-w-[760px] border-collapse text-left text-sm", className)}>
        {children}
      </table>
    </div>
  );
}

export function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={cn("px-3 py-2 text-xs font-medium text-text-3", className)}>{children}</th>
  );
}

export function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={cn("px-3 py-2.5 align-middle", className)}>{children}</td>;
}

export function numero(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : Number.NaN;
}
