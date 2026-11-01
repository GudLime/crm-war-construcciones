import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { normalizeMx } from "@/lib/meta/client";
import { publish } from "@/server/events/bus";
import { getOrCreateContactByIdentity } from "@/server/inbox/identity";
import { getOrCreateConversation } from "@/server/inbox/ingest";
import {
  actualizarAvanceDelHistorial,
  getCredentialsByPhoneNumberId,
  getCredentialsByWabaId,
  markReconnectRequired,
} from "@/server/whatsapp/credentials";

/**
 * 067 — Los webhooks de la coexistencia.
 *
 * - `smb_app_state_sync`: los contactos de la app del teléfono. Un `add`
 *   crea el contacto (o le pone nombre si no lo tenía); un `remove` NO borra
 *   nada en el CRM: el contacto, sus conversaciones y sus leads son del
 *   negocio, no de la libreta del teléfono.
 * - `history`: hasta 180 días de chats previos al alta, en fases y chunks.
 *   Entran como historia: sin despachar al cerebro, sin sumar no leídos, sin
 *   tocar la ventana de 24 h (`lastInboundAt`) y sin pausar la IA. Idempotente
 *   por `wa_message_id` (constitución IV): un chunk repetido no duplica.
 * - `account_update`: `PARTNER_REMOVED` / `ACCOUNT_OFFBOARDED` dejan la
 *   conexión en «hay que reconectar».
 *
 * `smb_message_echoes` (lo que el dueño contesta desde el teléfono) ya lo
 * procesaba la ingesta desde la 008 (`processEchoesValue`).
 *
 * Todo se valida con Zod y un elemento malformado se descarta con aviso: un
 * payload raro jamás tumba el webhook ni pierde el resto del lote.
 */

const TIPOS_DE_HISTORIA = new Set([
  "text",
  "image",
  "audio",
  "video",
  "document",
  "sticker",
  "location",
  "contacts",
]);

/** Código de Meta cuando el negocio no autorizó compartir el historial. */
export const HISTORIAL_RECHAZADO = 2593109;

const metadataSchema = z.looseObject({
  phone_number_id: z.string().optional(),
  display_phone_number: z.string().optional(),
});

// ---------------------------------------------------------------------------
// smb_app_state_sync — contactos
// ---------------------------------------------------------------------------

const stateSyncSchema = z.looseObject({
  metadata: metadataSchema.optional(),
  state_sync: z
    .array(
      z.looseObject({
        type: z.string().optional(),
        action: z.string().optional(),
        contact: z
          .looseObject({
            full_name: z.string().optional(),
            first_name: z.string().optional(),
            phone_number: z.string().optional(),
          })
          .optional(),
      })
    )
    .optional(),
});

export type ContactoSincronizado = { phone: string; name: string | null };

/** Lo que se puede usar de un `smb_app_state_sync` (puro, para las pruebas). */
export function contactosDelEstado(raw: unknown): ContactoSincronizado[] {
  const parsed = stateSyncSchema.safeParse(raw);
  if (!parsed.success) return [];
  const out: ContactoSincronizado[] = [];
  for (const item of parsed.data.state_sync ?? []) {
    if (item.type !== "contact" || item.action !== "add") continue;
    const digits = (item.contact?.phone_number ?? "").replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) continue;
    const name = item.contact?.full_name?.trim() || item.contact?.first_name?.trim() || null;
    out.push({ phone: normalizeMx(digits), name });
  }
  return out;
}

export async function processStateSyncValue(raw: unknown): Promise<void> {
  const phoneNumberId = metadataSchema.safeParse(
    (raw as { metadata?: unknown } | null)?.metadata
  ).data?.phone_number_id;
  if (!phoneNumberId) return;
  const credentials = await getCredentialsByPhoneNumberId(phoneNumberId);
  if (!credentials) {
    console.warn(`[coexistencia] contactos para phone_number_id desconocido (${phoneNumberId}): descartados`);
    return;
  }
  for (const c of contactosDelEstado(raw)) {
    try {
      // El nombre llega como nombre de perfil: si una persona ya renombró al
      // contacto en el CRM, `getOrCreateContactByIdentity` lo respeta (#51).
      await getOrCreateContactByIdentity(credentials.organizationId, {
        identity: c.phone,
        phone: c.phone,
        waUserId: null,
        profileName: c.name,
      });
    } catch (err) {
      console.error("[coexistencia] no se pudo guardar un contacto sincronizado:", err);
    }
  }
}

// ---------------------------------------------------------------------------
// history — chats previos
// ---------------------------------------------------------------------------

const mensajeDeHistoriaSchema = z.looseObject({
  from: z.string().optional(),
  to: z.string().optional(),
  id: z.string().min(1),
  timestamp: z.string().optional(),
  type: z.string(),
  text: z.looseObject({ body: z.string().optional() }).optional(),
  image: z.looseObject({ caption: z.string().optional() }).optional(),
  video: z.looseObject({ caption: z.string().optional() }).optional(),
  document: z
    .looseObject({ caption: z.string().optional(), filename: z.string().optional() })
    .optional(),
  history_context: z.looseObject({ status: z.string().optional() }).optional(),
});

const historySchema = z.looseObject({
  metadata: metadataSchema.optional(),
  history: z
    .array(
      z.looseObject({
        metadata: z
          .looseObject({
            phase: z.coerce.number().optional(),
            chunk_order: z.coerce.number().optional(),
            progress: z.coerce.number().optional(),
          })
          .optional(),
        threads: z
          .array(
            z.looseObject({
              id: z.string().optional(),
              messages: z.array(z.unknown()).optional(),
            })
          )
          .optional(),
        errors: z.array(z.looseObject({ code: z.coerce.number().optional() })).optional(),
      })
    )
    .optional(),
});

type EstadoDeMensaje = "pending" | "sent" | "delivered" | "read" | "failed";

export type MensajeDeHistoria = {
  waMessageId: string;
  /** El cliente: teléfono normalizado del hilo. */
  identity: string;
  direction: "in" | "out";
  type: string;
  text: string | null;
  status: EstadoDeMensaje;
  waTimestamp: Date;
};

export type LoteDeHistoria = {
  mensajes: MensajeDeHistoria[];
  /** El avance que dice Meta, o `declined`/`failed` si el lote trae errores. */
  avance: { status: "running" | "done" | "declined" | "failed"; progress: number | null } | null;
};

function estadoDe(raw: string | undefined, direction: "in" | "out"): EstadoDeMensaje {
  if (direction === "in") return "delivered";
  switch ((raw ?? "").toUpperCase()) {
    case "READ":
    case "PLAYED":
      return "read";
    case "DELIVERED":
      return "delivered";
    case "PENDING":
      return "pending";
    case "ERROR":
      return "failed";
    default:
      return "sent";
  }
}

function fechaDe(timestamp: string | undefined): Date | null {
  const n = Number(timestamp);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n * 1000);
}

/** Lo que se puede usar de un `history` (puro, para las pruebas). */
export function leerLoteDeHistoria(raw: unknown): LoteDeHistoria {
  const parsed = historySchema.safeParse(raw);
  if (!parsed.success) return { mensajes: [], avance: null };
  const mensajes: MensajeDeHistoria[] = [];
  let avance: LoteDeHistoria["avance"] = null;

  for (const bloque of parsed.data.history ?? []) {
    const errores = bloque.errors ?? [];
    if (errores.length > 0) {
      avance = {
        status: errores.some((e) => e.code === HISTORIAL_RECHAZADO) ? "declined" : "failed",
        progress: null,
      };
      continue;
    }
    const meta = bloque.metadata;
    if (meta && (meta.progress !== undefined || meta.phase !== undefined)) {
      const progress = meta.progress ?? null;
      const terminado = meta.phase === 2 && progress === 100;
      // Un `declined`/`failed` de otro bloque del mismo lote manda.
      if (!avance || avance.status === "running") {
        avance = { status: terminado ? "done" : "running", progress };
      }
    }

    for (const hilo of bloque.threads ?? []) {
      const digits = (hilo.id ?? "").replace(/\D/g, "");
      if (digits.length < 8 || digits.length > 15) continue; // grupos u otros: fuera
      const identity = normalizeMx(digits);
      for (const crudo of hilo.messages ?? []) {
        const m = mensajeDeHistoriaSchema.safeParse(crudo);
        if (!m.success) continue;
        const msg = m.data;
        // `media_placeholder`: Meta manda el contenido en otro webhook con el
        // mismo id; ese es el que se guarda.
        if (!TIPOS_DE_HISTORIA.has(msg.type)) continue;
        const waTimestamp = fechaDe(msg.timestamp);
        if (!waTimestamp) continue;
        // `to` solo viene en lo que mandó el negocio (la guía de Meta).
        const direction = msg.to ? "out" : "in";
        const text =
          msg.text?.body ??
          msg.image?.caption ??
          msg.video?.caption ??
          msg.document?.caption ??
          msg.document?.filename ??
          null;
        mensajes.push({
          waMessageId: msg.id,
          identity,
          direction,
          type: msg.type,
          text,
          status: estadoDe(msg.history_context?.status, direction),
          waTimestamp,
        });
      }
    }
  }
  return { mensajes, avance };
}

export async function processHistoryValue(raw: unknown): Promise<void> {
  const phoneNumberId = metadataSchema.safeParse(
    (raw as { metadata?: unknown } | null)?.metadata
  ).data?.phone_number_id;
  if (!phoneNumberId) return;
  const credentials = await getCredentialsByPhoneNumberId(phoneNumberId);
  if (!credentials) {
    console.warn(`[coexistencia] historial para phone_number_id desconocido (${phoneNumberId}): descartado`);
    return;
  }
  const { organizationId } = credentials;
  const lote = leerLoteDeHistoria(raw);
  const db = getDb();

  const conversaciones = new Map<string, string>(); // identity → conversation.id
  const tocadas = new Set<string>();

  for (const m of lote.mensajes) {
    try {
      let conversationId = conversaciones.get(m.identity);
      if (!conversationId) {
        const { contact } = await getOrCreateContactByIdentity(organizationId, {
          identity: m.identity,
          phone: m.identity,
          waUserId: null,
          profileName: null,
        });
        const conversation = await getOrCreateConversation(organizationId, contact.id);
        conversationId = conversation.id;
        conversaciones.set(m.identity, conversationId);
      }

      const inserted = await db
        .insert(schema.message)
        .values({
          id: newId("message"),
          organizationId,
          conversationId,
          waMessageId: m.waMessageId,
          direction: m.direction,
          type: m.type,
          text: m.text,
          status: m.status,
          // Lo que salió del negocio antes del alta lo escribió una persona
          // desde el teléfono: `manual`, como los echoes (008).
          ...(m.direction === "out" ? { origin: "manual" as const } : {}),
          waTimestamp: m.waTimestamp,
        })
        .onConflictDoNothing({ target: [schema.message.waMessageId] })
        .returning({ id: schema.message.id });
      if (!inserted[0]) continue; // ya estaba

      // Solo `lastMessageAt`, y sin retroceder: la historia NUNCA abre la
      // ventana de 24 h, no suma no leídos y no despacha al cerebro.
      await db
        .update(schema.conversation)
        .set({
          lastMessageAt: sql`greatest(coalesce(${schema.conversation.lastMessageAt}, ${m.waTimestamp}), ${m.waTimestamp})`,
          updatedAt: new Date(),
        })
        .where(eq(schema.conversation.id, conversationId));
      tocadas.add(conversationId);
    } catch (err) {
      console.error(`[coexistencia] no se pudo guardar el mensaje de historia ${m.waMessageId}:`, err);
    }
  }

  // Un aviso por conversación, no por mensaje: un chunk puede traer miles.
  for (const id of tocadas) {
    publish(organizationId, { type: "conversation.updated", data: { conversation: { id } } });
  }

  if (lote.avance) {
    await actualizarAvanceDelHistorial(organizationId, lote.avance);
  }
}

// ---------------------------------------------------------------------------
// account_update — desconexión desde la app
// ---------------------------------------------------------------------------

const accountUpdateSchema = z.looseObject({ event: z.string().optional() });

/** Los eventos que dicen que el número ya no está conectado a esta app. */
const DESCONEXIONES = new Set(["PARTNER_REMOVED", "ACCOUNT_OFFBOARDED"]);

export function esDesconexion(raw: unknown): boolean {
  const ev = accountUpdateSchema.safeParse(raw).data?.event;
  return Boolean(ev && DESCONEXIONES.has(ev));
}

export async function processAccountUpdate(
  entryId: string | null,
  raw: unknown
): Promise<void> {
  if (!entryId || !esDesconexion(raw)) return; // los demás eventos: ignorar
  const credentials = await getCredentialsByWabaId(entryId);
  if (!credentials) return;
  await markReconnectRequired(credentials.organizationId);
  console.warn(
    `[coexistencia] Meta avisó que el número se desconectó (${accountUpdateSchema.parse(raw).event}): conexión marcada para reconectar`
  );
}
