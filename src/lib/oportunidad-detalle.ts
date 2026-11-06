import { ESTADOS_OPORTUNIDAD, etiqueta, type EstadoOportunidad } from "@/lib/ventas";

/**
 * War — La página de una oportunidad: los tipos que viajan al navegador y lo
 * puro de armar el timeline (sin base, para probarlo como tabla).
 */

export type MensajeCorto = {
  id: string;
  direction: "in" | "out";
  texto: string | null;
  tipo: string;
  origen: "ai" | "operator" | "manual" | "template";
  status: string;
  createdAt: string;
};

export type ReunionCorta = {
  id: string;
  scheduledAt: string;
  durationMinutes: number;
  status: "agendada" | "realizada" | "no_show" | "cancelada";
  source: "manual" | "ai";
  meetingLink: string | null;
  createdAt: string;
};

export type TareaCorta = {
  id: string;
  titulo: string;
  tipo: string;
  estado: string;
  fecha: string | null;
  comentarios: string | null;
  contactId: string | null;
  oportunidadId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EventoCorto = {
  id: string;
  tipo:
    | "creada"
    | "estado"
    | "cerrada"
    | "reabierta"
    | "formulario"
    | "primer_contacto"
    | "primera_respuesta";
  estadoDesde: string | null;
  estadoHasta: string | null;
  motivo: string | null;
  fuente: "persona" | "ia" | "make" | "sistema" | "migracion";
  actorNombre: string | null;
  datos: Record<string, unknown> | null;
  occurredAt: string;
};

export type NotaCorta = {
  id: string;
  texto: string;
  autorNombre: string | null;
  createdAt: string;
};

export type IconoTimeline =
  | "creada"
  | "estado"
  | "cerrada"
  | "reabierta"
  | "formulario"
  | "whatsapp"
  | "reunion"
  | "tarea"
  | "nota"
  | "contacto"
  | "anterior";

export type ItemTimeline = {
  id: string;
  icono: IconoTimeline;
  at: string;
  titulo: string;
  detalle: string | null;
  /** Quién: «Mateo», el nombre de la persona, «Make», «Sistema». */
  quien: string | null;
  /** Para los cierres y los avisos: el tono del ícono. */
  tono?: "ok" | "malo" | "neutro";
};

/** Mensajes más separados que esto arman otra ráfaga. */
export const HUECO_RAFAGA_MS = 30 * 60 * 1000;

export type Rafaga = {
  desde: string;
  hasta: string;
  enviados: number;
  recibidos: number;
  ultimo: MensajeCorto;
};

/** Agrupa los mensajes (ordenados por hora) en ráfagas de conversación. */
export function agruparRafagas(
  mensajes: readonly MensajeCorto[],
  hueco: number = HUECO_RAFAGA_MS
): Rafaga[] {
  const out: Rafaga[] = [];
  let actual: Rafaga | null = null;
  for (const m of [...mensajes].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const t = new Date(m.createdAt).getTime();
    if (actual && t - new Date(actual.hasta).getTime() <= hueco) {
      actual.hasta = m.createdAt;
      actual.ultimo = m;
      if (m.direction === "out") actual.enviados++;
      else actual.recibidos++;
    } else {
      actual = {
        desde: m.createdAt,
        hasta: m.createdAt,
        enviados: m.direction === "out" ? 1 : 0,
        recibidos: m.direction === "in" ? 1 : 0,
        ultimo: m,
      };
      out.push(actual);
    }
  }
  return out;
}

function vistaPrevia(m: MensajeCorto): string {
  const t = m.texto?.replace(/\s+/g, " ").trim();
  const cuerpo = t ? (t.length > 140 ? `${t.slice(0, 139)}…` : t) : `[${m.tipo}]`;
  const quien = m.direction === "in" ? "Cliente" : m.origen === "ai" ? "Mateo" : "Equipo";
  return `${quien}: ${cuerpo}`;
}

function estadoLegible(v: string | null): string {
  return v ? etiqueta(ESTADOS_OPORTUNIDAD, v as EstadoOportunidad) : "—";
}

function quienDelEvento(e: EventoCorto): string | null {
  switch (e.fuente) {
    case "ia":
      return "Mateo";
    case "make":
      return "Make";
    case "persona":
      return e.actorNombre ?? "Alguien del equipo";
    case "sistema":
      return "Automático";
    default:
      return null;
  }
}

function deEvento(e: EventoCorto): ItemTimeline | null {
  const base = { id: `ev-${e.id}`, at: e.occurredAt, quien: quienDelEvento(e) };
  switch (e.tipo) {
    case "creada":
      return {
        ...base,
        icono: "creada",
        titulo: e.fuente === "migracion" ? "Oportunidad registrada" : "Se abrió la oportunidad",
        detalle: e.estadoHasta ? `Estado: ${estadoLegible(e.estadoHasta)}` : null,
      };
    case "estado":
      return {
        ...base,
        icono: "estado",
        titulo: `${estadoLegible(e.estadoDesde)} → ${estadoLegible(e.estadoHasta)}`,
        detalle: null,
      };
    case "cerrada":
      return {
        ...base,
        icono: "cerrada",
        tono: e.estadoHasta === "compro" ? "ok" : "malo",
        titulo: `Se cerró: ${estadoLegible(e.estadoHasta)}`,
        detalle: e.motivo ? `Motivo: ${e.motivo}` : null,
      };
    case "reabierta":
      return {
        ...base,
        icono: "reabierta",
        tono: "ok",
        titulo: `Se reabrió en ${estadoLegible(e.estadoHasta)}`,
        detalle: e.fuente === "sistema" ? "Volvió a escribir" : null,
      };
    case "formulario": {
      const d = e.datos ?? {};
      const partes = [d.formName, d.campaignName].filter((x): x is string => typeof x === "string" && !!x);
      return {
        ...base,
        icono: "formulario",
        titulo: `Completó un formulario${typeof d.origen === "string" ? ` · ${d.origen}` : ""}`,
        detalle: partes.length ? partes.join(" · ") : null,
      };
    }
    case "primer_contacto":
      return { ...base, icono: "contacto", titulo: "Primer contacto", detalle: null };
    case "primera_respuesta":
      return { ...base, icono: "contacto", tono: "ok", quien: null, titulo: "Primera respuesta del cliente", detalle: null };
    default:
      return null;
  }
}

const ESTADO_REUNION: Record<ReunionCorta["status"], string> = {
  agendada: "agendada",
  realizada: "realizada",
  no_show: "no vino",
  cancelada: "cancelada",
};

function fechaCorta(iso: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date(iso));
}

/**
 * El timeline: todo junto, lo más nuevo arriba. WhatsApp va por ráfagas (no
 * mensaje por mensaje) y solo lo que pasó desde que se abrió la oportunidad.
 */
export function armarTimeline(input: {
  eventos: readonly EventoCorto[];
  mensajes: readonly MensajeCorto[];
  reuniones: readonly ReunionCorta[];
  tareas: readonly TareaCorta[];
  notas: readonly NotaCorta[];
  ahora?: Date;
}): ItemTimeline[] {
  const ahora = input.ahora ?? new Date();
  const items: ItemTimeline[] = [];

  for (const e of input.eventos) {
    const it = deEvento(e);
    if (it) items.push(it);
  }

  for (const r of agruparRafagas(input.mensajes)) {
    const partes: string[] = [];
    if (r.recibidos) partes.push(`${r.recibidos} recibido${r.recibidos === 1 ? "" : "s"}`);
    if (r.enviados) partes.push(`${r.enviados} enviado${r.enviados === 1 ? "" : "s"}`);
    items.push({
      id: `wa-${r.desde}`,
      icono: "whatsapp",
      at: r.hasta,
      titulo: `Conversación por WhatsApp · ${partes.join(", ")}`,
      detalle: vistaPrevia(r.ultimo),
      quien: null,
    });
  }

  for (const r of input.reuniones) {
    items.push({
      id: `re-a-${r.id}`,
      icono: "reunion",
      at: r.createdAt,
      titulo: `Agendó una reunión para el ${fechaCorta(r.scheduledAt)}`,
      detalle: null,
      quien: r.source === "ai" ? "Mateo" : null,
    });
    if (new Date(r.scheduledAt) <= ahora && r.status !== "agendada") {
      items.push({
        id: `re-r-${r.id}`,
        icono: "reunion",
        at: r.scheduledAt,
        tono: r.status === "realizada" ? "ok" : "malo",
        titulo: `Reunión ${ESTADO_REUNION[r.status]}`,
        detalle: null,
        quien: null,
      });
    }
  }

  for (const t of input.tareas) {
    items.push({
      id: `ta-c-${t.id}`,
      icono: "tarea",
      at: t.createdAt,
      titulo: `Tarea: ${t.titulo}`,
      detalle: t.fecha ? `Para el ${fechaCorta(t.fecha)}` : null,
      quien: null,
    });
    if (t.estado === "listo" || t.estado === "no_responde") {
      items.push({
        id: `ta-h-${t.id}`,
        icono: "tarea",
        at: t.updatedAt,
        tono: t.estado === "listo" ? "ok" : "malo",
        titulo: t.estado === "listo" ? `Hecha: ${t.titulo}` : `No respondió: ${t.titulo}`,
        detalle: t.comentarios,
        quien: null,
      });
    }
  }

  for (const n of input.notas) {
    items.push({
      id: `no-${n.id}`,
      icono: "nota",
      at: n.createdAt,
      titulo: "Nota",
      detalle: n.texto,
      quien: n.autorNombre ?? "Alguien del equipo",
    });
  }

  return items.sort((a, b) => b.at.localeCompare(a.at));
}

/** Los últimos mensajes de la pestaña: los últimos N, en orden de lectura. */
export function ultimosMensajes(mensajes: readonly MensajeCorto[], n = 4): MensajeCorto[] {
  return [...mensajes].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(-n);
}
