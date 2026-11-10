import { and, asc, desc, eq, gt, inArray, isNull, lt, lte, ne, or } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import type { NotaDto } from "@/lib/notas";
import {
  armarProximos,
  armarTimeline,
  ultimosMensajes,
  type ProximoPaso,
  type EventoCorto,
  type ItemTimeline,
  type MensajeCorto,
  type ReunionCorta,
  type TareaCorta,
} from "@/lib/oportunidad-detalle";
import { ESTADOS_ABIERTOS, type EstadoOportunidad, type TipoContacto } from "@/lib/ventas";
import { isWindowOpen, WINDOW_MS } from "@/server/inbox/window";
import { listarNotasDeOportunidad } from "@/server/notas";
import { oportunidadConNombres, type OportunidadDto } from "@/server/ventas";

/**
 * War — Todo lo que muestra la página de una oportunidad, en una sola ida.
 *
 * «No mezclar» compras: lo que pasó con el contacto (mensajes, reuniones,
 * tareas sueltas) se toma desde que se cerró su oportunidad ANTERIOR (o desde
 * siempre, si es la primera) y, si esta está cerrada, hasta su cierre.
 */

export type ContactoDeOportunidad = {
  id: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
  tipoContacto: TipoContacto | null;
  fuente: string | null;
  creadoAt: string;
  anuncio: { titulo: string | null; url: string | null } | null;
};

export type OportunidadVecina = {
  id: string;
  nombre: string;
  estado: EstadoOportunidad;
  edificioNombre: string | null;
  edificioColor: string | null;
  cerradaAt: string | null;
  motivoCierre: string | null;
};

export type FormularioRecibido = {
  leadId: string;
  origen: string;
  formName: string | null;
  campaignName: string | null;
  adName: string | null;
  recibidoAt: string;
};

export type OportunidadDetalleDto = {
  oportunidad: OportunidadDto & { estadoDesde: string; cerradaAt: string | null };
  contacto: ContactoDeOportunidad | null;
  conversacion: { id: string; ventanaAbierta: boolean; ventanaCierraAt: string | null } | null;
  mensajes: MensajeCorto[];
  reuniones: ReunionCorta[];
  tareasPendientes: TareaCorta[];
  /** Tareas por hacer y reuniones futuras, para arriba del timeline. */
  proximos: ProximoPaso[];
  formularios: FormularioRecibido[];
  notas: NotaDto[];
  timeline: ItemTimeline[];
  anterior: OportunidadVecina | null;
  paralelas: OportunidadVecina[];
};

const ABIERTOS = ESTADOS_ABIERTOS as EstadoOportunidad[];

type Quien = { organizationId: string; userId: string; configura: boolean };

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

function aTareaCorta(t: typeof schema.tareaVenta.$inferSelect): TareaCorta {
  return {
    id: t.id,
    titulo: t.titulo,
    tipo: t.tipo,
    estado: t.estado,
    fecha: iso(t.fecha),
    comentarios: t.comentarios,
    contactId: t.contactId,
    oportunidadId: t.oportunidadId,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

export async function obtenerDetalleOportunidad(
  quien: Quien,
  oportunidadId: string
): Promise<OportunidadDetalleDto> {
  const { organizationId } = quien;
  const db = getDb();
  const dto = await oportunidadConNombres(organizationId, oportunidadId);
  const [op] = await db
    .select()
    .from(schema.oportunidad)
    .where(eq(schema.oportunidad.id, oportunidadId))
    .limit(1);
  if (!op) throw new Error("oportunidad desaparecida");

  // Las vecinas del mismo contacto: la anterior (marca el inicio de esta
  // historia) y las abiertas en paralelo.
  let anterior: OportunidadVecina | null = null;
  let paralelas: OportunidadVecina[] = [];
  if (op.contactId) {
    const vecinas = await db
      .select({ op: schema.oportunidad, edificioNombre: schema.edificio.nombre, edificioColor: schema.edificio.color })
      .from(schema.oportunidad)
      .leftJoin(schema.edificio, eq(schema.edificio.id, schema.oportunidad.edificioId))
      .where(
        scoped(
          schema.oportunidad.organizationId,
          organizationId,
          eq(schema.oportunidad.contactId, op.contactId),
          ne(schema.oportunidad.id, op.id)
        )
      )
      .orderBy(desc(schema.oportunidad.createdAt));
    const aVecina = (v: (typeof vecinas)[number]): OportunidadVecina => ({
      id: v.op.id,
      nombre: v.op.nombre,
      estado: v.op.estado,
      edificioNombre: v.edificioNombre,
      edificioColor: v.edificioColor,
      cerradaAt: iso(v.op.cerradaAt),
      motivoCierre: v.op.motivoCierre,
    });
    const previa = vecinas.find((v) => v.op.createdAt < op.createdAt && !ABIERTOS.includes(v.op.estado));
    anterior = previa ? aVecina(previa) : null;
    paralelas = vecinas.filter((v) => ABIERTOS.includes(v.op.estado)).map(aVecina);
  }

  const desde = anterior?.cerradaAt ? new Date(anterior.cerradaAt) : null;
  const hasta = op.cerradaAt;
  const enVentana = (col: typeof schema.message.createdAt | typeof schema.booking.createdAt) =>
    and(desde ? gt(col, desde) : undefined, hasta ? lte(col, hasta) : undefined);

  let contacto: ContactoDeOportunidad | null = null;
  let conversacion: OportunidadDetalleDto["conversacion"] = null;
  let mensajes: MensajeCorto[] = [];
  let reuniones: ReunionCorta[] = [];

  if (op.contactId) {
    const [c] = await db
      .select()
      .from(schema.contact)
      .where(scoped(schema.contact.organizationId, organizationId, eq(schema.contact.id, op.contactId)))
      .limit(1);
    const convs = await db
      .select()
      .from(schema.conversation)
      .where(
        scoped(
          schema.conversation.organizationId,
          organizationId,
          eq(schema.conversation.contactId, op.contactId),
          eq(schema.conversation.isTest, false)
        )
      )
      .orderBy(desc(schema.conversation.lastMessageAt));
    const principal = convs[0] ?? null;
    if (principal) {
      const cierra = principal.lastInboundAt
        ? new Date(principal.lastInboundAt.getTime() + WINDOW_MS)
        : null;
      conversacion = {
        id: principal.id,
        ventanaAbierta: isWindowOpen(principal.lastInboundAt),
        ventanaCierraAt: iso(cierra),
      };
    }

    const [anuncio] = await db
      .select({ headline: schema.adAttribution.headline, sourceUrl: schema.adAttribution.sourceUrl })
      .from(schema.adAttribution)
      .where(scoped(schema.adAttribution.organizationId, organizationId, eq(schema.adAttribution.contactId, op.contactId)))
      .limit(1);
    if (c) {
      contacto = {
        id: c.id,
        nombre: c.name,
        telefono: c.phone,
        email: c.email,
        tipoContacto: c.tipoContacto,
        fuente: c.source,
        creadoAt: c.createdAt.toISOString(),
        anuncio: anuncio ? { titulo: anuncio.headline, url: anuncio.sourceUrl } : null,
      };
    }

    if (convs.length) {
      const filas = await db
        .select()
        .from(schema.message)
        .where(
          scoped(
            schema.message.organizationId,
            organizationId,
            inArray(
              schema.message.conversationId,
              convs.map((v) => v.id)
            ),
            enVentana(schema.message.createdAt)
          )
        )
        .orderBy(asc(schema.message.createdAt));
      mensajes = filas.map((m) => ({
        id: m.id,
        direction: m.direction,
        texto: m.text,
        tipo: m.type,
        origen: m.origin,
        status: m.status,
        createdAt: m.createdAt.toISOString(),
      }));
    }

    const citas = await db
      .select()
      .from(schema.booking)
      .where(
        scoped(
          schema.booking.organizationId,
          organizationId,
          eq(schema.booking.contactId, op.contactId),
          eq(schema.booking.kind, "session"),
          enVentana(schema.booking.createdAt)
        )
      )
      .orderBy(desc(schema.booking.scheduledAt));
    reuniones = citas.map((b) => ({
      id: b.id,
      scheduledAt: b.scheduledAt.toISOString(),
      durationMinutes: b.durationMinutes,
      status: b.status,
      source: b.source,
      meetingLink: b.meetingLink,
      createdAt: b.createdAt.toISOString(),
    }));
  }

  // Tareas: las de esta oportunidad, y las sueltas del contacto en su ventana.
  const tareas = (
    await db
      .select()
      .from(schema.tareaVenta)
      .where(
        scoped(
          schema.tareaVenta.organizationId,
          organizationId,
          op.contactId
            ? or(
                eq(schema.tareaVenta.oportunidadId, op.id),
                and(
                  eq(schema.tareaVenta.contactId, op.contactId),
                  isNull(schema.tareaVenta.oportunidadId),
                  desde ? gt(schema.tareaVenta.createdAt, desde) : undefined,
                  hasta ? lt(schema.tareaVenta.createdAt, hasta) : undefined
                )
              )
            : eq(schema.tareaVenta.oportunidadId, op.id)
        )
      )
      .orderBy(asc(schema.tareaVenta.fecha), asc(schema.tareaVenta.createdAt))
  ).map(aTareaCorta);

  const formularios = (
    await db
      .select()
      .from(schema.oportunidadLead)
      .where(
        scoped(
          schema.oportunidadLead.organizationId,
          organizationId,
          eq(schema.oportunidadLead.oportunidadId, op.id)
        )
      )
      .orderBy(desc(schema.oportunidadLead.recibidoAt))
  ).map((f) => ({
    leadId: f.leadId,
    origen: f.origen,
    formName: f.formName,
    campaignName: f.campaignName,
    adName: f.adName,
    recibidoAt: f.recibidoAt.toISOString(),
  }));

  const eventos: EventoCorto[] = (
    await db
      .select({ ev: schema.oportunidadEvento, actorNombre: schema.user.name })
      .from(schema.oportunidadEvento)
      .leftJoin(schema.user, eq(schema.user.id, schema.oportunidadEvento.actorUserId))
      .where(
        scoped(
          schema.oportunidadEvento.organizationId,
          organizationId,
          eq(schema.oportunidadEvento.oportunidadId, op.id)
        )
      )
      .orderBy(asc(schema.oportunidadEvento.occurredAt))
  ).map(({ ev, actorNombre }) => ({
    id: ev.id,
    tipo: ev.tipo,
    estadoDesde: ev.estadoDesde,
    estadoHasta: ev.estadoHasta,
    motivo: ev.motivo,
    fuente: ev.fuente,
    actorNombre,
    datos: ev.datos ?? null,
    occurredAt: ev.occurredAt.toISOString(),
  }));

  const notas = await listarNotasDeOportunidad(quien, op.id);

  const timeline = armarTimeline({
    eventos,
    mensajes,
    reuniones,
    tareas,
    notas: notas.map((n) => ({
      id: n.id,
      texto: n.texto,
      autorNombre: n.autor?.nombre ?? null,
      createdAt: n.createdAt,
    })),
  });

  return {
    oportunidad: { ...dto, estadoDesde: op.estadoDesde.toISOString(), cerradaAt: iso(op.cerradaAt) },
    contacto,
    conversacion,
    mensajes: ultimosMensajes(mensajes, 4),
    reuniones,
    tareasPendientes: tareas.filter((t) => t.estado === "realizar"),
    proximos: armarProximos({ tareas, reuniones }),
    formularios,
    notas,
    timeline,
    anterior,
    paralelas,
  };
}
