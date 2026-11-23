import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

/**
 * Cambios 23/11, punto 6 — Una persona respondió en la conversación: la tarea
 * de la IA de esa derivación queda hecha (la misma regla que la saca de
 * «Derivadas»). Sin otras dependencias, para poder llamarla desde el registro
 * de salientes sin ciclos.
 */
export async function cerrarTareasDeDerivacion(organizationId: string, conversationId: string): Promise<void> {
  try {
    const t = schema.tareaVenta;
    await getDb()
      .update(t)
      .set({ estado: "listo", updatedAt: new Date() })
      .where(
        and(eq(t.organizationId, organizationId), eq(t.conversationId, conversationId), eq(t.creadaPor, "ia"), eq(t.estado, "realizar"))
      );
  } catch (err) {
    console.error("[derivaciones] no se pudo cerrar la tarea", err);
  }
}
