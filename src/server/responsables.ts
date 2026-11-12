import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";

/** 0050 — Responsable de la oportunidad: los usuarios del equipo. */

export type ResponsableDto = { userId: string; nombre: string };

export async function listarResponsables(organizationId: string): Promise<ResponsableDto[]> {
  const filas = await getDb()
    .select({ userId: schema.user.id, nombre: schema.user.name })
    .from(schema.member)
    .innerJoin(schema.user, eq(schema.member.userId, schema.user.id))
    .where(scoped(schema.member.organizationId, organizationId));
  return filas.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

export async function cambiarResponsable(organizationId: string, oportunidadId: string, userId: string | null): Promise<boolean> {
  if (userId && !(await listarResponsables(organizationId)).some((r) => r.userId === userId)) return false;
  const [fila] = await getDb()
    .update(schema.oportunidad)
    .set({ responsableUserId: userId, updatedAt: new Date() })
    .where(and(eq(schema.oportunidad.organizationId, organizationId), eq(schema.oportunidad.id, oportunidadId)))
    .returning({ id: schema.oportunidad.id });
  return Boolean(fila);
}
