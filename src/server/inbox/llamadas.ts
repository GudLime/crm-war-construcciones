import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { normalizeMx } from "@/lib/meta/client";
import { publish } from "@/server/events/bus";
import { getCredentialsByPhoneNumberId } from "@/server/whatsapp/credentials";
import { getOrCreateContactByIdentity } from "@/server/inbox/identity";
import { getOrCreateConversation, serializeMessage } from "@/server/inbox/ingest";

/**
 * v4 — Las llamadas de WhatsApp (webhook `calls`). Lo que se quiere es que en
 * la conversación quede la llamada: hecha o recibida, si atendieron y cuánto
 * duró. No toca la ventana de 24 h ni despierta al agente.
 *
 * El formato que manda Meta en `calls` es de la API de llamadas; con la app
 * del teléfono (coexistencia) puede que no llegue nada. El parser es
 * tolerante y CADA aviso queda en el log (sin números) para saber qué llegó.
 */

type AvisoLlamada = {
  id?: string;
  from?: string;
  to?: string;
  event?: string;
  direction?: string;
  status?: string | string[];
  timestamp?: string | number;
  start_time?: string | number;
  end_time?: string | number;
  duration?: number | string;
};

export type ValorLlamadas = {
  metadata?: { phone_number_id?: string };
  calls?: AvisoLlamada[];
};

function aFecha(t: string | number | undefined): Date | null {
  if (t == null || t === "") return null;
  const n = Number(t);
  if (Number.isFinite(n)) return new Date(n < 1e12 ? n * 1000 : n);
  const d = new Date(String(t));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** «3 min», «45 s». */
function textoDuracion(seg: number): string {
  if (seg < 60) return `${Math.round(seg)} s`;
  const m = Math.round(seg / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

/** Lo que se muestra en el chat. Exportado para las pruebas. */
export function resumenDeLlamada(c: AvisoLlamada): { entrante: boolean; texto: string } {
  const entrante = String(c.direction ?? "").toUpperCase().startsWith("USER");
  const status = (Array.isArray(c.status) ? c.status.join(" ") : String(c.status ?? "")).toUpperCase();
  const inicio = aFecha(c.start_time);
  const fin = aFecha(c.end_time);
  const seg = Number(c.duration) || (inicio && fin ? (fin.getTime() - inicio.getTime()) / 1000 : 0);
  const atendida = seg > 0 || /COMPLETED|ACCEPTED|ANSWERED/.test(status);
  const resultado = atendida ? `Atendida${seg > 0 ? ` · ${textoDuracion(seg)}` : ""}` : "Sin respuesta";
  return { entrante, texto: `Llamada ${entrante ? "recibida" : "hecha"} · ${resultado}` };
}

export async function processCallsValue(value: ValorLlamadas): Promise<void> {
  const avisos = value.calls ?? [];
  for (const c of avisos) {
    console.log(
      `[llamadas] aviso: event=${c.event ?? "-"} status=${JSON.stringify(c.status ?? null)} direction=${c.direction ?? "-"} duration=${c.duration ?? "-"}`
    );
  }
  const phoneNumberId = value.metadata?.phone_number_id;
  if (!phoneNumberId || avisos.length === 0) return;
  const credentials = await getCredentialsByPhoneNumberId(phoneNumberId);
  if (!credentials) return;
  for (const c of avisos) {
    try {
      // Solo el aviso final (o uno sin evento) deja la llamada en el chat.
      const evento = String(c.event ?? "").toLowerCase();
      if (evento && evento !== "terminate") continue;
      if (!c.id) continue;
      await registrarLlamada(credentials.organizationId, c);
    } catch (err) {
      console.error("[llamadas] no se pudo registrar la llamada:", err instanceof Error ? err.message : err);
    }
  }
}

async function registrarLlamada(organizationId: string, c: AvisoLlamada): Promise<void> {
  const { entrante, texto } = resumenDeLlamada(c);
  const numero = entrante ? c.from : c.to;
  if (!numero) return;
  const identity = normalizeMx(numero);
  const { contact } = await getOrCreateContactByIdentity(organizationId, {
    identity,
    phone: identity,
    waUserId: null,
    profileName: null,
  });
  const conversation = await getOrCreateConversation(organizationId, contact.id);
  const at = aFecha(c.end_time) ?? aFecha(c.timestamp) ?? new Date();
  const db = getDb();
  const [msg] = await db
    .insert(schema.message)
    .values({
      id: newId("message"),
      organizationId,
      conversationId: conversation.id,
      waMessageId: `call:${c.id}`,
      direction: entrante ? "in" : "out",
      type: "call",
      text: texto,
      status: "delivered",
      origin: "manual",
      waTimestamp: at,
    })
    .onConflictDoNothing({ target: [schema.message.waMessageId] })
    .returning();
  if (!msg) return;
  await db
    .update(schema.conversation)
    .set({ lastMessageAt: at, updatedAt: new Date() })
    .where(eq(schema.conversation.id, conversation.id));
  publish(organizationId, {
    type: "message.new",
    data: { conversationId: conversation.id, message: serializeMessage(msg, null, null) },
  });
  publish(organizationId, { type: "conversation.updated", data: { conversation: { id: conversation.id } } });
}
