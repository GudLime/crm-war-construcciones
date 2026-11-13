# 071 — Reservas de restaurante por WhatsApp

Estado: especificación · Primer cliente: Beba (pastificio, Villa Urquiza) · Repo: GudLime/gudlime-crm-service (núcleo) + GudLime/crm-beba (configuración)

## Qué

Un restaurante toma reservas por WhatsApp con un flujo de preguntas y
respuestas fijas (botones y listas), sin agente que piense. Cada persona que
escribe queda como contacto y cada reserva queda asociada a ese contacto. La
reserva ocupa la oportunidad: misma lógica, otro nombre y otros estados.

Todo lo genérico va al núcleo detrás de la bandera `RESERVAS`, apagada por
defecto, para que el próximo restaurante lo tenga con solo configurarlo. Lo
único propio de Beba es su configuración.

## Decisiones (acordadas el 13/11/2026)

- **Sin agente.** El flujo es de botones y listas. El Flow de WhatsApp con
  endpoint cifrado queda para cuando Beba tenga el negocio verificado en Meta
  (los Flows lo exigen); botones y listas no lo necesitan.
- **La reserva es la oportunidad renombrada.** Se llama Reserva, tiene sus
  propios estados y puede tener menos funciones que una oportunidad.
- **Confirmación automática.** La reserva que entra por WhatsApp queda
  confirmada sin intervención del equipo.
- **Cupo por mesas, sin mesa específica.** El flujo no asigna una mesa
  concreta: descuenta cupo por tipo de mesa. El equipo ubica a la gente al
  llegar. A futuro se puede pasar a cupo por personas y mesas combinables.
- **Horarios:** 12:00 y 14:00 (mediodía) y 20:00 (noche). Cada mesa se usa una
  vez por horario. Los tres horarios arrancan con el mismo cupo.
- **Cupo de Beba por horario:**

  | Sector | Mesas de 4 | Mesas de 2 |
  |---|---|---|
  | Semidescubierto | 1 | 1 |
  | Salón | 2 | 2 |

- **Qué mesa ocupa cada reserva:**
  - 1 o 2 personas: una mesa de 2. Si no quedan mesas de 2, no hay lugar en
    ese horario (no se usa una de 4) y se ofrece otro.
  - 3 o 4 personas: una mesa de 4.
  - 5 o 6 personas: una mesa de 4 y una de 2 **del mismo sector**.
  - Más de 6: el bot deriva la conversación a una persona.
- **El sector es interno.** La persona no elige salón o semidescubierto. El
  sistema anota uno para llevar la cuenta y el equipo puede cambiarlo.
- **Calendario:** la API de WhatsApp no tiene mensajes de tipo evento (son de
  grupos en la app). La confirmación lleva un botón con enlace «Agendar» que
  detecta el teléfono: en iPhone baja el `.ics` y en Android abre Google
  Calendar con la reserva cargada.
- **Recordatorio el mismo día** con una plantilla de utilidad y los botones
  Confirmo y Cancelar.
- **Número:** se arranca con el número de prueba de Meta. Cuando el sistema
  esté listo, se pasa el número actual de Beba a la Cloud API; deja de
  funcionar en la app de WhatsApp Business (sin coexistencia por ahora).
- **Conexión con Meta:** la cuenta de WhatsApp es de Beba, en su portafolio. La
  app de GudLime accede con un usuario del sistema de Beba (el mismo camino que
  ya funciona con WAR). Beba paga sus mensajes con su propia tarjeta.

## Estados de la reserva

| Estado | Abierta | Quién lo pone |
|---|---|---|
| Confirmada | Sí | El flujo al crearla, o una persona al cargarla a mano |
| Llegó | Cerrada (ganada) | El equipo, desde la vista del día |
| Cancelada | Cerrada | La persona desde WhatsApp, o el equipo |
| No vino | Cerrada | El equipo, desde la vista del día |

Cancelar o marcar No vino libera el cupo. Cada cambio pasa por
`cambiarEstadoOportunidad`, así queda en el historial y puede disparar el
evento de conversión de esa etapa hacia Meta (016).

## La conversación

Todo ocurre dentro de la ventana de 24 h, porque la persona escribe primero.
Cada toque llega al CRM como mensaje entrante (`interactive.button_reply` o
`list_reply`) con un id que define el flujo, por ejemplo `res:horario:20:00`.

1. **Bienvenida**, botones: Reservar · Ver la carta · Hablar con alguien. Si
   el contacto tiene una reserva confirmada a futuro: Ver mi reserva ·
   Cancelar · Hablar con alguien.
2. **Fecha:** lista con los próximos días que tienen algún lugar (hasta 10).
3. **Personas:** lista 1 a 6 y «Más de 6» (deriva).
4. **Horario:** botones con los horarios de ese día que tienen lugar para esa
   cantidad. Si no queda ninguno, se ofrece volver a elegir la fecha.
5. **Nombre:** botón «A nombre de <nombre del perfil>» o «Otro nombre», y en
   ese caso se espera texto.
6. **Resumen:** fecha, horario, personas y nombre; botones Confirmar · Cambiar.
7. **Confirmar:** se toma el cupo en una transacción (bloqueo por fecha y
   horario, para que dos personas no se queden con la última mesa). Si en el
   medio se ocupó, se avisa y se vuelve al paso 4.
8. **Confirmación:** texto con los datos y botón con enlace «Agendar».

Derivan a una persona (traspaso existente, IA pausada): «Más de 6», «Hablar
con alguien» y dos respuestas seguidas que el flujo no entiende. Si la persona
deja el flujo a medias más de 30 minutos, el próximo mensaje arranca de nuevo
en la bienvenida.

## Ajustes → Reservas (núcleo, bandera `RESERVAS`)

- Horarios: día de la semana y hora (12:00, 14:00, 20:00).
- Cupo por horario: sector, capacidad de la mesa, cantidad.
- Anticipación máxima en días y hasta cuántos minutos antes del horario se
  puede reservar por WhatsApp.
- Días cerrados (feriados, eventos privados).
- Hora del recordatorio por horario y nombre de la plantilla.
- Enlace de la carta.

## Vista del día

Pantalla «Reservas de hoy» (y de otro día): por horario, las reservas con
personas, nombre, sector y teléfono, el cupo que queda por tipo de mesa, y
botones Llegó · No vino · Cancelar · Cambiar sector. Desde ahí se carga una
reserva a mano (las que entran por teléfono), con la misma regla de cupo.

## Calendario

`GET /r/<token>`: público, sin sesión. El token es aleatorio y no lleva datos
personales. Con un navegador de iPhone devuelve `text/calendar` (`.ics`); con
cualquier otro, redirige a la plantilla de evento de Google Calendar
(«Reserva en Beba», fecha, hora, dirección). El evento dura 2 horas.

## Arquitectura

- **Núcleo (gudlime-crm-service), bandera `RESERVAS`:**
  - Vocabulario configurable de la oportunidad desde `clientes/<cliente>.json`:
    nombre (Reserva), estados, motivos de cierre, y apagar lo inmobiliario
    (edificios, ambientes, tipologías, asignación por edificio).
  - Tablas `reserva` (1 a 1 con la oportunidad: fecha, horario, personas,
    nombre, sector, mesas tomadas, token del calendario), `reserva_horario`,
    `reserva_cupo` y `reserva_ajustes`, con `organization_id`. Migración aditiva.
  - Servicio de disponibilidad y toma de cupo (`src/server/reservas/`), usado
    por el flujo, la vista del día y, a futuro, por un agente.
  - Envío de mensajes interactivos (botones, listas, botón con enlace) en
    `src/server/inbox/send.ts`: hoy se reciben pero no se mandan.
  - El despacho al cerebro suma el id del botón o de la fila elegida (hoy
    llega solo el texto). Enmienda el contrato del 021.
  - API del cerebro: `GET /api/bot/reservas/disponibilidad`,
    `POST /api/bot/reservas`, `POST /api/bot/reservas/<id>/cancelar`,
    `POST /api/bot/messages/interactive`.
  - Recordatorios: barrido cada 5 minutos que manda la plantilla a las
    reservas del día a su hora; nunca dos veces la misma.
- **Cerebro de reservas:** el flujo vive en un cerebro aparte, conectado por
  el contrato del despacho como Nea. El CRM no gana un turno propio (regla de
  036) y pasar a un agente conversacional es cambiar de cerebro.
- **Beba (crm-beba):** `clientes/beba.json` con el vocabulario y la bandera;
  los horarios y el cupo se cargan en Ajustes → Reservas.

## Fases

1. Infraestructura: proyecto CRM Beba en Coolify, base, dominio
   `crm.beba.gudlime.com.ar`, backups. Conexión con el número de prueba y
   prueba de envío y recepción con un número real cuanto antes.
2. Vocabulario configurable y apagar lo inmobiliario (núcleo).
3. Reservas: tablas, disponibilidad, Ajustes → Reservas y vista del día.
4. WhatsApp: mensajes interactivos, id del botón en el despacho, API del
   cerebro, cerebro de reservas, calendario.
5. Plantilla de recordatorio (aprobación de Meta) y barrido.
6. Pruebas de punta a punta con mocks y con el número de prueba; paso al
   número de Beba; capacitación.

## Fuera de alcance por ahora

Mesas específicas y plano del salón · cupo por personas y mesas combinables ·
Flow de WhatsApp cifrado (cuando Beba esté verificado) · lista de espera ·
seña · coexistencia con la app.

## A definir (no bloquea)

Días y horarios en que abre Beba · días de anticipación · hasta cuánto antes se
reserva por WhatsApp · hora de los recordatorios · enlace de la carta ·
dirección para el calendario.
