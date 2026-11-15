/**
 * 071 — Reglas puras de las reservas: qué mesas ocupa una reserva, cuánto
 * cupo queda en un horario y qué días y horarios se pueden reservar. Sin BD:
 * el servicio (`server/reservas/`) les pasa los datos y las prueba
 * `tests/unit/reservas.test.ts`.
 *
 * La regla de mesas (decidida con Beba):
 * - Una reserva usa la mesa MÁS CHICA que alcanza, y solo esa: si no quedan
 *   mesas de 2, una reserva de 2 no ocupa una de 4 (se ofrece otro horario).
 * - Si ninguna mesa sola alcanza, junta DOS mesas del mismo sector, la
 *   combinación más chica que alcanza (con mesas de 2 y de 4: una de 4 y una
 *   de 2 para 5 o 6). Tampoco se agranda.
 * - Más de `maxPersonas` lo atiende una persona.
 */
import type { MesaTomada } from "@/lib/db/reservas-tables";

export type CupoSector = { sector: string; capacidad: number; cantidad: number; orden?: number };
export type Ocupacion = { sector: string; mesas: MesaTomada[] };

/** Lo que pide una reserva: capacidades de mesa, del mismo sector. */
export type Forma = number[];

/** Las capacidades de mesa que existen en el cupo, de menor a mayor. */
export function capacidades(cupo: readonly CupoSector[]): number[] {
  return [...new Set(cupo.filter((c) => c.cantidad > 0).map((c) => c.capacidad))].sort((a, b) => a - b);
}

/**
 * Qué mesas necesita una reserva de `personas`, según las mesas que tiene el
 * local (no según las que están libres: la forma no cambia con la ocupación).
 * `null` si ni juntando dos alcanza.
 */
export function formaPara(cupo: readonly CupoSector[], personas: number): Forma | null {
  if (!Number.isInteger(personas) || personas < 1) return null;
  const caps = capacidades(cupo);
  const sola = caps.find((c) => c >= personas);
  if (sola !== undefined) return [sola];
  let mejor: Forma | null = null;
  for (let i = 0; i < caps.length; i++) {
    for (let j = i; j < caps.length; j++) {
      const suma = caps[i]! + caps[j]!;
      if (suma < personas) continue;
      if (!mejor || suma < mejor[0]! + mejor[1]!) mejor = [caps[j]!, caps[i]!];
    }
  }
  return mejor;
}

/** sector → capacidad → mesas libres en un horario. */
export type Libres = Map<string, Map<number, number>>;

export function libres(cupo: readonly CupoSector[], ocupadas: readonly Ocupacion[]): Libres {
  const out: Libres = new Map();
  for (const c of ordenados(cupo)) {
    const s = out.get(c.sector) ?? new Map<number, number>();
    s.set(c.capacidad, (s.get(c.capacidad) ?? 0) + c.cantidad);
    out.set(c.sector, s);
  }
  for (const o of ocupadas) {
    const s = out.get(o.sector);
    if (!s) continue;
    for (const m of o.mesas) s.set(m.capacidad, (s.get(m.capacidad) ?? 0) - 1);
  }
  return out;
}

function ordenados(cupo: readonly CupoSector[]): CupoSector[] {
  return [...cupo].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
}

function entra(libresSector: Map<number, number>, forma: Forma): boolean {
  const pedido = new Map<number, number>();
  for (const c of forma) pedido.set(c, (pedido.get(c) ?? 0) + 1);
  for (const [c, n] of pedido) if ((libresSector.get(c) ?? 0) < n) return false;
  return true;
}

/** Cuántas reservas de la forma más grande (la de dos mesas) caben todavía. */
function grandesQueCaben(l: Libres, grande: Forma | null): number {
  if (!grande || grande.length < 2) return 0;
  let total = 0;
  for (const s of l.values()) {
    const copia = new Map(s);
    while (entra(copia, grande)) {
      for (const c of grande) copia.set(c, (copia.get(c) ?? 0) - 1);
      total++;
    }
  }
  return total;
}

export type Asignacion = { sector: string; mesas: MesaTomada[] };

/**
 * Dónde va una reserva de `personas` en un horario. Entre los sectores donde
 * entra, elige el que deja más lugar para un grupo grande (que necesita dos
 * mesas juntas); a igualdad, el primero del cupo. `null` si no hay lugar.
 */
export function asignar(
  cupo: readonly CupoSector[],
  ocupadas: readonly Ocupacion[],
  personas: number
): Asignacion | null {
  const forma = formaPara(cupo, personas);
  if (!forma) return null;
  const l = libres(cupo, ocupadas);
  const grande = formaPara(cupo, Math.max(...capacidades(cupo)) + 1);
  let mejor: { sector: string; quedan: number } | null = null;
  for (const [sector, s] of l) {
    if (!entra(s, forma)) continue;
    const despues = new Map(l);
    const copia = new Map(s);
    for (const c of forma) copia.set(c, (copia.get(c) ?? 0) - 1);
    despues.set(sector, copia);
    const quedan = grandesQueCaben(despues, grande);
    if (!mejor || quedan > mejor.quedan) mejor = { sector, quedan };
  }
  return mejor ? { sector: mejor.sector, mesas: forma.map((capacidad) => ({ capacidad })) } : null;
}

/** El resumen de un horario para la vista del día: libres y total por capacidad. */
export function resumenCupo(
  cupo: readonly CupoSector[],
  ocupadas: readonly Ocupacion[]
): { capacidad: number; libres: number; total: number }[] {
  const l = libres(cupo, ocupadas);
  return capacidades(cupo).map((capacidad) => {
    let libresN = 0;
    for (const s of l.values()) libresN += Math.max(0, s.get(capacidad) ?? 0);
    const total = cupo.filter((c) => c.capacidad === capacidad).reduce((a, c) => a + c.cantidad, 0);
    return { capacidad, libres: libresN, total };
  });
}

// ─── Fechas y horarios ───────────────────────────────────────────────────

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export function esFecha(s: string): boolean {
  return RE_FECHA.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}
export function esHora(s: string): boolean {
  return RE_HORA.test(s);
}

/** 0 = domingo … 6 = sábado. */
export function diaSemana(fecha: string): number {
  return new Date(`${fecha}T00:00:00Z`).getUTCDay();
}

export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** La fecha y la hora de pared de `ahora` en la zona del negocio. */
export function enZona(ahora: Date, zona: string): { fecha: string; minutos: number } {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: zona,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(ahora);
  const p = (t: string) => partes.find((x) => x.type === t)?.value ?? "00";
  return { fecha: `${p("year")}-${p("month")}-${p("day")}`, minutos: Number(p("hour")) * 60 + Number(p("minute")) };
}

export function aMinutos(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export type HorarioSemana = { diaSemana: number; hora: string; activo: boolean };

/**
 * Los horarios de una fecha en los que todavía se puede reservar: los
 * activos de ese día de la semana, salvo días cerrados, fuera de la
 * anticipación, o (hoy) los que empiezan en menos de `minutosAntes`.
 */
export function horariosReservables(input: {
  fecha: string;
  horarios: readonly HorarioSemana[];
  cierres: readonly string[];
  ahora: Date;
  zona: string;
  anticipacionDias: number;
  minutosAntes: number;
}): string[] {
  const hoy = enZona(input.ahora, input.zona);
  if (input.fecha < hoy.fecha) return [];
  if (input.fecha > sumarDias(hoy.fecha, input.anticipacionDias)) return [];
  if (input.cierres.includes(input.fecha)) return [];
  const dia = diaSemana(input.fecha);
  return input.horarios
    .filter((h) => h.activo && h.diaSemana === dia)
    .map((h) => h.hora)
    .filter((h) => input.fecha > hoy.fecha || aMinutos(h) - hoy.minutos >= input.minutosAntes)
    .sort();
}

/** Las fechas candidatas: de hoy a hoy + anticipación, en la zona del negocio. */
export function fechasDeLaAnticipacion(ahora: Date, zona: string, anticipacionDias: number): string[] {
  const hoy = enZona(ahora, zona).fecha;
  return Array.from({ length: anticipacionDias + 1 }, (_, i) => sumarDias(hoy, i));
}

/** «sáb 15 nov», en castellano, sin depender de la zona del servidor. */
export function fechaCorta(fecha: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  })
    .format(new Date(`${fecha}T12:00:00Z`))
    .replace(/\./g, "");
}
