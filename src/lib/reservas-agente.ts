/**
 * 071 — Los datos del restaurante (Ajustes → Reservas) en texto, para sumar
 * al conocimiento que el CRM le pasa al agente (`conocimientoDelAgente`).
 *
 * Cada línea se entiende sola: al cerebro el conocimiento le llega como un
 * único texto y puede perder los encabezados. Un campo vacío no escribe su
 * línea: nunca «sin dato».
 *
 * Puro: se prueba sin base.
 */

import { sumarDias } from "@/lib/reservas";

export type DatosReservasParaAgente = {
  nombre: string;
  ajustes: {
    direccion: string | null;
    enlaceCarta: string | null;
    maxPersonas: number;
    anticipacionDias: number;
    minutosAntes: number;
    toleranciaMinutos?: number | null;
  };
  horarios: readonly { diaSemana: number; hora: string; activo: boolean }[];
  cierres: readonly { fecha: string; motivo: string | null }[];
  /** Hoy en la zona del negocio (AAAA-MM-DD). */
  hoy: string;
};

/** Lunes primero, como se lee una semana acá. */
const SEMANA = [1, 2, 3, 4, 5, 6, 0] as const;
const DIA: Record<number, string> = {
  0: "domingo",
  1: "lunes",
  2: "martes",
  3: "miércoles",
  4: "jueves",
  5: "viernes",
  6: "sábado",
};
const MES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** «a, b y c». */
export function enumerar(partes: readonly string[]): string {
  if (partes.length <= 1) return partes[0] ?? "";
  return `${partes.slice(0, -1).join(", ")} y ${partes.at(-1)}`;
}

/** Días de la semana (0 = domingo) como tramos: «martes a jueves y sábado». */
export function tramosDeDias(dias: readonly number[]): string {
  const orden = SEMANA.filter((d) => dias.includes(d));
  const tramos: number[][] = [];
  for (const d of orden) {
    const ultimo = tramos.at(-1);
    const previo = ultimo?.at(-1);
    if (ultimo && previo !== undefined && SEMANA.indexOf(d as never) === SEMANA.indexOf(previo as never) + 1) {
      ultimo.push(d);
    } else tramos.push([d]);
  }
  // Tres días seguidos o más son un tramo («martes a jueves»); menos, días
  // sueltos, así la «y» queda una sola vez: «lunes a jueves, sábado y domingo».
  return enumerar(tramos.flatMap((t) => (t.length >= 3 ? [`${DIA[t[0]!]} a ${DIA[t.at(-1)!]}`] : t.map((d) => DIA[d]!))));
}

/**
 * Los horarios de reserva agrupados por días iguales:
 * «martes a jueves a las 12:00 y 14:00; viernes y sábado a las 12:00, 14:00 y
 * 20:00. Lunes y domingo cerrado.» `null` si no hay ninguno cargado.
 */
export function resumenDeHorarios(horarios: DatosReservasParaAgente["horarios"]): string | null {
  const porDia = new Map<number, string[]>();
  for (const h of horarios) {
    if (!h.activo) continue;
    porDia.set(h.diaSemana, [...(porDia.get(h.diaSemana) ?? []), h.hora]);
  }
  if (porDia.size === 0) return null;
  const grupos = new Map<string, number[]>();
  for (const d of SEMANA) {
    const horas = [...new Set(porDia.get(d) ?? [])].sort();
    if (!horas.length) continue;
    const clave = horas.join(",");
    grupos.set(clave, [...(grupos.get(clave) ?? []), d]);
  }
  const lasHoras = (clave: string) => {
    const horas = clave.split(",");
    return `${horas.length === 1 ? "a la" : "a las"} ${enumerar(horas)}`;
  };
  const cerrados = SEMANA.filter((d) => !porDia.has(d));
  if (grupos.size === 1 && cerrados.length === 0) {
    return `todos los días ${lasHoras([...grupos.keys()][0]!)}.`;
  }
  const partes = [...grupos.entries()].map(([clave, dias]) => `${tramosDeDias(dias)} ${lasHoras(clave)}`);
  let texto = `${partes.join("; ")}.`;
  if (cerrados.length) {
    const cerrado = tramosDeDias(cerrados);
    texto += ` ${cerrado[0]!.toUpperCase()}${cerrado.slice(1)} cerrado.`;
  }
  return texto;
}

/** «jueves 24 de diciembre de 2026». */
export function fechaLarga(fecha: string): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  return `${DIA[d.getUTCDay()]} ${d.getUTCDate()} de ${MES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}

export function textoDeReservasParaAgente(datos: DatosReservasParaAgente): string {
  const { ajustes } = datos;
  const lineas = [`### Restaurante ${datos.nombre}`.trim()];
  if (ajustes.direccion?.trim()) lineas.push(`Dirección del restaurante: ${ajustes.direccion.trim()}`);
  const horarios = resumenDeHorarios(datos.horarios);
  if (horarios) lineas.push(`Reservas del restaurante: ${horarios}`);

  // Solo los días cerrados que caen dentro de lo que se puede reservar.
  const hasta = sumarDias(datos.hoy, ajustes.anticipacionDias);
  const cierres = [...datos.cierres]
    .filter((c) => c.fecha >= datos.hoy && c.fecha <= hasta)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  if (cierres.length) {
    lineas.push(
      `Días cerrados del restaurante (próximos): ${enumerar(
        cierres.map((c) => (c.motivo?.trim() ? `${fechaLarga(c.fecha)} (${c.motivo.trim()})` : fechaLarga(c.fecha)))
      )}`
    );
  }

  const tope = ajustes.maxPersonas;
  lineas.push(
    `Tope por reserva: hasta ${tope} ${tope === 1 ? "persona" : "personas"}. Más personas las atiende alguien del equipo.`
  );

  const minutos = ajustes.minutosAntes;
  const antes = minutos > 0 ? `hasta ${minutos} minutos antes del horario` : "hasta el horario mismo";
  lineas.push(
    ajustes.anticipacionDias > 0
      ? `Anticipación: se reserva con hasta ${ajustes.anticipacionDias} ${ajustes.anticipacionDias === 1 ? "día" : "días"} y ${antes}.`
      : `Anticipación: se reserva solo para el mismo día, ${antes}.`
  );
  if (ajustes.toleranciaMinutos) {
    lineas.push(`Tolerancia de llegada: se guarda la mesa ${ajustes.toleranciaMinutos} minutos después del horario de la reserva.`);
  }
  if (ajustes.enlaceCarta?.trim()) lineas.push(`Carta del restaurante: ${ajustes.enlaceCarta.trim()}`);
  return lineas.join("\n");
}
