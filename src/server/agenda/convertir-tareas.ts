import { and, count, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { getSettings } from "@/server/agenda/settings";
import { publish } from "@/server/events/bus";

/**
 * 0054 — Visita y Reunión son la misma cita (Agenda). Las tareas de tipo
 * Visita o Reunión que ya existían se pasan a citas: con su fecha, contacto,
 * estado y comentario: al arrancar, y una por una apenas reciben fecha
 * (0069). No toca conectores: una visita vieja no crea una reunión de Zoom.
 *
 * Sin citas en paralelo, si en ese instante ya hay otra cita activa la tarea
 * queda como está. Sin fecha no hay cita posible: queda como pendiente.
 */

const TIPOS = ["visita", "reunion"] as const;

const ESTADO: Record<string, "agendada" | "realizada" | "no_show"> = {
  realizar: "agendada",
  listo: "realizada",
  no_responde: "no_show",
};

export type ResultadoConversion = { convertidas: number; chocan: number; sinFecha: number };

function choca(err: unknown): boolean {
  const code = (e: unknown) => (typeof e === "object" && e !== null ? (e as { code?: unknown }).code : undefined);
  return code(err) === "23505" || code((err as { cause?: unknown })?.cause) === "23505";
}

type Fila = {
  id: string;
  titulo: string;
  comentarios: string | null;
  estado: string;
  fecha: Date | null;
  contactId: string | null;
  oportunidadContacto: string | null;
  responsable: string | null;
  createdAt: Date;
  tipo: string;
  edificioId: string | null;
  ubicacion: string | null;
};

function consulta(organizationId: string, extra?: ReturnType<typeof eq>) {
  const t = schema.tareaVenta;
  return getDb()
    .select({
      id: t.id,
      titulo: t.titulo,
      comentarios: t.comentarios,
      estado: t.estado,
      fecha: t.fecha,
      contactId: t.contactId,
      oportunidadContacto: schema.oportunidad.contactId,
      responsable: t.responsableUserId,
      createdAt: t.createdAt,
      tipo: t.tipo,
      edificioId: t.edificioId,
      ubicacion: t.ubicacion,
    })
    .from(t)
    .leftJoin(schema.oportunidad, eq(schema.oportunidad.id, t.oportunidadId))
    .where(scoped(t.organizationId, organizationId, inArray(t.tipo, [...TIPOS]), isNotNull(t.fecha), extra));
}

/** ¿Ya hay otra cita activa en ese instante? Con citas en paralelo, no importa. */
async function ocupado(organizationId: string, at: Date): Promise<boolean> {
  const b = schema.booking;
  const [f] = await getDb()
    .select({ id: b.id })
    .from(b)
    .where(
      scoped(
        b.organizationId,
        organizationId,
        eq(b.kind, "session"),
        eq(b.scheduledAt, at),
        eq(b.isTest, false),
        inArray(b.status, ["agendada", "realizada"])
      )
    )
    .limit(1);
  return Boolean(f);
}

async function pasar(organizationId: string, tarea: Fila, slotMinutes: number, paralelo: boolean): Promise<string | null> {
  if (!paralelo && (await ocupado(organizationId, tarea.fecha!))) return null;
  const t = schema.tareaVenta;
  const notas = [tarea.titulo, tarea.comentarios?.trim()].filter(Boolean).join("\n\n");
  const id = newId("booking");
  try {
    await getDb().transaction(async (tx) => {
      await tx.insert(schema.booking).values({
        id,
        organizationId,
        kind: "session",
        status: ESTADO[tarea.estado] ?? "agendada",
        source: "manual",
        contactId: tarea.contactId ?? tarea.oportunidadContacto ?? null,
        scheduledAt: tarea.fecha!,
        durationMinutes: slotMinutes,
        connector: null,
        notes: notas || null,
        // La cargó una persona: cuenta como confirmada por quien la tenía.
        confirmadaAt: tarea.createdAt,
        confirmadaPorUserId: tarea.responsable,
        // 0064 — La cita guarda si era visita o reunión, dónde y quién la atiende.
        modo: tarea.tipo === "reunion" ? "reunion" : "visita",
        edificioId: tarea.edificioId,
        ubicacion: tarea.ubicacion,
        responsableUserId: tarea.responsable,
      });
      await tx.delete(t).where(and(eq(t.organizationId, organizationId), eq(t.id, tarea.id)));
    });
  } catch (err) {
    if (!choca(err)) throw err;
    return null;
  }
  return id;
}

/**
 * 0069 — Una tarea de Visita o Reunión que acaba de recibir fecha pasa sola a
 * ser la cita (un solo elemento). Devuelve el id de la cita, o null si no
 * corresponde (otro tipo, sin fecha, agenda apagada o el horario ocupado).
 */
export async function pasarTareaACita(organizationId: string, tareaId: string): Promise<string | null> {
  const [tarea] = await consulta(organizationId, eq(schema.tareaVenta.id, tareaId)).limit(1);
  if (!tarea) return null;
  const settings = await getSettings(organizationId);
  const id = await pasar(organizationId, tarea, settings.slotMinutes, settings.citasEnParalelo === true);
  if (id) publish(organizationId, { type: "booking.updated", data: { bookingId: id } });
  return id;
}

export async function convertirTareasDeVisita(organizationId: string): Promise<ResultadoConversion> {
  const t = schema.tareaVenta;
  const settings = await getSettings(organizationId);
  const paralelo = settings.citasEnParalelo === true;
  const tareas = await consulta(organizationId);
  let convertidas = 0;
  let chocan = 0;
  for (const tarea of tareas) {
    if (await pasar(organizationId, tarea, settings.slotMinutes, paralelo)) convertidas += 1;
    else chocan += 1;
  }
  const [sin] = await getDb()
    .select({ n: count() })
    .from(t)
    .where(scoped(t.organizationId, organizationId, inArray(t.tipo, [...TIPOS]), isNull(t.fecha)));
  return { convertidas, chocan, sinFecha: Number(sin?.n ?? 0) };
}

/**
 * v3 — Al arrancar: las tareas de Visita o Reunión con fecha que quedaban se
 * pasan solas a citas, en cada organización (antes era un botón de Ajustes).
 * Nunca tumba el arranque.
 */
export async function convertirTareasDeVisitaAlArrancar(): Promise<void> {
  try {
    const t = schema.tareaVenta;
    const orgs = await getDb()
      .selectDistinct({ id: t.organizationId })
      .from(t)
      .where(and(inArray(t.tipo, [...TIPOS]), isNotNull(t.fecha)));
    for (const o of orgs) {
      const r = await convertirTareasDeVisita(o.id);
      if (r.convertidas || r.chocan) {
        console.log(`[agenda] ${r.convertidas} tarea(s) de visita/reunión pasadas a citas (${r.chocan} chocan con otra cita)`);
      }
    }
  } catch (err) {
    console.error("[agenda] no se pudieron pasar las tareas de visita a citas:", err instanceof Error ? err.message : err);
  }
}
