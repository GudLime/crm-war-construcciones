import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { ASIGNAR_A_IA } from "@/lib/asignacion";

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

/** Sin tildes ni mayúsculas, solo letras. */
const plano = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/**
 * El usuario que corresponde a un nombre de Notion («Sebastián Lima»,
 * «WAR Construcciones, Sebastián Lima»): el primero cuyo primer nombre
 * aparece en el texto. Si no hay ninguno, null (se ignora).
 */
export function responsableDeTexto(texto: string | null | undefined, equipo: ResponsableDto[]): string | null {
  if (!texto) return null;
  const t = plano(texto);
  for (const r of equipo) {
    const primer = plano(r.nombre).split(/\s+/)[0];
    if (primer && primer.length >= 3 && new RegExp(`\\b${primer}\\b`).test(t)) return r.userId;
  }
  return null;
}

/** `userId` = una persona del equipo, `"ia"` = el agente (0051) o `null` = nadie. */
export async function cambiarResponsable(organizationId: string, oportunidadId: string, userId: string | null): Promise<boolean> {
  const ia = userId === ASIGNAR_A_IA;
  if (userId && !ia && !(await listarResponsables(organizationId)).some((r) => r.userId === userId)) return false;
  const [fila] = await getDb()
    .update(schema.oportunidad)
    .set({
      responsableUserId: ia ? null : userId,
      responsableIa: ia,
      responsableDesde: userId ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(and(eq(schema.oportunidad.organizationId, organizationId), eq(schema.oportunidad.id, oportunidadId)))
    .returning({ id: schema.oportunidad.id });
  return Boolean(fila);
}

/** 0051 — Cómo se llama el agente de IA (Agente → nombre), para mostrarlo como responsable. */
export async function nombreDelAgente(organizationId: string): Promise<string> {
  const [p] = await getDb()
    .select({ name: schema.agentProfile.name })
    .from(schema.agentProfile)
    .where(eq(schema.agentProfile.organizationId, organizationId))
    .limit(1);
  return p?.name?.trim() || "Asistente";
}
