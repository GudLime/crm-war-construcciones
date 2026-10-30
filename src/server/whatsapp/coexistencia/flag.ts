/**
 * 067 — Si esta instancia ofrece conectar el número en coexistencia (el
 * número sigue activo en la app WhatsApp Business del teléfono).
 *
 * Mismo trato que los módulos opcionales (ADR-001): el código viaja siempre
 * en `main` y una variable de despliegue decide si existe. Apagada, la
 * tarjeta «Conectar con Meta» no ofrece la opción y un evento de coexistencia
 * se rechaza como antes de esta spec.
 *
 * Encenderla solo tiene sentido si la app de Meta de la instancia es de un
 * Tech Provider (o Solution Partner) con Embedded Signup configurado: Meta no
 * ofrece la coexistencia a otras apps. Requiere además META_APP_ID,
 * META_EMBEDDED_CONFIG_ID y META_APP_SECRET (066).
 *
 * Los webhooks de coexistencia (`history`, `smb_app_state_sync`,
 * `account_update`) se procesan con o sin la bandera: solo llegan si un
 * número ya está en coexistencia, y descartarlos perdería datos del negocio.
 */

const ON_VALUES = new Set(["on", "1", "true", "si", "sí", "yes"]);

export function parseCoexistenciaFlag(raw: string | undefined): boolean {
  return ON_VALUES.has((raw ?? "").trim().toLowerCase());
}

/** Se lee de `process.env` directo, como `agendaEnabled()` y `atribucionEnabled()`. */
export function coexistenciaEnabled(): boolean {
  return parseCoexistenciaFlag(process.env.META_COEXISTENCIA);
}
