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
  /** 0054 — Citas de hoy que todavía no confirmó una persona. */
  visitasSinConfirmar: number;
  proximaVisita: { at: string; contacto: string | null } | null;
  /** Derivadas por la IA sin tomar, de todo el equipo. */
  derivadas: number;
  derivadaMasViejaAt: string | null;
  /** Abiertas en estado Visitó. */
  calientes: number;
};

/** El chip del motivo: rojo si pidió una persona, ámbar para dudas, marca para intención de compra. */
export type TonoMotivo = "rojo" | "ambar" | "marca";

export type DerivadaDto = {
  conversationId: string;
  canal: string;
  contacto: { id: string; nombre: string };
  /** El edificio de su oportunidad abierta, si tiene. */
  edificio: { nombre: string; color: string | null } | null;
  motivo: { texto: string; tono: TonoMotivo };
  /** Lo último que escribió el cliente. */
  ultimoMensaje: string | null;
  /** Desde cuándo espera (el handoff). */
  esperaDesde: string;
};

/** Una fila de «Tu día»: una tarea (se tilda) o una cita (no). */
export type ItemDelDia = {
  clase: "tarea" | "cita";
  id: string;
  at: string;
  vencida: boolean;
  titulo: string;
  tipo: string;
  contacto: string | null;
  edificio: string | null;
};

/** Una oportunidad en las listas de Inicio (Nuevas para vos, Leads calientes). */
export type OportunidadDeInicio = {
  id: string;
  nombre: string;
  /** venta, alquiler o inmobiliaria. */
  tipo: string | null;
  origen: string | null;
  edificio: { nombre: string; color: string | null } | null;
  ambientes: number[];
  unidad: string | null;
  /** Desde cuándo la lleva (o desde que se creó). */
  asignadaDesde: string;
  /** En Leads calientes: desde cuándo está en Visitó. */
  visitoDesde: string;
  /** En Leads calientes: la tarea o cita futura más cercana, o null. */
  proximoPaso: { tipo: string; titulo: string; at: string } | null;
};

/** Inicio · Visitas de hoy: una cita (visita o reunión) de quien mira. */
export type VisitaDeHoy = {
  id: string;
  at: string;
  contacto: string | null;
  conversationId: string | null;
  edificio: { nombre: string; color: string | null } | null;
  unidad: string | null;
  /** manual o ai (la agendó el agente). */
  source: "manual" | "ai";
  estado: "agendada" | "realizada" | "no_show" | "cancelada";
  confirmada: boolean;
};

/** Inicio · Ventana de 24 h por cerrar: se puede escribir sin plantilla hasta `cierraAt`. */
export type VentanaPorCerrar = {
  conversationId: string;
  contacto: string;
  cierraAt: string;
};

/** Inicio · Tu semana: los números de esta semana (desde el lunes) y los de la anterior al mismo punto. */
export type MetricasSemana = {
  /** Asignadas en el período. */
  nuevas: number;
  /** De esas, cuántas ya tuvieron primer contacto. */
  contactadas: number;
  /** Mediana de segundos desde que entró hasta el primer contacto (de los primeros contactos del período). */
  primerContactoSeg: number | null;
  visitas: number;
  reservas: number;
  perdidas: number;
};

export type SemanaDto = { desde: string; actual: MetricasSemana; anterior: MetricasSemana };

export type InicioDto = {
  usuario: { id: string; nombre: string };
  /** Nombre del agente de IA configurado (Agente → nombre). */
  agente: string;
  /** Solo un admin puede mirar el Inicio de otra persona. */
  admin: boolean;
  contadores: InicioContadores;
  /** Del equipo, sin tomar (máx. 5). */
  derivadas: DerivadaDto[];
  tuDia: ItemDelDia[];
  nuevas: OportunidadDeInicio[];
  calientes: OportunidadDeInicio[];
  visitas: VisitaDeHoy[];
  ventanas: VentanaPorCerrar[];
  semana: SemanaDto;
  /** Quién mira (el id de la sesión), aunque esté viendo el Inicio de otra persona. */
  sesion: string;
  /** «Ver como» (solo admin): el equipo, para elegir de quién es el Inicio. */
  equipo: { userId: string; nombre: string }[];
};

/** % entero, o null sin base. */
export function porcentaje(parte: number, total: number): number | null {
  return total > 0 ? Math.round((parte / total) * 100) : null;
}

/** «12 min», «3 h», «2 días» para una duración en segundos. */
export function duracion(seg: number | null): string {
  if (seg == null) return "—";
  const min = Math.round(seg / 60);
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "1 día" : `${d} días`;
}

/**
 * Cómo cambió un número respecto de la semana anterior. `mejorSiSube` dice si
 * subir es bueno (visitas) o malo (perdidas, tiempo al primer contacto).
 */
export function tendencia(
  actual: number | null,
  anterior: number | null,
  mejorSiSube: boolean
): { sentido: "sube" | "baja" | "igual"; bueno: boolean | null } {
  if (actual == null || anterior == null || actual === anterior) return { sentido: "igual", bueno: null };
  const sube = actual > anterior;
  return { sentido: sube ? "sube" : "baja", bueno: sube === mejorSiSube };
}

/**
 * Los links de las tarjetas para otra persona («Ver como»): el responsable va
 * con su id en vez de «me».
 */
export function linksPara(userId: string | null): typeof LINKS_INICIO {
  if (!userId) return LINKS_INICIO;
  const cambiar = (href: string) => href.replace("responsable=me", `responsable=${encodeURIComponent(userId)}`);
  return Object.fromEntries(Object.entries(LINKS_INICIO).map(([k, v]) => [k, cambiar(v)])) as typeof LINKS_INICIO;
}

/** Faltando menos que esto, la ventana se marca en rojo. */
export const VENTANA_URGENTE_MIN = 120;

/** «quedan 3 h 20 min». */
export function quedan(hastaISO: string, ahora = new Date()): string {
  const min = Math.max(0, Math.floor((Date.parse(hastaISO) - ahora.getTime()) / 60_000));
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `quedan ${h} h ${m} min` : `quedan ${m} min`;
}

const MOTIVOS: Record<string, { texto: string; tono: TonoMotivo }> = {
  cliente: { texto: "Quiere hablar con una persona", tono: "rojo" },
  hostilidad: { texto: "Se puso agresivo", tono: "rojo" },
  modelo: { texto: "Pregunta fuera de lo que sabe el agente", tono: "ambar" },
  error: { texto: "El agente tuvo un problema", tono: "ambar" },
  ventana: { texto: "Se cerró la ventana de 24 h", tono: "ambar" },
};

/**
 * El motivo para el vendedor: el resumen del agente si lo dejó; si no, el
 * código traducido. Hablar de reservar, señar o comprar va en tinte de marca.
 */
export function motivoDeDerivacion(codigo: string | null, resumen: string | null): { texto: string; tono: TonoMotivo } {
  const base = MOTIVOS[codigo ?? ""] ?? { texto: "Necesita una persona", tono: "ambar" as const };
  const texto = resumen?.trim() || base.texto;
  const compra = /reserv|señ|sen[ae]r|compr|cerrar (la )?operaci/i.test(texto);
  return { texto, tono: compra ? "marca" : base.tono };
}

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
  visitas: "/bookings",
  calientes: "/oportunidades?responsable=me&estado=visito",
  derivadas: "/inbox?derivadas=1",
} as const;
