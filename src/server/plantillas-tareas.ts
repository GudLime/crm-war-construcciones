import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { PLANTILLAS_DE_FABRICA, VALORES_SITUACION, type Plantilla } from "@/lib/sugerencias";
import { VALORES_TIPO_TAREA, type TipoTarea } from "@/lib/ventas";

/**
 * 0059 — Plantillas de tareas sugeridas (Configuración → Plantillas de
 * tareas). Las arma el admin para todo el equipo. Las de fábrica se cargan la
 * primera vez que se piden (una sola vez por organización: si después se
 * borran, no vuelven).
 */

export const plantillaSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio").max(120),
  tipo: z.enum(VALORES_TIPO_TAREA as [TipoTarea, ...TipoTarea[]]),
  situacion: z.enum(VALORES_SITUACION as unknown as [string, ...string[]]),
  diasSinRespuesta: z.number().int().min(1).max(60).nullable().optional(),
  vence: z.string().regex(/^(hoy|manana|antes_visita|\+\d{1,3})$/, "Ese vencimiento no existe"),
  mensaje: z.string().trim().max(1000).nullable().optional(),
  activa: z.boolean().optional(),
  orden: z.number().int().min(0).max(100_000).optional(),
});

export type PlantillaDatos = z.infer<typeof plantillaSchema>;

function aPlantilla(f: typeof schema.tareaPlantilla.$inferSelect): Plantilla {
  return {
    id: f.id,
    nombre: f.nombre,
    tipo: f.tipo,
    situacion: f.situacion,
    diasSinRespuesta: f.diasSinRespuesta,
    vence: f.vence,
    mensaje: f.mensaje,
    activa: f.activa,
    orden: f.orden,
  };
}

/** Carga las plantillas de fábrica la primera vez. Idempotente. */
export async function asegurarPlantillas(organizationId: string): Promise<void> {
  const db = getDb();
  const [aj] = await db
    .select({ sembradas: schema.ventasAjustes.plantillasSembradas })
    .from(schema.ventasAjustes)
    .where(eq(schema.ventasAjustes.organizationId, organizationId))
    .limit(1);
  if (aj?.sembradas) return;
  await db.transaction(async (tx) => {
    // Marca primero (con candado de fila): dos pedidos a la vez no siembran dos veces.
    const marcadas = await tx
      .insert(schema.ventasAjustes)
      .values({ organizationId, plantillasSembradas: true })
      .onConflictDoUpdate({
        target: schema.ventasAjustes.organizationId,
        set: { plantillasSembradas: true },
        setWhere: eq(schema.ventasAjustes.plantillasSembradas, false),
      })
      .returning({ id: schema.ventasAjustes.organizationId });
    if (!marcadas.length) return;
    await tx.insert(schema.tareaPlantilla).values(
      PLANTILLAS_DE_FABRICA.map((p) => ({ id: newId("tareaPlantilla"), organizationId, ...p, tipo: p.tipo as TipoTarea }))
    );
  });
}

export async function listarPlantillas(organizationId: string): Promise<Plantilla[]> {
  await asegurarPlantillas(organizationId);
  const filas = await getDb()
    .select()
    .from(schema.tareaPlantilla)
    .where(eq(schema.tareaPlantilla.organizationId, organizationId))
    .orderBy(asc(schema.tareaPlantilla.orden), asc(schema.tareaPlantilla.createdAt));
  return filas.map(aPlantilla);
}

function valores(d: PlantillaDatos) {
  return {
    nombre: d.nombre,
    tipo: d.tipo,
    situacion: d.situacion,
    diasSinRespuesta: d.situacion === "no_contesta" ? (d.diasSinRespuesta ?? 3) : null,
    vence: d.vence === "antes_visita" && d.situacion !== "visita_agendada" ? "hoy" : d.vence,
    mensaje: d.mensaje?.trim() || null,
    ...(d.activa !== undefined ? { activa: d.activa } : {}),
  };
}

export async function crearPlantilla(organizationId: string, d: PlantillaDatos): Promise<Plantilla> {
  await asegurarPlantillas(organizationId);
  const [max] = await getDb()
    .select({ orden: sql<number>`coalesce(max(${schema.tareaPlantilla.orden}), 0)`.mapWith(Number) })
    .from(schema.tareaPlantilla)
    .where(eq(schema.tareaPlantilla.organizationId, organizationId));
  const [f] = await getDb()
    .insert(schema.tareaPlantilla)
    .values({ id: newId("tareaPlantilla"), organizationId, ...valores(d), orden: d.orden ?? (max?.orden ?? 0) + 10 })
    .returning();
  return aPlantilla(f!);
}

export async function editarPlantilla(organizationId: string, id: string, d: PlantillaDatos): Promise<Plantilla | null> {
  const [f] = await getDb()
    .update(schema.tareaPlantilla)
    .set({ ...valores(d), ...(d.orden !== undefined ? { orden: d.orden } : {}), updatedAt: new Date() })
    .where(scoped(schema.tareaPlantilla.organizationId, organizationId, eq(schema.tareaPlantilla.id, id)))
    .returning();
  return f ? aPlantilla(f) : null;
}

/** Prender o pausar sin tocar lo demás. */
export async function activarPlantilla(organizationId: string, id: string, activa: boolean): Promise<boolean> {
  const f = await getDb()
    .update(schema.tareaPlantilla)
    .set({ activa, updatedAt: new Date() })
    .where(and(eq(schema.tareaPlantilla.organizationId, organizationId), eq(schema.tareaPlantilla.id, id)))
    .returning({ id: schema.tareaPlantilla.id });
  return f.length > 0;
}

export async function borrarPlantilla(organizationId: string, id: string): Promise<boolean> {
  const f = await getDb()
    .delete(schema.tareaPlantilla)
    .where(and(eq(schema.tareaPlantilla.organizationId, organizationId), eq(schema.tareaPlantilla.id, id)))
    .returning({ id: schema.tareaPlantilla.id });
  return f.length > 0;
}
