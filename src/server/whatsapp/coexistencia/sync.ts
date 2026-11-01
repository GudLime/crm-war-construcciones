import { graphRequest } from "@/lib/meta/client";

/**
 * 067 — Pedirle a Meta que mande los contactos y el historial de la app
 * WhatsApp Business del teléfono.
 *
 *   POST /{phone_number_id}/smb_app_data
 *   { messaging_product: "whatsapp", sync_type: "smb_app_state_sync" | "history" }
 *
 * Reglas de Meta que explican cómo está hecho:
 *
 * - Hay que pedirlo en las 24 h siguientes al alta y **una sola vez** por
 *   tipo: pasado ese plazo, o para repetirlo, el negocio tiene que
 *   desconectar el número y volver a conectarlo. Por eso se pide en el mismo
 *   alta, sin esperar a que nadie apriete nada.
 * - Primero los contactos y después el historial (el orden de la guía).
 * - Los webhooks tienen que estar suscritos ANTES: quien llama ya registró el
 *   webhook de la instancia.
 *
 * Lo que llega después entra por los webhooks `smb_app_state_sync` e
 * `history` (`./ingest.ts`). Un fallo aquí no tumba el alta: el número ya
 * quedó conectado y recibe mensajes; solo falta lo viejo, y se avisa.
 */

export type PedidoDeSincronizacion = {
  contactsRequestId: string | null;
  historyRequestId: string | null;
};

async function pedir(
  token: string,
  phoneNumberId: string,
  syncType: "smb_app_state_sync" | "history"
): Promise<string | null> {
  try {
    const res = await graphRequest<{ request_id?: unknown }>(`${phoneNumberId}/smb_app_data`, {
      token,
      method: "POST",
      body: { messaging_product: "whatsapp", sync_type: syncType },
    });
    return typeof res.request_id === "string" && res.request_id ? res.request_id : null;
  } catch {
    // Nunca el error crudo: puede traer el token en la URL o en el cuerpo.
    console.warn(`[coexistencia] Meta no aceptó la sincronización ${syncType}`);
    return null;
  }
}

export async function pedirSincronizacion(
  token: string,
  phoneNumberId: string
): Promise<PedidoDeSincronizacion> {
  const contactsRequestId = await pedir(token, phoneNumberId, "smb_app_state_sync");
  const historyRequestId = await pedir(token, phoneNumberId, "history");
  return { contactsRequestId, historyRequestId };
}
