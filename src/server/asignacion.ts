import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import {
  ASIGNACION_POR_DEFECTO,
  ASIGNAR_A_IA,
  destinoPorEdificio,
  esDeMeta,
  type Asignacion,
} from "@/lib/asignacion";

/**
 * 0051 — Asignación automática de los leads de Meta por edificio (Ajustes →
 * Ventas). Las reglas puras viven en `lib/asignacion.ts`.
 */

export class AsignacionError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
  }
}

export async function leerAsignacion(organizationId: string): Promise<Asignacion> {
  const [fila] = await getDb()
    .select({
      activa: schema.ventasAjustes.asignacionActiva,
      porEdificio: schema.ventasAjustes.asignacionPorEdificio,
    })
    .from(schema.ventasAjustes)
    .where(eq(schema.ventasAjustes.organizationId, organizationId))
    .limit(1);
  if (!fila) return { ...ASIGNACION_POR_DEFECTO, porEdificio: {} };
  return { activa: fila.activa, porEdificio: fila.porEdificio ?? {} };
}

/** Guarda el ajuste. Cada edificio y cada persona tienen que ser de la organización. */
export async function guardarAsignacion(organizationId: string, datos: Asignacion): Promise<Asignacion> {
  const db = getDb();
  const porEdificio = Object.fromEntries(Object.entries(datos.porEdificio).filter(([, v]) => v));
  const edificioIds = Object.keys(porEdificio);
  if (edificioIds.length) {
    const edificios = await db
      .select({ id: schema.edificio.id })
      .from(schema.edificio)
      .where(scoped(schema.edificio.organizationId, organizationId, inArray(schema.edificio.id, edificioIds)));
    if (edificios.length !== edificioIds.length) {
      throw new AsignacionError(422, "edificio_desconocido", "Alguno de esos edificios no existe");
    }
  }
  const personas = [...new Set(Object.values(porEdificio).filter((v) => v !== ASIGNAR_A_IA))];
  if (personas.length) {
    const miembros = await db
      .select({ userId: schema.member.userId })
      .from(schema.member)
      .where(scoped(schema.member.organizationId, organizationId, inArray(schema.member.userId, personas)));
    if (miembros.length !== personas.length) {
      throw new AsignacionError(422, "persona_desconocida", "Alguna de esas personas no es del equipo");
    }
  }
  const valores = { asignacionActiva: datos.activa, asignacionPorEdificio: porEdificio, updatedAt: new Date() };
  await db
    .insert(schema.ventasAjustes)
    .values({ organizationId, ...valores })
    .onConflictDoUpdate({ target: schema.ventasAjustes.organizationId, set: valores });
  return { activa: datos.activa, porEdificio };
}

/**
 * Si la asignación está encendida y la oportunidad llegó de Meta sin nadie a
 * cargo, se la da al destino de su edificio. Nunca pisa una asignación hecha
 * (ni a la IA) y nunca frena lo que la llamó: los errores se registran.
 *
 * Devuelve el destino aplicado (`"ia"`, un id de usuario) o null.
 */
export async function asignarLeadDeMeta(organizationId: string, oportunidadId: string): Promise<string | null> {
  try {
    const ajuste = await leerAsignacion(organizationId);
    if (!ajuste.activa || Object.keys(ajuste.porEdificio).length === 0) return null;
    const db = getDb();
    const [op] = await db
      .select({
        origen: schema.oportunidad.origen,
        edificioId: schema.oportunidad.edificioId,
        responsableUserId: schema.oportunidad.responsableUserId,
        responsableIa: schema.oportunidad.responsableIa,
      })
      .from(schema.oportunidad)
      .where(scoped(schema.oportunidad.organizationId, organizationId, eq(schema.oportunidad.id, oportunidadId)))
      .limit(1);
    if (!op || op.responsableUserId || op.responsableIa || !esDeMeta(op.origen)) return null;
    const interes = await db
      .select({ edificioId: schema.oportunidadEdificio.edificioId })
      .from(schema.oportunidadEdificio)
      .where(
        scoped(
          schema.oportunidadEdificio.organizationId,
          organizationId,
          eq(schema.oportunidadEdificio.oportunidadId, oportunidadId)
        )
      );
    const edificios = [...(op.edificioId ? [op.edificioId] : []), ...interes.map((i) => i.edificioId)];
    const destino = destinoPorEdificio(ajuste.porEdificio, edificios);
    if (!destino) return null;
    if (destino !== ASIGNAR_A_IA) {
      // Alguien que ya no es del equipo no recibe leads.
      const [miembro] = await db
        .select({ id: schema.member.id })
        .from(schema.member)
        .where(scoped(schema.member.organizationId, organizationId, eq(schema.member.userId, destino)))
        .limit(1);
      if (!miembro) return null;
    }
    // Solo si sigue sin nadie a cargo (otro proceso pudo asignarla mientras tanto).
    const sinNadie = and(
      scoped(schema.oportunidad.organizationId, organizationId, eq(schema.oportunidad.id, oportunidadId)),
      isNull(schema.oportunidad.responsableUserId),
      eq(schema.oportunidad.responsableIa, false)
    );
    const cambios =
      destino === ASIGNAR_A_IA ? { responsableIa: true } : { responsableUserId: destino };
    const hecho = await db
      .update(schema.oportunidad)
      .set({ ...cambios, responsableDesde: new Date(), updatedAt: new Date() })
      .where(sinNadie)
      .returning({ id: schema.oportunidad.id });
    return hecho.length ? destino : null;
  } catch (err) {
    console.error("[asignacion] no se pudo asignar:", err instanceof Error ? err.message : err);
    return null;
  }
}
