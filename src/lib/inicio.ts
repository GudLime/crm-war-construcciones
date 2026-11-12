/**
 * Inicio del vendedor — lo puro: el formato de los contadores, el saludo, la
 * fecha larga y los links que abren Oportunidades y Tareas con filtros
 * temporales (llegan como «Cambios sin guardar»).
 */

export type InicioContadores = {
  /** Hoy en la zona del negocio (AAAA-MM-DD). */
  hoy: string;
  zona: string;
  /** Asignadas a la persona y todavía sin primer contacto. */
  nuevas: number;
  /** Tareas para hacer con fecha hasta hoy (incluye vencidas). */
  tareasHoy: number;
  tareasVencidas: number;
  /** Citas y tareas de visita/reunión de hoy. */
  visitasHoy: number;
  proximaVisita: { at: string; contacto: string | null } | null;
  /** Derivadas por la IA sin tomar, de todo el equipo. */
  derivadas: number;
  derivadaMasViejaAt: string | null;
  /** Abiertas en estado Visitó. */
  calientes: number;
};

export type InicioDto = {
  usuario: { id: string; nombre: string };
  /** Nombre del agente de IA configurado (Agente → nombre). */
  agente: string;
  /** Solo un admin puede mirar el Inicio de otra persona. */
  admin: boolean;
  contadores: InicioContadores;
};

/** Pasado este tiempo, una derivación que espera se marca en rojo. */
export const DERIVADA_URGENTE_MIN = 30;

/** «Buen día» antes de las 12, «Buenas tardes» hasta las 20, después «Buenas noches». */
export function saludo(hora: number): string {
  if (hora < 12) return "Buen día";
  if (hora < 20) return "Buenas tardes";
  return "Buenas noches";
}

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MESES = [
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

/** "2026-11-12" → «Jueves 12 de noviembre». */
export function fechaLarga(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number) as [number, number, number];
  const dia = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  return `${DIAS[dia]} ${d} de ${MESES[m - 1]}`;
}

/** «5 min», «2 h», «3 días». */
export function hace(desdeISO: string, ahora = new Date()): string {
  const min = Math.max(0, Math.round((ahora.getTime() - Date.parse(desdeISO)) / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "1 día" : `${d} días`;
}

/** Los links de las tarjetas: filtros temporales por query string. */
export const LINKS_INICIO = {
  nuevas: "/oportunidades?responsable=me&sinPrimerContacto=1",
  tareas: "/tareas?responsable=me&estado=realizar&hasta=hoy",
  visitas: "/tareas?responsable=me&estado=todas&tipo=visita,reunion&desde=hoy&hasta=hoy",
  calientes: "/oportunidades?responsable=me&estado=visito",
} as const;
