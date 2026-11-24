import { and, eq, isNotNull, lte } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { SendError, sendText } from "@/server/inbox/send";
import { replyWindow } from "@/server/inbox/window";

/**
 * v3 — Un WhatsApp de una tarea sale por la conversación del contacto, con
 * las mismas reglas que una respuesta de la Bandeja: la ventana de 24 h, la
 * caja de arena del Laboratorio (una conversación de prueba jamás llama a la
 * API) y el token que nunca sale del CRM. Si no puede salir, la tarea vuelve a
 * «Pendiente» con el aviso de por qué: nada se pierde en silencio.
 */

export type ResultadoEnvio = { enviado: true } | { enviado: false; aviso: string };

const AVISO_VENTANA = "La ventana de 24 h está cerrada: mandale una plantilla desde la Bandeja";

async function conversacionDe(organizationId: string, contactId: string | null, conversationId: string | null) {
  const c = schema.conversation;
  const [conv] = await getDb()
    .select({ id: c.id, channel: c.channel, lastInboundAt: c.lastInboundAt, isTest: c.isTest })
    .from(c)
    .where(
      conversationId
        ? scoped(c.organizationId, organizationId, eq(c.id, conversationId))
        : scoped(c.organizationId, organizationId, eq(c.contactId, contactId ?? ""), eq(c.isTest, false))
    )
    .limit(1);
  return conv ?? null;
}

async function contactoDeTarea(t: { contactId: string | null; oportunidadId: string | null }): Promise<string | null> {
  if (t.contactId) return t.contactId;
  if (!t.oportunidadId) return null;
  const [op] = await getDb()
    .select({ contactId: schema.oportunidad.contactId })
    .from(schema.oportunidad)
    .where(eq(schema.oportunidad.id, t.oportunidadId))
    .limit(1);
  return op?.contactId ?? null;
}

async function dejarAviso(organizationId: string, id: string, aviso: string): Promise<ResultadoEnvio> {
  await getDb()
    .update(schema.tareaVenta)
    .set({ estado: "realizar", aviso, updatedAt: new Date() })
    .where(scoped(schema.tareaVenta.organizationId, organizationId, eq(schema.tareaVenta.id, id)));
  return { enviado: false, aviso };
}

/** Manda el WhatsApp de la tarea ahora. */
export async function enviarTarea(organizationId: string, id: string, now: Date = new Date()): Promise<ResultadoEnvio> {
  const t = schema.tareaVenta;
  const [tarea] = await getDb()
    .select()
    .from(t)
    .where(scoped(t.organizationId, organizationId, eq(t.id, id)))
    .limit(1);
  if (!tarea) return { enviado: false, aviso: "Esa tarea no existe" };
  if (tarea.tipo !== "mensaje") return { enviado: false, aviso: "Solo un WhatsApp se manda desde la tarea" };
  const texto = tarea.mensaje?.trim();
  if (!texto) return dejarAviso(organizationId, id, "Escribí el mensaje antes de mandarlo");
  const contactId = await contactoDeTarea(tarea);
  const conv = await conversacionDe(organizationId, contactId, tarea.conversationId);
  if (!conv) return dejarAviso(organizationId, id, "El contacto todavía no tiene una conversación de WhatsApp");
  if (!replyWindow(conv.channel, conv.lastInboundAt, now).operatorOpen) return dejarAviso(organizationId, id, AVISO_VENTANA);
  try {
    await sendText({ conversationId: conv.id, organizationId, text: texto });
  } catch (err) {
    const aviso =
      err instanceof SendError
        ? err.code === "window_closed"
          ? AVISO_VENTANA
          : err.code === "sandbox_violation"
            ? "Es una conversación de prueba: no se manda nada"
            : err.message
        : "No se pudo mandar el mensaje";
    return dejarAviso(organizationId, id, aviso);
  }
  await getDb()
    .update(t)
    .set({ estado: "listo", enviadaAt: now, aviso: null, conversationId: conv.id, updatedAt: now })
    .where(scoped(t.organizationId, organizationId, eq(t.id, id)));
  return { enviado: true };
}

/**
 * Los WhatsApp programados cuya hora llegó. Los mails programados no salen
 * todavía (el correo no está conectado): quedan con el aviso.
 */
export async function enviarProgramadas(now: Date = new Date()): Promise<number> {
  const t = schema.tareaVenta;
  const vencidas = await getDb()
    .select({ id: t.id, organizationId: t.organizationId, tipo: t.tipo })
    .from(t)
    .where(and(eq(t.estado, "programado"), isNotNull(t.fecha), lte(t.fecha, now)))
    .limit(50);
  let enviadas = 0;
  for (const v of vencidas) {
    if (v.tipo === "mensaje") {
      const r = await enviarTarea(v.organizationId, v.id, now).catch(() => null);
      if (r?.enviado) enviadas++;
    } else {
      await dejarAviso(v.organizationId, v.id, "El envío de mails todavía no está conectado: mandalo desde tu correo");
    }
  }
  return enviadas;
}

const CADA_MS = 60_000;

type Estado = { timer?: ReturnType<typeof setInterval>; corriendo: boolean };
const g = globalThis as unknown as { __tareasProgramadas?: Estado };

/** El barrido de las programadas, cada minuto, dentro del proceso. */
export function iniciarTareasProgramadas(): void {
  const e = (g.__tareasProgramadas ??= { corriendo: false });
  if (e.timer) return;
  const pasada = async () => {
    if (e.corriendo) return;
    e.corriendo = true;
    try {
      const n = await enviarProgramadas();
      if (n > 0) console.log(`[tareas] ${n} WhatsApp programado(s) enviado(s)`);
    } catch (err) {
      console.error("[tareas] el envío de programadas falló:", err instanceof Error ? err.message : err);
    } finally {
      e.corriendo = false;
    }
  };
  e.timer = setInterval(() => void pasada(), CADA_MS);
  e.timer.unref?.();
}
