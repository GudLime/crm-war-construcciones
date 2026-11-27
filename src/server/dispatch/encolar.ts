import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { ESTADOS_ABIERTOS, iaAtiende } from "@/lib/ventas";
import { programarLector } from "@/server/lector";
import { esDeLaEmpresa } from "@/server/de-la-empresa";
import { encolarDespacho } from "@/server/dispatch/outbox";
import { iniciarWorker, programarTanda } from "@/server/dispatch/worker";

/**
 * 021 — El enganche de la ingesta: un mensaje entrante real ya está en la
 * bandeja y hay un cerebro configurado, así que su turno se ENCOLA.
 *
 * 036 — Desde que el CRM no trae agente, este es el único camino por el que
 * alguien contesta, y el interruptor de la pantalla Agente
 * (`agent_profile.enabled`) decide si se toma: apagado, la conversación
 * queda en la bandeja para una persona.
 *
 * Nunca lanza. Corre al final de la ingesta, dentro del `after()` del webhook:
 * una excepción aquí no puede costarle a ese payload los mensajes que vengan
 * detrás. Lo que no se encoló sigue en la bandeja.
 */
export async function despacharAlCerebro(
  conversationId: string,
  organizationId: string,
  messageId: string
): Promise<void> {
  try {
    const [conv] = await getDb()
      .select({
        aiEnabled: schema.conversation.aiEnabled,
        handoffAt: schema.conversation.handoffAt,
        isTest: schema.conversation.isTest,
        contactId: schema.conversation.contactId,
      })
      .from(schema.conversation)
      .where(
        and(
          eq(schema.conversation.id, conversationId),
          eq(schema.conversation.organizationId, organizationId)
        )
      )
      .limit(1);
    if (!conv) return;

    // Pausada por una persona o traspasada por el agente: no se despacha. Es
    // la misma bandera que respeta `/api/bot/messages`, y aquí la respeta
    // cualquier cerebro sin tener que acordarse. El Laboratorio no pasa por la
    // ingesta, pero una conversación de prueba no sale del CRM por ningún
    // camino.
    if (conv.isTest) return;
    // v7 — Un contacto de la empresa: no contesta la IA ni lo lee el lector.
    if (await esDeLaEmpresa(organizationId, conv.contactId)) return;
    // v7 — El lector lee cada ráfaga, conteste quien conteste: arma y avanza
    // la oportunidad (el agente no avanza la etapa).
    programarLector(organizationId, conversationId);
    // v4 — Cuando no lee el agente, lee el lector: arma la oportunidad sin
    // contestar nada.
    if (!conv.aiEnabled || conv.handoffAt) return;

    const [perfil] = await getDb()
      .select({ enabled: schema.agentProfile.enabled })
      .from(schema.agentProfile)
      .where(eq(schema.agentProfile.organizationId, organizationId))
      .limit(1);
    if (!perfil?.enabled) return;

    // v4 — Quién atiende la IA, según la oportunidad: con una abierta, solo si
    // es de Venta; sin oportunidad, si no es Proveedor, Propio ni Inmobiliaria.
    // Alquiler e Inmobiliaria los atiende una persona. Cuando clasifica la
    // propia IA, el turno en curso termina y el corte llega en el siguiente.
    const [contacto] = await getDb()
      .select({ tiposContacto: schema.contact.tiposContacto })
      .from(schema.contact)
      .where(
        and(
          eq(schema.contact.organizationId, organizationId),
          eq(schema.contact.id, conv.contactId)
        )
      )
      .limit(1);
    const [abierta] = await getDb()
      .select({ tipo: schema.oportunidad.tipo })
      .from(schema.oportunidad)
      .where(
        and(
          eq(schema.oportunidad.organizationId, organizationId),
          eq(schema.oportunidad.contactId, conv.contactId),
          inArray(schema.oportunidad.estado, [...ESTADOS_ABIERTOS])
        )
      )
      .limit(1);
    if (!iaAtiende({ tipos: contacto?.tiposContacto ?? [], oportunidadAbierta: abierta ?? null })) return;

    // 025 — El despacho anota qué entrante lo provoca: es lo que le debe al
    // cerebro, aunque después la conversación tenga una respuesta.
    const { notBefore } = await encolarDespacho({
      organizationId,
      conversationId,
      messageIds: [messageId],
    });
    iniciarWorker();
    // Que despierte justo cuando la ventana venza, no en su siguiente barrido.
    programarTanda(notBefore);
  } catch (err) {
    console.error("[despacho] no se pudo encolar el turno:", err);
  }
}
