import { asc, count, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import {
  ATAJO_RE,
  normalizarAtajo,
  TEXTO_MAX,
  TOPE_ADJUNTOS,
  TOPE_RESPUESTAS,
  type AdjuntoRespuesta,
  type RespuestaRapida,
} from "@/lib/respuestas-rapidas";
import { borrarMedia, guardarMedia, leerMedia } from "@/lib/storage/medios";
import { MediaValidationError, validateOutgoing } from "@/server/whatsapp/media";
import { sendMediaMessage } from "@/server/inbox/send";

/**
 * 049 — Respuestas rápidas de la organización. Las rutas solo validan sesión
 * y permiso; aquí vive lo demás, para probarlo.
 */

export class QuickReplyError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

/** El atajo llega como lo escribió la persona y se guarda normalizado. */
export const respuestaSchema = z.object({
  atajo: z
    .string()
    .transform(normalizarAtajo)
    .refine((a) => ATAJO_RE.test(a), {
      message: "el atajo lleva de 1 a 32 letras, números, - o _",
    }),
  texto: z.string().trim().min(1, "el texto no puede ir vacío").max(TEXTO_MAX),
  /** 0073 — v7: el agente la puede mandar. */
  paraAgente: z.boolean().optional(),
});

function aDto(fila: typeof schema.quickReply.$inferSelect): RespuestaRapida {
  return { id: fila.id, atajo: fila.atajo, texto: fila.texto, adjuntos: fila.adjuntos ?? [], paraAgente: fila.paraAgente };
}

async function filaDe(organizationId: string, id: string) {
  const [fila] = await getDb()
    .select()
    .from(schema.quickReply)
    .where(scoped(schema.quickReply.organizationId, organizationId, eq(schema.quickReply.id, id)))
    .limit(1);
  if (!fila) throw new QuickReplyError(404, "not_found", "Respuesta no encontrada");
  return fila;
}

/**
 * 0067 — Sumar una foto o un video a la respuesta. Con los límites de
 * WhatsApp (imagen 5 MB, video 16 MB): el CRM no achica nada.
 */
export async function agregarAdjunto(
  organizationId: string,
  id: string,
  archivo: { data: Buffer; mime: string; nombre: string }
): Promise<RespuestaRapida> {
  const fila = await filaDe(organizationId, id);
  const adjuntos = fila.adjuntos ?? [];
  if (adjuntos.length >= TOPE_ADJUNTOS) {
    throw new QuickReplyError(409, "tope", `Caben hasta ${TOPE_ADJUNTOS} archivos por respuesta`);
  }
  const mime = archivo.mime.split(";")[0]!.trim();
  if (!/^(image\/(jpeg|png|webp)|video\/(mp4|3gpp))$/.test(mime)) {
    throw new QuickReplyError(415, "unsupported_type", "Solo fotos (jpg, png, webp) y videos (mp4, 3gp)");
  }
  try {
    validateOutgoing(mime, archivo.data.length);
  } catch (err) {
    if (err instanceof MediaValidationError) throw new QuickReplyError(err.code === "too_large" ? 413 : 415, err.code, err.message);
    throw err;
  }
  const adjunto: AdjuntoRespuesta = {
    id: newId("quickReplyAdjunto"),
    nombre: archivo.nombre.slice(0, 120) || "archivo",
    mime,
    bytes: archivo.data.length,
  };
  await guardarMedia(organizationId, adjunto.id, archivo.data, mime);
  const [actualizada] = await getDb()
    .update(schema.quickReply)
    .set({ adjuntos: [...adjuntos, adjunto], updatedAt: new Date() })
    .where(eq(schema.quickReply.id, fila.id))
    .returning();
  return aDto(actualizada!);
}

export async function quitarAdjunto(organizationId: string, id: string, adjuntoId: string): Promise<RespuestaRapida> {
  const fila = await filaDe(organizationId, id);
  const adjuntos = fila.adjuntos ?? [];
  if (!adjuntos.some((a) => a.id === adjuntoId)) throw new QuickReplyError(404, "not_found", "Ese archivo no está");
  const [actualizada] = await getDb()
    .update(schema.quickReply)
    .set({ adjuntos: adjuntos.filter((a) => a.id !== adjuntoId), updatedAt: new Date() })
    .where(eq(schema.quickReply.id, fila.id))
    .returning();
  await borrarMedia(organizationId, adjuntoId).catch(() => undefined);
  return aDto(actualizada!);
}

/** El archivo, para mandarlo desde el compositor o verlo en Ajustes. */
export async function leerAdjunto(
  organizationId: string,
  id: string,
  adjuntoId: string
): Promise<{ data: Buffer; adjunto: AdjuntoRespuesta }> {
  const fila = await filaDe(organizationId, id);
  const adjunto = (fila.adjuntos ?? []).find((a) => a.id === adjuntoId);
  if (!adjunto) throw new QuickReplyError(404, "not_found", "Ese archivo no está");
  return { data: await leerMedia(organizationId, adjuntoId), adjunto };
}

function esDuplicado(err: unknown): boolean {
  const code =
    (err as { code?: string })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
  return code === "23505";
}

const duplicado = (atajo: string) =>
  new QuickReplyError(409, "duplicado", `Ya hay una respuesta con el atajo /${atajo}`);

export async function listarRespuestas(organizationId: string): Promise<RespuestaRapida[]> {
  const filas = await getDb()
    .select()
    .from(schema.quickReply)
    .where(scoped(schema.quickReply.organizationId, organizationId))
    .orderBy(asc(schema.quickReply.atajo));
  return filas.map(aDto);
}

export async function crearRespuesta(
  organizationId: string,
  datos: z.infer<typeof respuestaSchema>
): Promise<RespuestaRapida> {
  const db = getDb();
  const [{ n } = { n: 0 }] = await db
    .select({ n: count() })
    .from(schema.quickReply)
    .where(scoped(schema.quickReply.organizationId, organizationId));
  if (Number(n) >= TOPE_RESPUESTAS) {
    throw new QuickReplyError(409, "tope", `Caben hasta ${TOPE_RESPUESTAS} respuestas rápidas`);
  }
  try {
    const [fila] = await db
      .insert(schema.quickReply)
      .values({ id: newId("quickReply"), organizationId, ...datos })
      .returning();
    return aDto(fila!);
  } catch (err) {
    if (esDuplicado(err)) throw duplicado(datos.atajo);
    throw err;
  }
}

export async function editarRespuesta(
  organizationId: string,
  id: string,
  datos: z.infer<typeof respuestaSchema>
): Promise<RespuestaRapida> {
  try {
    const [fila] = await getDb()
      .update(schema.quickReply)
      .set({ ...datos, updatedAt: new Date() })
      .where(scoped(schema.quickReply.organizationId, organizationId, eq(schema.quickReply.id, id)))
      .returning();
    if (!fila) throw new QuickReplyError(404, "not_found", "Respuesta no encontrada");
    return aDto(fila);
  } catch (err) {
    if (esDuplicado(err)) throw duplicado(datos.atajo);
    throw err;
  }
}

export async function borrarRespuesta(organizationId: string, id: string): Promise<void> {
  const filas = await getDb()
    .delete(schema.quickReply)
    .where(scoped(schema.quickReply.organizationId, organizationId, eq(schema.quickReply.id, id)))
    .returning({ id: schema.quickReply.id, adjuntos: schema.quickReply.adjuntos });
  if (!filas[0]) throw new QuickReplyError(404, "not_found", "Respuesta no encontrada");
  for (const a of filas[0].adjuntos ?? []) await borrarMedia(organizationId, a.id).catch(() => undefined);
}

/** Las cuatro de la demo (D6). Idempotente: no pisa ni duplica. */
export const RESPUESTAS_DEMO: { atajo: string; texto: string }[] = [
  { atajo: "hola", texto: "¡Hola {nombre}! Gracias por escribir. ¿En qué te ayudo?" },
  { atajo: "horario", texto: "Abrimos de lunes a sábado de 8:00 a 19:00, y domingo de 9:00 a 14:00." },
  { atajo: "envio", texto: "Hacemos envíos en la ciudad el mismo día si pides antes de las 14:00. Fuera de la ciudad, de 2 a 4 días." },
  { atajo: "pago", texto: "Aceptamos transferencia, tarjeta y efectivo en tienda. Te paso los datos de la cuenta si quieres pagar por transferencia." },
];

/** v7 — Las plantillas que el agente puede mandar (las marcadas con el toggle). */
export async function plantillasDelAgente(organizationId: string): Promise<RespuestaRapida[]> {
  const filas = await getDb()
    .select()
    .from(schema.quickReply)
    .where(scoped(schema.quickReply.organizationId, organizationId, eq(schema.quickReply.paraAgente, true)))
    .orderBy(asc(schema.quickReply.atajo));
  return filas.map(aDto);
}

/**
 * v7 — Manda, en orden, las fotos y videos de una plantilla que usó el
 * agente. Corta ante un error que haría fallar al resto (ventana cerrada,
 * IA en pausa, sandbox).
 */
export async function enviarAdjuntosDePlantilla(
  organizationId: string,
  conversationId: string,
  plantilla: RespuestaRapida
): Promise<void> {
  for (const a of plantilla.adjuntos ?? []) {
    const data = await leerMedia(organizationId, a.id).catch(() => null);
    if (!data) continue;
    try {
      await sendMediaMessage({
        conversationId,
        organizationId,
        file: { data, mimeType: a.mime, fileName: a.nombre },
        aiGenerated: true,
      });
    } catch (err) {
      const code = (err as { code?: string }).code;
      console.error(`[plantillas] no se pudo mandar ${a.nombre}:`, code ?? err);
      if (code === "window_closed" || code === "ai_paused" || code === "sandbox_violation" || code === "reconnect_required") return;
    }
  }
}
