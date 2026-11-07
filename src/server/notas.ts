import { and, asc, eq, or } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { NOTA_MAX, puedeBorrarNota, type NotaDto } from "@/lib/notas";
import { publish } from "@/server/events/bus";
import { oportunidadAbierta } from "@/server/oportunidades";

/**
 * 050 — Notas internas.
 *
 * Nunca tocan `message`: ni se envían, ni se despachan, ni cuentan como
 * respuesta. Por eso viven aquí y no en `inbox/`.
 *
 * War — Notas unificadas: cada nota es de un CONTACTO y queda asociada a la
 * oportunidad que estaba abierta cuando se escribió. Se escriben desde el chat
 * (con conversación) o desde la oportunidad (sin conversación: un lead de
 * formulario puede no haber escrito nunca).
 *
 * - En el chat se ven TODAS las notas del contacto, con su oportunidad.
 * - En la oportunidad, solo las suyas: no se mezclan las de una compra
 *   anterior.
 */

export class NotaError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export const notaSchema = z.object({
  texto: z.string().trim().min(1, "la nota no puede ir vacía").max(NOTA_MAX),
});

type Quien = { organizationId: string; userId: string; configura: boolean };
type FilaNota = typeof schema.conversationNote.$inferSelect;

async function contactoDeLaConversacion(organizationId: string, conversationId: string) {
  const [conv] = await getDb()
    .select({ id: schema.conversation.id, contactId: schema.conversation.contactId })
    .from(schema.conversation)
    .where(scoped(schema.conversation.organizationId, organizationId, eq(schema.conversation.id, conversationId)))
    .limit(1);
  if (!conv) throw new NotaError(404, "not_found", "Conversación no encontrada");
  return conv.contactId;
}

async function oportunidadDeLaOrganizacion(organizationId: string, oportunidadId: string) {
  const [op] = await getDb()
    .select({ id: schema.oportunidad.id, contactId: schema.oportunidad.contactId })
    .from(schema.oportunidad)
    .where(scoped(schema.oportunidad.organizationId, organizationId, eq(schema.oportunidad.id, oportunidadId)))
    .limit(1);
  if (!op) throw new NotaError(404, "not_found", "Oportunidad no encontrada");
  return op;
}

function aDto(
  fila: FilaNota,
  autorNombre: string | null,
  oportunidadNombre: string | null,
  quien: Quien
): NotaDto {
  return {
    id: fila.id,
    conversationId: fila.conversationId,
    oportunidad:
      fila.oportunidadId && oportunidadNombre
        ? { id: fila.oportunidadId, nombre: oportunidadNombre }
        : null,
    texto: fila.texto,
    createdAt: fila.createdAt.toISOString(),
    autor: fila.authorUserId ? { id: fila.authorUserId, nombre: autorNombre ?? "Alguien del equipo" } : null,
    puedeBorrar: puedeBorrarNota(fila.authorUserId, quien.userId, quien.configura),
  };
}

async function leer(quien: Quien, filtro: ReturnType<typeof and>): Promise<NotaDto[]> {
  const filas = await getDb()
    .select({
      nota: schema.conversationNote,
      autor: schema.user.name,
      oportunidad: schema.oportunidad.nombre,
    })
    .from(schema.conversationNote)
    .leftJoin(schema.user, eq(schema.user.id, schema.conversationNote.authorUserId))
    .leftJoin(schema.oportunidad, eq(schema.oportunidad.id, schema.conversationNote.oportunidadId))
    .where(scoped(schema.conversationNote.organizationId, quien.organizationId, filtro))
    .orderBy(asc(schema.conversationNote.createdAt));
  return filas.map((f) => aDto(f.nota, f.autor, f.oportunidad, quien));
}

/** Las notas que se ven en el chat: todas las del contacto. */
export async function listarNotas(quien: Quien, conversationId: string): Promise<NotaDto[]> {
  const contactId = await contactoDeLaConversacion(quien.organizationId, conversationId);
  return leer(
    quien,
    and(
      or(
        eq(schema.conversationNote.contactId, contactId),
        eq(schema.conversationNote.conversationId, conversationId)
      )
    )
  );
}

/** Las notas de una oportunidad: solo las suyas. */
export async function listarNotasDeOportunidad(quien: Quien, oportunidadId: string): Promise<NotaDto[]> {
  await oportunidadDeLaOrganizacion(quien.organizationId, oportunidadId);
  return leer(quien, and(eq(schema.conversationNote.oportunidadId, oportunidadId)));
}

/** Avisa a los chats del contacto (releen la lista: `puedeBorrar` depende de quién mira). */
async function avisar(organizationId: string, contactId: string | null, tipo: "note.new" | "note.deleted", nota: NotaDto | { id: string }) {
  if (!contactId) return;
  const convs = await getDb()
    .select({ id: schema.conversation.id })
    .from(schema.conversation)
    .where(scoped(schema.conversation.organizationId, organizationId, eq(schema.conversation.contactId, contactId)));
  for (const c of convs) {
    if (tipo === "note.new") {
      publish(organizationId, { type: "note.new", data: { conversationId: c.id, note: nota } });
    } else {
      publish(organizationId, { type: "note.deleted", data: { conversationId: c.id, noteId: nota.id } });
    }
  }
}

async function insertar(
  quien: Quien,
  valores: { conversationId: string | null; contactId: string | null; oportunidadId: string | null },
  texto: string
): Promise<NotaDto> {
  const db = getDb();
  const [autor] = await db
    .select({ name: schema.user.name })
    .from(schema.user)
    .where(eq(schema.user.id, quien.userId))
    .limit(1);
  const [fila] = await db
    .insert(schema.conversationNote)
    .values({
      id: newId("conversationNote"),
      organizationId: quien.organizationId,
      ...valores,
      authorUserId: quien.userId,
      texto,
    })
    .returning();
  let oportunidadNombre: string | null = null;
  if (valores.oportunidadId) {
    const [op] = await db
      .select({ nombre: schema.oportunidad.nombre })
      .from(schema.oportunidad)
      .where(eq(schema.oportunidad.id, valores.oportunidadId))
      .limit(1);
    oportunidadNombre = op?.nombre ?? null;
  }
  const dto = aDto(fila!, autor?.name ?? null, oportunidadNombre, quien);
  await avisar(quien.organizationId, valores.contactId, "note.new", dto);
  return dto;
}

/** Desde el chat: queda en la oportunidad abierta (la de interacción más reciente). */
export async function crearNota(
  quien: Quien,
  conversationId: string,
  texto: string
): Promise<NotaDto> {
  const contactId = await contactoDeLaConversacion(quien.organizationId, conversationId);
  const abierta = await oportunidadAbierta(quien.organizationId, contactId);
  return insertar(quien, { conversationId, contactId, oportunidadId: abierta?.id ?? null }, texto);
}

/** Desde la oportunidad. */
export async function crearNotaDeOportunidad(
  quien: Quien,
  oportunidadId: string,
  texto: string
): Promise<NotaDto> {
  const op = await oportunidadDeLaOrganizacion(quien.organizationId, oportunidadId);
  return insertar(quien, { conversationId: null, contactId: op.contactId, oportunidadId }, texto);
}

async function borrar(quien: Quien, fila: FilaNota | undefined): Promise<void> {
  if (!fila) throw new NotaError(404, "not_found", "Nota no encontrada");
  if (!puedeBorrarNota(fila.authorUserId, quien.userId, quien.configura)) {
    throw new NotaError(403, "forbidden", "Solo quien la escribió o quien administra puede borrarla");
  }
  await getDb()
    .delete(schema.conversationNote)
    .where(scoped(schema.conversationNote.organizationId, quien.organizationId, eq(schema.conversationNote.id, fila.id)));
  await avisar(quien.organizationId, fila.contactId, "note.deleted", { id: fila.id });
}

/** Desde el chat: cualquier nota del contacto de esa conversación. */
export async function borrarNota(quien: Quien, conversationId: string, noteId: string): Promise<void> {
  const contactId = await contactoDeLaConversacion(quien.organizationId, conversationId);
  const [fila] = await getDb()
    .select()
    .from(schema.conversationNote)
    .where(
      scoped(
        schema.conversationNote.organizationId,
        quien.organizationId,
        eq(schema.conversationNote.id, noteId),
        or(
          eq(schema.conversationNote.contactId, contactId),
          eq(schema.conversationNote.conversationId, conversationId)
        )
      )
    )
    .limit(1);
  await borrar(quien, fila);
}

/** Desde la oportunidad: solo las suyas. */
export async function borrarNotaDeOportunidad(quien: Quien, oportunidadId: string, noteId: string): Promise<void> {
  await oportunidadDeLaOrganizacion(quien.organizationId, oportunidadId);
  const [fila] = await getDb()
    .select()
    .from(schema.conversationNote)
    .where(
      scoped(
        schema.conversationNote.organizationId,
        quien.organizationId,
        eq(schema.conversationNote.id, noteId),
        eq(schema.conversationNote.oportunidadId, oportunidadId)
      )
    )
    .limit(1);
  await borrar(quien, fila);
}
