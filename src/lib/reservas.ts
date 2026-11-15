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

// ─── El salón dibujado (vista Mosaico) ─────────────────────────────────

/**
 * Lo que se dibuja en un sector: una reserva sentada en sus mesas (una o dos
 * juntas) o una mesa libre. Las mesas no tienen nombre: la reserva no toma
 * una mesa concreta sino cupo, así que se sientan en orden de llegada.
 */
export type LugarEnSalon<R> =
  | { tipo: "reserva"; reserva: R; mesas: number[]; sobrecupo: boolean }
  | { tipo: "libre"; capacidad: number };

export type SectorDibujado<R> = { sector: string; lugares: LugarEnSalon<R>[]; libres: number; total: number };

/**
 * Sienta las reservas de un horario en las mesas de cada sector. Primero las
 * mesas grandes, en el orden de los sectores; las reservas que ocupan mesa,
 * en el orden en que llegaron. Si una reserva no tiene mesa (se achicó el
 * cupo después de tomarla) se dibuja igual, marcada como sobrecupo.
 */
export function sentar<R extends Ocupacion>(
  cupo: readonly CupoSector[],
  ocupan: readonly R[],
  sectores: readonly string[]
): SectorDibujado<R>[] {
  const orden = [...new Set([...sectores, ...cupo.map((c) => c.sector), ...ocupan.map((r) => r.sector)])];
  return orden
    .map((sector) => {
      const mesas = cupo
        .filter((c) => c.sector === sector)
        .sort((a, b) => b.capacidad - a.capacidad)
        .flatMap((c) => Array.from({ length: Math.max(0, c.cantidad) }, () => c.capacidad));
      const tomada = mesas.map(() => false);
      const lugares: { pos: number; lugar: LugarEnSalon<R> }[] = [];
      for (const r of ocupan.filter((x) => x.sector === sector)) {
        let pos = Number.POSITIVE_INFINITY;
        let sobrecupo = false;
        for (const m of r.mesas) {
          const i = mesas.findIndex((cap, j) => cap === m.capacidad && !tomada[j]);
          if (i < 0) sobrecupo = true;
          else {
            tomada[i] = true;
            pos = Math.min(pos, i);
          }
        }
        lugares.push({
          pos: sobrecupo && pos === Number.POSITIVE_INFINITY ? mesas.length + lugares.length : pos,
          lugar: { tipo: "reserva", reserva: r, mesas: r.mesas.map((m) => m.capacidad), sobrecupo },
        });
      }
      mesas.forEach((capacidad, i) => {
        if (!tomada[i]) lugares.push({ pos: i, lugar: { tipo: "libre", capacidad } });
      });
      lugares.sort((a, b) => a.pos - b.pos);
      return {
        sector,
        lugares: lugares.map((l) => l.lugar),
        libres: tomada.filter((t) => !t).length,
        total: mesas.length,
      };
    })
    .filter((s) => s.total > 0 || s.lugares.length > 0);
}

// ─── Las personas (contactos de un restaurante) ─────────────────────────

export const SEGMENTOS = [
  { value: "nuevo", label: "Nuevo" },
  { value: "cliente", label: "Cliente" },
  { value: "habitual", label: "Habitual" },
] as const;
export type Segmento = (typeof SEGMENTOS)[number]["value"];

/** Nuevo: todavía no vino. Cliente: vino. Habitual: vino `umbral` veces o más. */
export function segmentoDe(visitas: number, umbral: number): Segmento {
  if (visitas <= 0) return "nuevo";
  return visitas >= umbral ? "habitual" : "cliente";
}

/** Lo que se cuenta de una persona a partir de sus reservas. */
export type Comensal = {
  /** Reservas a las que asistió. */
  visitas: number;
  reservas: number;
  noVino: number;
  canceladas: number;
  primeraVisita: string | null;
  ultimaVisita: string | null;
  /** La próxima reserva confirmada (hoy o después). */
  proxima: { fecha: string; hora: string } | null;
  segmento: Segmento;
  aceptaPromociones: boolean;
};

export const COMENSAL_VACIO: Omit<Comensal, "segmento"> = {
  visitas: 0,
  reservas: 0,
  noVino: 0,
  canceladas: 0,
  primeraVisita: null,
  ultimaVisita: null,
  proxima: null,
  aceptaPromociones: false,
};

/** Las vistas armadas de Contactos en un restaurante. */
export const VISTAS_COMENSALES = [
  { value: "todos", label: "Todos" },
  { value: "nuevo", label: "Nuevos" },
  { value: "cliente", label: "Clientes" },
  { value: "habitual", label: "Habituales" },
  { value: "recuperar", label: "No vienen hace más de 60 días" },
  { value: "faltaron", label: "Faltaron alguna vez" },
  { value: "este_mes", label: "Vinieron este mes" },
  { value: "promociones", label: "Aceptan promociones" },
] as const;
export type VistaComensales = (typeof VISTAS_COMENSALES)[number]["value"];

/** Días sin venir para estar en «No vienen hace más de 60 días». */
export const DIAS_PARA_RECUPERAR = 60;

/** ¿Esta persona entra en la vista? `hoy` en la zona del negocio. */
export function enVista(c: Comensal, vista: VistaComensales, hoy: string): boolean {
  switch (vista) {
    case "todos":
      return true;
    case "nuevo":
    case "cliente":
    case "habitual":
      return c.segmento === vista;
    case "recuperar":
      // Vino alguna vez, hace más de 60 días, y no tiene una reserva por delante.
      return !!c.ultimaVisita && c.ultimaVisita < sumarDias(hoy, -DIAS_PARA_RECUPERAR) && !c.proxima;
    case "faltaron":
      return c.noVino > 0;
    case "este_mes":
      return !!c.ultimaVisita && c.ultimaVisita.slice(0, 7) === hoy.slice(0, 7);
    case "promociones":
      return c.aceptaPromociones;
  }
}
