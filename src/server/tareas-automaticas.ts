import { and, eq, inArray, ne } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { aplicaAlOrigen, completarMensaje, vencimiento } from "@/lib/sugerencias";
import { todayInTz, zonedWallClockToUtc } from "@/lib/time/slots";
import type { TipoTarea } from "@/lib/ventas";
import { businessTimezone } from "@/server/analytics/period";
import { listarPlantillas } from "@/server/plantillas-tareas";

/**
 * 0061 — Tareas que se crean solas al asignar (cambios 23/11, punto 4a): las
 * plantillas con situación «Al asignarle responsable», filtradas por el origen
 * de la oportunidad. Se llama desde `aplicarResponsable`.
 *
 * - De nadie a una persona: crea la tarea a su nombre (si ya hay una abierta de
 *   esa plantilla, no crea otra).
 * - De una persona a otra: las abiertas de esas plantillas pasan a la nueva.
 * - A la IA o a nadie: nada.
 *
 * Nunca rompe la asignación: si algo falla, se registra y sigue.
 */
export async function tareasAlAsignar(input: {
  organizationId: string;
  oportunidadId: string;
  antes: { userId: string | null; ia: boolean };
  despues: { userId: string | null; ia: boolean };
}): Promise<void> {
  const { organizationId, oportunidadId, antes, despues } = input;
  if (despues.ia || !despues.userId) return;
  try {
    const plantillas = (await listarPlantillas(organizationId)).filter((p) => p.situacion === "al_asignar" && p.activa);
    if (!plantillas.length) return;
    const db = getDb();
    const t = schema.tareaVenta;
    const ids = plantillas.map((p) => p.id);

    if (antes.userId) {
      await db
        .update(t)
        .set({ responsableUserId: despues.userId, updatedAt: new Date() })
        .where(
          scoped(t.organizationId, organizationId, eq(t.oportunidadId, oportunidadId), inArray(t.plantillaId, ids), eq(t.estado, "realizar"))
        );
      return;
    }

    const [o] = await db
      .select({
        origen: schema.oportunidad.origen,
        contactId: schema.oportunidad.contactId,
        contacto: schema.contact.name,
        vendedor: schema.user.name,
      })
      .from(schema.oportunidad)
      .leftJoin(schema.contact, eq(schema.contact.id, schema.oportunidad.contactId))
      .leftJoin(schema.user, eq(schema.user.id, despues.userId))
      .where(scoped(schema.oportunidad.organizationId, organizationId, eq(schema.oportunidad.id, oportunidadId)))
      .limit(1);
    if (!o) return;
    const aplican = plantillas.filter((p) => aplicaAlOrigen(p, o.origen));
    if (!aplican.length) return;

    const yaAbiertas = new Set(
      (
        await db
          .select({ plantillaId: t.plantillaId })
          .from(t)
          .where(
            and(
              eq(t.organizationId, organizationId),
              eq(t.oportunidadId, oportunidadId),
              inArray(t.plantillaId, aplican.map((p) => p.id)),
              ne(t.estado, "listo")
            )
          )
      ).map((x) => x.plantillaId)
    );
    const tz = await businessTimezone(organizationId);
    const ahora = new Date();
    const hoy = todayInTz(ahora, tz);
    const primero = (n: string | null) => n?.trim().split(/\s+/)[0] ?? null;
    const nuevas = aplican
      .filter((p) => !yaAbiertas.has(p.id))
      .map((p) => {
        const dia = vencimiento(p.vence, hoy, null) ?? hoy;
        // Para hoy, vence ya (es lo primero que hay que hacer); otro día, a las 10.
        const fecha = dia === hoy ? ahora : (zonedWallClockToUtc(dia, "10:00", tz) ?? ahora);
        return {
          id: newId("tareaVenta"),
          organizationId,
          titulo: p.nombre,
          tipo: p.tipo as TipoTarea,
          estado: "realizar" as const,
          fecha,
          comentarios: p.mensaje
            ? completarMensaje(p.mensaje, { nombre: primero(o.contacto), vendedor: primero(o.vendedor) }) || null
            : null,
          contactId: o.contactId,
          oportunidadId,
          responsableUserId: despues.userId,
          plantillaId: p.id,
        };
      });
    if (nuevas.length) await db.insert(t).values(nuevas);
  } catch (err) {
    console.error("[tareas-automaticas] no se pudo crear la tarea al asignar", err);
  }
}
