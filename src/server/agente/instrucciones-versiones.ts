import { desc, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";

/** Cuántas versiones anteriores se conservan. */
export const MAX_VERSIONES = 20;

export type VersionInstrucciones = {
  id: string;
  instructions: string;
  createdAt: string;
};

/**
 * Antes de cambiar las instrucciones, guarda las que había (si eran otras y
 * no estaban vacías) y poda a las últimas `MAX_VERSIONES`. Nunca lanza: un
 * fallo del historial no puede impedir guardar las instrucciones.
 */
export async function guardarVersionAnterior(
  organizationId: string,
  nuevas: string | null
): Promise<void> {
  try {
    const db = getDb();
    const [perfil] = await db
      .select({ instructions: schema.agentProfile.instructions })
      .from(schema.agentProfile)
      .where(scoped(schema.agentProfile.organizationId, organizationId))
      .limit(1);
    const actuales = perfil?.instructions ?? "";
    if (!actuales.trim() || actuales === (nuevas ?? "")) return;
    await db.insert(schema.agentInstruccionesVersion).values({
      id: newId("instruccionVersion"),
      organizationId,
      instructions: actuales,
    });
    const todas = await db
      .select({ id: schema.agentInstruccionesVersion.id })
      .from(schema.agentInstruccionesVersion)
      .where(scoped(schema.agentInstruccionesVersion.organizationId, organizationId))
      .orderBy(desc(schema.agentInstruccionesVersion.createdAt));
    const sobran = todas.slice(MAX_VERSIONES).map((v) => v.id);
    if (sobran.length) {
      await db
        .delete(schema.agentInstruccionesVersion)
        .where(inArray(schema.agentInstruccionesVersion.id, sobran));
    }
  } catch (err) {
    console.error("[instrucciones] no se pudo guardar la versión anterior", err);
  }
}

export async function listarVersiones(organizationId: string): Promise<VersionInstrucciones[]> {
  const filas = await getDb()
    .select()
    .from(schema.agentInstruccionesVersion)
    .where(scoped(schema.agentInstruccionesVersion.organizationId, organizationId))
    .orderBy(desc(schema.agentInstruccionesVersion.createdAt))
    .limit(MAX_VERSIONES);
  return filas.map((f) => ({
    id: f.id,
    instructions: f.instructions,
    createdAt: f.createdAt.toISOString(),
  }));
}

