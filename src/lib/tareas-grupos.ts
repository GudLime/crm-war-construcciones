/**
 * Tareas agrupadas por fecha (rediseño, PR 6): lo puro, para probarlo como
 * tabla. Los días se cuentan en la zona del negocio.
 */

export type GrupoTarea = "sin_fecha" | "vencidas" | "hoy" | "manana" | "semana" | "despues" | "anteriores";

export const GRUPOS_TAREA: { clave: GrupoTarea; titulo: string; plegado?: boolean }[] = [
  { clave: "sin_fecha", titulo: "Sin fecha" },
  { clave: "vencidas", titulo: "Vencidas" },
  { clave: "hoy", titulo: "Hoy" },
  { clave: "manana", titulo: "Mañana" },
  { clave: "semana", titulo: "Esta semana" },
  { clave: "despues", titulo: "Más adelante" },
  { clave: "anteriores", titulo: "Anteriores", plegado: true },
];

export const ZONA_NEGOCIO = "America/Argentina/Buenos_Aires";

/** «2026-11-10» en la zona del negocio. */
export function diaLocal(d: Date, zona = ZONA_NEGOCIO): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: zona }).format(d);
}

function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** Lunes = 0 … domingo = 6. */
function diaDeSemana(dia: string): number {
  return (new Date(`${dia}T12:00:00Z`).getUTCDay() + 6) % 7;
}

type TareaAgrupable = { estado: string; fecha: string | null };

/** En qué grupo va una tarea. Las hechas o sin respuesta van a «Anteriores». */
export function grupoDe(t: TareaAgrupable, ahora: Date, zona = ZONA_NEGOCIO): GrupoTarea {
  if (t.estado !== "realizar") return "anteriores";
  if (!t.fecha) return "sin_fecha";
  const hoy = diaLocal(ahora, zona);
  const dia = diaLocal(new Date(t.fecha), zona);
  const d = diasEntre(hoy, dia);
  if (d < 0) return "vencidas";
  if (d === 0) return "hoy";
  if (d === 1) return "manana";
  // «Esta semana» llega hasta el domingo.
  if (d <= 6 - diaDeSemana(hoy)) return "semana";
  return "despues";
}

/** Agrupa y ordena por hora (Anteriores, de la más nueva a la más vieja). Sin grupos vacíos. */
export function agruparTareas<T extends TareaAgrupable>(
  tareas: readonly T[],
  ahora: Date,
  zona = ZONA_NEGOCIO
): { clave: GrupoTarea; titulo: string; plegado: boolean; tareas: T[] }[] {
  const por = new Map<GrupoTarea, T[]>();
  for (const t of tareas) {
    const g = grupoDe(t, ahora, zona);
    por.set(g, [...(por.get(g) ?? []), t]);
  }
  const hora = (t: T) => (t.fecha ? Date.parse(t.fecha) : 0);
  return GRUPOS_TAREA.filter((g) => por.has(g.clave)).map((g) => {
    const lista = [...por.get(g.clave)!].sort((a, b) => (g.clave === "anteriores" ? hora(b) - hora(a) : hora(a) - hora(b)));
    return { clave: g.clave, titulo: g.titulo, plegado: g.plegado === true, tareas: lista };
  });
}

/**
 * La fecha que propone «+» en cada grupo, como `datetime-local` (10:00 de
 * ese día): Hoy (la próxima hora en punto), Mañana, Esta semana (pasado
 * mañana, si cae en la semana), Más adelante (el lunes que viene). Null =
 * sin fecha o un grupo donde no se crea.
 */
export function fechaPropuesta(g: GrupoTarea, ahora: Date, zona = ZONA_NEGOCIO): string | null {
  const hoy = diaLocal(ahora, zona);
  const mas = (n: number) => {
    const d = new Date(`${hoy}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  switch (g) {
    case "hoy": {
      const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: zona }).format(ahora));
      return `${hoy}T${String(Math.min(23, h + 1)).padStart(2, "0")}:00`;
    }
    case "manana":
      return `${mas(1)}T10:00`;
    case "semana": {
      const quedan = 6 - diaDeSemana(hoy);
      return quedan >= 2 ? `${mas(2)}T10:00` : null;
    }
    case "despues":
      return `${mas(7 - diaDeSemana(hoy))}T10:00`;
    default:
      return null;
  }
}

/** Qué grupos ofrecen «+». */
export function grupoConAlta(g: GrupoTarea, ahora: Date): boolean {
  return g === "sin_fecha" || fechaPropuesta(g, ahora) !== null;
}
