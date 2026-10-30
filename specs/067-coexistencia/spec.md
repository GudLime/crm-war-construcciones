# 067 — Coexistencia: el número sigue en la app WhatsApp Business

**Feature Branch**: `feat/067-coexistencia`

**Created**: 2026-10-30

**Status**: Implementada; typecheck, lint, pruebas unitarias y build a cargo
del CI del PR. **Sin verificar todavía contra Meta real**: hace falta una app
de Tech Provider aprobada (ver «Pendiente»).

**Input**: la agencia War quiere ofrecer a sus clientes conectar el número que
ya usan en la app WhatsApp Business del teléfono **sin perderlo ahí**
(«coexistencia»). Meta lo permite solo por Embedded Signup y solo a Tech
Providers / Solution Partners. La 066 portó el Embedded Signup normal y dejó
la coexistencia fuera de alcance («queda como spec aparte»): esta es esa spec.

**Carril**: ciclo completo (Principio VI): una variable nueva, tres webhooks
nuevos y **una migración aditiva** (`0027_coexistencia`: columnas anulables
o con default en `meta_credentials`).

Fuente: guía oficial «Onboarding WhatsApp Business app users (aka
Coexistence)» de Meta (developers.facebook.com › Embedded Signup).

## Qué cambia respecto de la 066

| Paso | Alta normal (066) | Coexistencia (067) |
|---|---|---|
| `FB.login` | `extras` v4 | + `featureType: "whatsapp_business_app_onboarding"` |
| Evento | `FINISH` / `FINISH_ONLY_WABA` | `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING` (`waba_id`, a veces `phone_number_id`) |
| Canje del `code` | Sí | Sí, igual |
| `POST /{phone}/register` con PIN | Sí | **No**: el número ya está registrado en la app y Meta lo prohíbe. No se pide PIN |
| Credenciales + webhook | Sí | Sí, igual, con `coexistence = true` |
| Sincronización | — | `POST /{phone}/smb_app_data` con `smb_app_state_sync` (contactos) y luego `history`, en el mismo alta |

## Historias

### H1 — La opción solo existe si la instancia la enciende

`META_COEXISTENCIA=on` (bandera de despliegue, patrón ADR-001), además de
las tres variables de la 066. Apagada:

- la tarjeta «Conectar con Meta» no muestra la opción;
- `POST /api/settings/whatsapp/embedded` con `modo: "coexistencia"` responde
  422 `coexistence_disabled` sin llegar a Meta;
- un evento de coexistencia en el popup se rechaza como en la 066, ahora con
  un texto que dice qué casilla marcar.

El GET de la ruta agrega `coexistencia: boolean` para la tarjeta.

### H2 — El alta

Con la bandera encendida, la tarjeta muestra la casilla **«Ya uso este número
en la app WhatsApp Business»**. Marcada:

1. Se oculta el PIN (no aplica) y `FB.login` lleva el `featureType`.
2. El evento `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING` termina el alta con
   `modo: "coexistencia"`. Sin `waba_id`, se falla sin llamar al servidor.
3. El servidor canjea el `code`, resuelve el número de la WABA (como en la
   066: con `phone_number_id` lo verifica; sin él usa el único), **no** llama
   a `/register`, guarda las credenciales con `coexistence = true` y registra
   el webhook.
4. **Después** del webhook (Meta exige estar suscrito antes) pide los
   contactos y el historial. Meta da **24 h y una sola vez por tipo**: por eso
   se pide en el mismo alta. Los `request_id` se guardan para soporte.
5. Si Meta no acepta alguna sincronización, el alta **no** falla: el número
   quedó conectado y recibe mensajes. La respuesta dice
   `coexistence: { contactsSync, historySync }` y la tarjeta explica que para
   importar lo anterior hay que desconectar desde la app y volver a conectar.

Una conexión posterior manual o por alta normal pone `coexistence = false` y
borra el estado de las sincronizaciones.

### H3 — Contactos (`smb_app_state_sync`)

- `type: contact`, `action: add` → `getOrCreateContactByIdentity` con el
  teléfono normalizado y `full_name` (o `first_name`) como nombre de perfil.
  Si una persona ya renombró al contacto en el CRM, se respeta (#51).
- `action: remove` → **nada**. El contacto, sus conversaciones y sus leads son
  del negocio, no de la libreta del teléfono.
- Teléfonos imposibles (menos de 8 o más de 15 dígitos) y otros `type` se
  descartan.

### H4 — Historial (`history`)

Hasta 180 días previos al alta, en fases (0, 1, 2) y chunks. Cada mensaje:

- `to` presente → saliente del negocio (`direction: out`, `origin: manual`,
  estado según `history_context.status`); si no → entrante (`delivered`).
- Se guarda **como historia**: actualiza solo `lastMessageAt` (sin
  retroceder), **no** suma `unreadCount`, **no** toca `lastInboundAt` (la
  ventana de 24 h), **no** pausa la IA y **no** despacha al cerebro.
- Idempotente por `wa_message_id` (constitución IV): Meta reintenta chunks.
- `media_placeholder` se salta: Meta manda el contenido en otro webhook con el
  mismo id, y ese se guarda. Imagen, video y documento guardan el pie (o el
  nombre del archivo) como texto; el archivo no se descarga (fuera de
  alcance).
- Grupos (hilos que no son teléfonos) se descartan: Meta no los sincroniza.
- Un `conversation.updated` por conversación tocada, no por mensaje.
- Avance: `metadata.progress` / `phase`; fase 2 al 100 % = `done`. Un error
  `2593109` = `declined` (el negocio no autorizó compartir); otro error =
  `failed`. Monotónico: no retrocede ni reabre `done`/`declined`.

### H5 — Desconexión (`account_update`)

`PARTNER_REMOVED` (el cliente desconectó desde la app) y `ACCOUNT_OFFBOARDED`
(cambió de teléfono o salió) → `markReconnectRequired`. Los demás eventos de
`account_update` se ignoran.

### H6 — Se ve en Ajustes → WhatsApp

Con el número en coexistencia, la tarjeta del número conectado muestra el
distintivo **Coexistencia** y una línea con el estado del historial
(pedido, importando N %, importado, rechazado, falló).

## Fuera de alcance

- Descargar los adjuntos del historial (Meta solo da los de los últimos 14
  días y hay que pedirlos aparte).
- Reintentar la sincronización: Meta no lo permite sin un alta nueva.
- Throughput: en coexistencia el número queda fijo en 20 mensajes/s; el CRM no
  manda en masa, así que no se limita aparte.
- Funciones que Meta apaga en coexistencia (listas de difusión, mensajes que
  desaparecen, etc.): son del teléfono, no del CRM.

## Panel de Meta (una vez por app)

Además de lo de la 066, en **WhatsApp › Configuración › Webhook** suscribir
los campos `history`, `smb_app_state_sync`, `smb_message_echoes` y
`account_update` (además de `messages`). Ver
[docs/embedded-signup.md](../../docs/embedded-signup.md#coexistencia).

## Pendiente

- Probar contra Meta real con la app de Tech Provider de War aprobada y un
  número de prueba de **otro** portafolio (Meta no deja onboardear por
  Embedded Signup un número del portafolio dueño de la app).
- Confirmar si el evento de coexistencia trae `phone_number_id` en v4 (el
  código funciona con o sin él).
- Extender el arnés E2E (`scripts/e2e-embedded-signup.mjs`) con el wa-mock de
  `smb_app_data` y los tres webhooks.
