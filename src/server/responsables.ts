import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { ASIGNAR_A_IA } from "@/lib/asignacion";
import type { Anterior } from "@/lib/asignaciones";
import { registrarEvento, type Actor } from "@/server/oportunidad-historial";

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

/** `userId` = una persona del equipo, `"ia"` = el agente (0051) o `null` = nadie. */
export async function cambiarResponsable(
  organizationId: string,
  oportunidadId: string,
  userId: string | null,
  actorUserId: string | null = null
): Promise<boolean> {
  const ia = userId === ASIGNAR_A_IA;
  if (userId && !ia && !(await listarResponsables(organizationId)).some((r) => r.userId === userId)) return false;
  const hecho = await aplicarResponsable({
    organizationId,
    oportunidadId,
    destino: { userId: ia ? null : userId, ia },
    como: "manual",
    actor: actorUserId ? { fuente: "persona", userId: actorUserId } : { fuente: "sistema" },
  });
  return Boolean(hecho);
}

/**
 * 0060 — El único lugar que cambia quién lleva una oportunidad: deja
 * `asignada_por` (cómo llegó) y un evento `responsable` con los nombres como
 * foto, y devuelve cómo estaba antes (para deshacer). `restaurar` vuelve a un
 * estado anterior tal cual; `soloSiSinNadie` no pisa a quien ya la tenga.
 * Devuelve null si la oportunidad no existe (o ya tenía a alguien).
 */
export async function aplicarResponsable(input: {
  organizationId: string;
  oportunidadId: string;
  destino: { userId: string | null; ia: boolean };
  como: "auto" | "manual" | "ia" | "deshacer";
  actor: Actor;
  restaurar?: Anterior;
  soloSiSinNadie?: boolean;
}): Promise<{ anterior: Anterior; cambio: boolean } | null> {
  const { organizationId, oportunidadId, destino } = input;
  const db = getDb();
  const o = schema.oportunidad;
  const delOp = and(eq(o.organizationId, organizationId), eq(o.id, oportunidadId));
  const [actual] = await db.select().from(o).where(delOp).limit(1);
  if (!actual) return null;
  const anterior: Anterior = {
    userId: actual.responsableUserId,
    ia: actual.responsableIa,
    asignadaPor: actual.asignadaPor,
    asignadaPorUserId: actual.asignadaPorUserId,
    desde: actual.responsableDesde ? actual.responsableDesde.toISOString() : null,
  };
  const ia = destino.ia;
  const userId = ia ? null : destino.userId;
  if (anterior.userId === userId && anterior.ia === ia && !input.restaurar) return { anterior, cambio: false };
  if (input.soloSiSinNadie && (anterior.userId || anterior.ia)) return null;

  const r = input.restaurar;
  const nadie = !userId && !ia;
  const [fila] = await db
    .update(o)
    .set({
      responsableUserId: userId,
      responsableIa: ia,
      responsableDesde: r ? (r.desde ? new Date(r.desde) : null) : nadie ? null : new Date(),
      asignadaPor: r ? r.asignadaPor : nadie ? null : input.como === "deshacer" ? "manual" : input.como,
      asignadaPorUserId: r
        ? r.asignadaPorUserId
        : nadie || input.actor.fuente !== "persona"
          ? null
          : (input.actor.userId ?? null),
      updatedAt: new Date(),
    })
    .where(input.soloSiSinNadie ? and(delOp, isNull(o.responsableUserId), eq(o.responsableIa, false)) : delOp)
    .returning();
  if (!fila) return null;

  const ids = [anterior.userId, userId].filter((x): x is string => Boolean(x));
  const nombres = new Map(
    ids.length
      ? (
          await db
            .select({ id: schema.user.id, name: schema.user.name })
            .from(schema.user)
            .where(inArray(schema.user.id, ids))
        ).map((u) => [u.id, u.name])
      : []
  );
  const agente = anterior.ia || ia ? await nombreDelAgente(organizationId) : "";
  const nombre = (u: string | null, esIa: boolean) => (esIa ? `${agente} (IA)` : u ? (nombres.get(u) ?? null) : null);
  await registrarEvento({
    organizationId,
    op: fila,
    tipo: "responsable",
    actor: input.actor,
    datos: {
      como: input.como,
      desde: { userId: anterior.userId, ia: anterior.ia, nombre: nombre(anterior.userId, anterior.ia) },
      hacia: { userId, ia, nombre: nombre(userId, ia) },
    },
  });
  return { anterior, cambio: true };
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
