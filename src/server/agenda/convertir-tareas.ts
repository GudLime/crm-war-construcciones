import { and, count, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { getSettings } from "@/server/agenda/settings";

/**
 * 0054 — Visita y Reunión son la misma cita (Agenda). Las tareas de tipo
 * Visita o Reunión que ya existían se pasan a citas: con su fecha, contacto,
 * estado y comentario. Es un paso que pide el admin desde Ajustes (no corre
 * solo) y no toca conectores: una visita vieja no crea una reunión de Zoom.
 *
 * Si en ese instante ya hay otra cita activa (la agenda no admite dos), esa
 * tarea queda como está y se informa. Sin fecha, no hay cita posible: queda.
 */

const TIPOS = ["visita", "reunion"] as const;

const ESTADO: Record<string, "agendada" | "realizada" | "no_show"> = {
  realizar: "agendada",
  listo: "realizada",
  no_responde: "no_show",
};

export type ResumenConversion = { conFecha: number; sinFecha: number };
export type ResultadoConversion = { convertidas: number; chocan: number; sinFecha: number };

export async function contarTareasDeVisita(organizationId: string): Promise<ResumenConversion> {
  const t = schema.tareaVenta;
  const contar = (conFecha: boolean) =>
    getDb()
      .select({ n: count() })
      .from(t)
      .where(
        scoped(t.organizationId, organizationId, inArray(t.tipo, [...TIPOS]), conFecha ? isNotNull(t.fecha) : isNull(t.fecha))
      );
  const [[con], [sin]] = await Promise.all([contar(true), contar(false)]);
  return { conFecha: Number(con?.n ?? 0), sinFecha: Number(sin?.n ?? 0) };
}

function choca(err: unknown): boolean {
  const code = (e: unknown) => (typeof e === "object" && e !== null ? (e as { code?: unknown }).code : undefined);
  return code(err) === "23505" || code((err as { cause?: unknown })?.cause) === "23505";
}

export async function convertirTareasDeVisita(organizationId: string): Promise<ResultadoConversion> {
  const db = getDb();
  const t = schema.tareaVenta;
  const settings = await getSettings(organizationId);
  const tareas = await db
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
    })
    .from(t)
    .leftJoin(schema.oportunidad, eq(schema.oportunidad.id, t.oportunidadId))
    .where(scoped(t.organizationId, organizationId, inArray(t.tipo, [...TIPOS]), isNotNull(t.fecha)));

  let convertidas = 0;
  let chocan = 0;
  for (const tarea of tareas) {
    const notas = [tarea.titulo, tarea.comentarios?.trim()].filter(Boolean).join("\n\n");
    try {
      await db.transaction(async (tx) => {
        await tx.insert(schema.booking).values({
          id: newId("booking"),
          organizationId,
          kind: "session",
          status: ESTADO[tarea.estado] ?? "agendada",
          source: "manual",
          contactId: tarea.contactId ?? tarea.oportunidadContacto ?? null,
          scheduledAt: tarea.fecha!,
          durationMinutes: settings.slotMinutes,
          connector: null,
          notes: notas || null,
          // La cargó una persona: cuenta como confirmada por quien la tenía.
          confirmadaAt: tarea.createdAt,
          confirmadaPorUserId: tarea.responsable,
        });
        await tx.delete(t).where(and(eq(t.organizationId, organizationId), eq(t.id, tarea.id)));
      });
      convertidas += 1;
    } catch (err) {
      if (!choca(err)) throw err;
      chocan += 1;
    }
  }
  const [sin] = await db
    .select({ n: count() })
    .from(t)
    .where(scoped(t.organizationId, organizationId, inArray(t.tipo, [...TIPOS]), isNull(t.fecha)));
  return { convertidas, chocan, sinFecha: Number(sin?.n ?? 0) };
}
