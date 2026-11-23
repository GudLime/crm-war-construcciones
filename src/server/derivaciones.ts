import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { comentarioDeDerivacion, tareaParaDerivacion } from "@/lib/derivaciones";
import { nombreDelAgente } from "@/server/responsables";

/**
 * Cambios 23/11, punto 6 — Cuando la IA deriva una conversación, además de la
 * marca de derivación crea una tarea a nombre de quien está configurado en
 * Ajustes → Ventas («Responsable de las derivaciones de la IA»; vacío = sin
 * asignar), ligada a la oportunidad del contacto. Si ya hay una tarea de IA
 * abierta para esa conversación, solo le actualiza el comentario. Nunca rompe
 * la derivación.
 */
export async function tareaPorDerivacion(input: {
  organizationId: string;
  conversationId: string;
  codigo: string | null;
  resumen: string | null;
}): Promise<void> {
  const { organizationId, conversationId } = input;
  try {
    const db = getDb();
    const [conv] = await db
      .select({ contactId: schema.conversation.contactId, isTest: schema.conversation.isTest, nombre: schema.contact.name })
      .from(schema.conversation)
      .leftJoin(schema.contact, eq(schema.contact.id, schema.conversation.contactId))
      .where(scoped(schema.conversation.organizationId, organizationId, eq(schema.conversation.id, conversationId)))
      .limit(1);
    if (!conv || conv.isTest) return;

    const [ultimo] = await db
      .select({ text: schema.message.text })
      .from(schema.message)
      .where(and(eq(schema.message.conversationId, conversationId), eq(schema.message.direction, "in")))
      .orderBy(desc(schema.message.createdAt))
      .limit(1);
    const agente = await nombreDelAgente(organizationId);
    const plan = tareaParaDerivacion(input.codigo, input.resumen, conv.nombre);
    const comentarios = comentarioDeDerivacion(ultimo?.text ?? null, agente, plan.motivo);

    const t = schema.tareaVenta;
    const [abierta] = await db
      .select({ id: t.id })
      .from(t)
      .where(and(eq(t.organizationId, organizationId), eq(t.conversationId, conversationId), eq(t.creadaPor, "ia"), eq(t.estado, "realizar")))
      .limit(1);
    if (abierta) {
      await db.update(t).set({ comentarios, updatedAt: new Date() }).where(eq(t.id, abierta.id));
      return;
    }

    const [aj] = await db
      .select({ uid: schema.ventasAjustes.derivacionesResponsableUserId })
      .from(schema.ventasAjustes)
      .where(eq(schema.ventasAjustes.organizationId, organizationId))
      .limit(1);
    const [op] = conv.contactId
      ? await db
          .select({ id: schema.oportunidad.id })
          .from(schema.oportunidad)
          .where(scoped(schema.oportunidad.organizationId, organizationId, eq(schema.oportunidad.contactId, conv.contactId)))
          .orderBy(desc(schema.oportunidad.ultimaInteraccion))
          .limit(1)
      : [];
    await db.insert(t).values({
      id: newId("tareaVenta"),
      organizationId,
      titulo: plan.titulo,
      tipo: plan.tipo,
      estado: "realizar",
      fecha: new Date(Date.now() + plan.minutos * 60_000),
      comentarios,
      contactId: conv.contactId,
      oportunidadId: op?.id ?? null,
      responsableUserId: aj?.uid ?? null,
      creadaPor: "ia",
      conversationId,
    });
  } catch (err) {
    console.error("[derivaciones] no se pudo crear la tarea", err);
  }
}

/** Ajustes → Ventas: a quién van (null = sin asignar). */
export async function leerResponsableDerivaciones(organizationId: string): Promise<string | null> {
  const [aj] = await getDb()
    .select({ uid: schema.ventasAjustes.derivacionesResponsableUserId })
    .from(schema.ventasAjustes)
    .where(eq(schema.ventasAjustes.organizationId, organizationId))
    .limit(1);
  return aj?.uid ?? null;
}

export async function guardarResponsableDerivaciones(organizationId: string, userId: string | null): Promise<void> {
  const valores = { derivacionesResponsableUserId: userId, updatedAt: new Date() };
  await getDb()
    .insert(schema.ventasAjustes)
    .values({ organizationId, ...valores })
    .onConflictDoUpdate({ target: schema.ventasAjustes.organizationId, set: valores });
}
