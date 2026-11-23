import { z } from "zod";

/**
 * Resultados — la barra de período, edificio y filtros (spec
 * `claude/resultados-rediseno.md` §1). Lo puro: las pestañas de fábrica
 * (relativas a hoy, en la zona del negocio), el formato del rango y lo que
 * guarda cada pestaña propia.
 */

export type Rango = { desde: string; hasta: string };

function sumar(fecha: string, dias: number): string {
  const [a, m, d] = fecha.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

function primeroDelMes(fecha: string, mesesAtras = 0): string {
  const [a, m] = fecha.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(a, m - 1 - mesesAtras, 1)).toISOString().slice(0, 10);
}

/** Las pestañas de fechas de fábrica. Fijas: no se ocultan ni se reordenan. */
export const PESTANAS_FECHAS = [
  { id: "7d", nombre: "Últimos 7 días" },
  { id: "30d", nombre: "Últimos 30 días" },
  { id: "mes", nombre: "Este mes" },
  { id: "mes-pasado", nombre: "Mes pasado" },
  { id: "90d", nombre: "Últimos 90 días" },
  { id: "anio", nombre: "Este año" },
] as const;

export type AtajoFechas = (typeof PESTANAS_FECHAS)[number]["id"];
export const FECHAS_POR_DEFECTO: AtajoFechas = "30d";

/** El rango de un atajo, contando hasta hoy (incluido). */
export function rangoDeAtajo(atajo: string, hoy: string): Rango {
  switch (atajo) {
    case "7d":
      return { desde: sumar(hoy, -6), hasta: hoy };
    case "mes":
      return { desde: primeroDelMes(hoy), hasta: hoy };
    case "mes-pasado":
      return { desde: primeroDelMes(hoy, 1), hasta: sumar(primeroDelMes(hoy), -1) };
    case "90d":
      return { desde: sumar(hoy, -89), hasta: hoy };
    case "anio":
      return { desde: `${hoy.slice(0, 4)}-01-01`, hasta: hoy };
    case "30d":
    default:
      return { desde: sumar(hoy, -29), hasta: hoy };
  }
}

/** «14/10/2026 – 12/11/2026». */
export function textoRango(r: Rango): string {
  const f = (x: string) => x.split("-").reverse().join("/");
  return r.desde === r.hasta ? f(r.desde) : `${f(r.desde)} – ${f(r.hasta)}`;
}

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida");

/** Lo que guarda una pestaña propia de fechas: un atajo o fechas fijas. */
export const datosFechasSchema = z.union([
  z.object({ atajo: z.enum(PESTANAS_FECHAS.map((p) => p.id) as [AtajoFechas, ...AtajoFechas[]]) }),
  z
    .object({ desde: fecha, hasta: fecha })
    .refine((r) => r.desde <= r.hasta, "La fecha de inicio tiene que ser antes que la de fin"),
]);
export type DatosFechas = z.infer<typeof datosFechasSchema>;

/** Lo que guarda un grupo de edificios. */
export const datosEdificiosSchema = z.object({ edificioIds: z.array(z.string().min(1).max(40)).min(1).max(100) });
export type DatosEdificios = z.infer<typeof datosEdificiosSchema>;

export type TipoPestana = "fechas" | "edificios";

export type PestanaDto = {
  id: string;
  tipo: TipoPestana;
  nombre: string;
  compartida: boolean;
  datos: DatosFechas | DatosEdificios;
};

export function rangoDePestana(p: { datos: DatosFechas | DatosEdificios }, hoy: string): Rango | null {
  const d = p.datos as Partial<{ atajo: string; desde: string; hasta: string }>;
  if (d.atajo) return rangoDeAtajo(d.atajo, hoy);
  if (d.desde && d.hasta) return { desde: d.desde, hasta: d.hasta };
  return null;
}

/** Los filtros manuales de Resultados (no se guardan). */
export type FiltrosResultados = { origen?: string[]; responsable?: string[]; operacion?: string[] };

/** Los parámetros comunes de `/api/analytics/*`. */
export function parametrosResultados(r: Rango, edificioIds: readonly string[], f: FiltrosResultados): URLSearchParams {
  const p = new URLSearchParams({ desde: r.desde, hasta: r.hasta });
  if (edificioIds.length) p.set("edificioIds", edificioIds.join(","));
  for (const k of ["origen", "responsable", "operacion"] as const) {
    const v = f[k];
    if (v?.length) p.set(k, v.join(","));
  }
  return p;
}
