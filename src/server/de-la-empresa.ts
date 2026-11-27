import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

/**
 * v7 — Contactos de la empresa: el tipo de contacto «propio» («De la
 * empresa»). Quedan fuera de los flujos: no contesta la IA, no los lee el
 * lector, no se les abren oportunidades solas (ni por la ficha ni por Make),
 * no entran en la asignación ni cuentan en Resultados. El chat sigue en la
 * Bandeja, con el logo de la empresa. Una persona sí puede abrirles una
 * oportunidad a mano.
 */
export const TIPO_EMPRESA = "propio";

export async function esDeLaEmpresa(organizationId: string, contactId: string): Promise<boolean> {
  try {
    const [f] = await getDb()
      .select({ id: schema.contact.id })
      .from(schema.contact)
      .where(
        and(
          eq(schema.contact.organizationId, organizationId),
          eq(schema.contact.id, contactId),
          sql`${TIPO_EMPRESA} = any(${schema.contact.tiposContacto})`
        )
      )
      .limit(1);
    return Boolean(f);
  } catch {
    return false;
  }
}
