import { and, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { cambiarEstadoOportunidad } from "@/server/oportunidad-historial";

/**
 * 0061 — Cómo salió una llamada (cambios 23/11, punto 4b): «No atendió» la
 * deja en `no_responde` (cuenta como intento sin respuesta); «Atendió» la
 * cierra con el comentario opcional, marca el primer contacto y, si la
 * oportunidad estaba en Recibido, la pasa a En charlas. El operador, solo las
 * suyas.
 */
export async function resultadoDeLlamada(input: {
  organizationId: string;
  tareaId: string;
  userId: string;
  admin: boolean;
  resultado: "atendio" | "no_atendio";
  comentario?: string | null;
}): Promise<{ oportunidadId: string | null; movida: boolean } | null> {
  const db = getDb();
  const t = schema.tareaVenta;
  const [tarea] = await db
    .select({ id: t.id, comentarios: t.comentarios, oportunidadId: t.oportunidadId })
    .from(t)
    .where(
      scoped(t.organizationId, input.organizationId, eq(t.id, input.tareaId), ...(input.admin ? [] : [eq(t.responsableUserId, input.userId)]))
    )
    .limit(1);
  if (!tarea) return null;

  const nota = input.comentario?.trim();
  const comentarios = nota ? [tarea.comentarios?.trim(), nota].filter(Boolean).join("\n\n") : tarea.comentarios;
  const ahora = new Date();
  await db
    .update(t)
    .set({ estado: input.resultado === "atendio" ? "listo" : "no_responde", comentarios, updatedAt: ahora })
    .where(eq(t.id, tarea.id));

  let movida = false;
  if (input.resultado === "atendio" && tarea.oportunidadId) {
    const op = schema.oportunidad;
    await db
      .update(op)
      .set({ primerContactoAt: ahora })
      .where(and(eq(op.organizationId, input.organizationId), eq(op.id, tarea.oportunidadId), isNull(op.primerContactoAt)));
    const [o] = await db
      .select({ estado: op.estado })
      .from(op)
      .where(and(eq(op.organizationId, input.organizationId), eq(op.id, tarea.oportunidadId)))
      .limit(1);
    if (o?.estado === "recibido") {
      await cambiarEstadoOportunidad({
        organizationId: input.organizationId,
        oportunidadId: tarea.oportunidadId,
        destino: "en_charlas",
        actor: { fuente: "persona", userId: input.userId },
      });
      movida = true;
    }
  }
  return { oportunidadId: tarea.oportunidadId, movida };
}
