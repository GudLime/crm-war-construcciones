import { and, asc, eq, isNotNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { portalDelMensaje } from "@/lib/origen-por-mensaje";
import { existeOrigen } from "@/server/origenes";

/** v7 — El primer mensaje que mandó el contacto (con texto), o null. */
export async function primerMensajeDelContacto(organizationId: string, contactId: string): Promise<string | null> {
  const [f] = await getDb()
    .select({ text: schema.message.text })
    .from(schema.message)
    .innerJoin(schema.conversation, eq(schema.conversation.id, schema.message.conversationId))
    .where(
      and(
        eq(schema.conversation.organizationId, organizationId),
        eq(schema.conversation.contactId, contactId),
        eq(schema.message.direction, "in"),
        isNotNull(schema.message.text)
      )
    )
    .orderBy(asc(schema.message.createdAt))
    .limit(1);
  return f?.text ?? null;
}

/**
 * v7 — El origen que dice el primer mensaje (Zonaprop, Mercado Libre…), si
 * está configurado en Orígenes. Nunca lanza: sin origen, null.
 */
export async function origenDelPrimerMensaje(organizationId: string, contactId: string): Promise<string | null> {
  try {
    const portal = portalDelMensaje(await primerMensajeDelContacto(organizationId, contactId));
    if (!portal) return null;
    return (await existeOrigen(organizationId, portal)) ? portal : null;
  } catch {
    return null;
  }
}
