# 068 — Oportunidades de War: lo que avanza es la oportunidad, no el contacto

Estado: implementado (PR feat/oportunidades-war) · Fork: GudLime/crm-war-construcciones

## Por qué

En War el embudo de ventas lo recorre una **oportunidad**, no un contacto. Un
contacto puede comprar dos veces, o volver a consultar meses después de perder
una: cada vez es una oportunidad nueva, con su propio avance ("conoce
información" pasa una vez por oportunidad, no una vez por persona).

Además no todo el que escribe es un prospecto: hay compradores que ya
compraron, inmobiliarias, proveedores y gente de la propia constructora. A esos
no se les vende ni les habla la IA.

## Decisiones (confirmadas con Sebastián, 02/11/2026)

1. **Tipo de contacto** (`contact.tipo_contacto`):
   `lead` · `comprador` · `inmobiliaria` · `proveedor` · `propio`; `NULL` = sin clasificar.
   - Arranca **sin clasificar**. No hay oportunidad hasta que alguien (la IA o una persona) lo marque `lead`.
   - La IA puede clasificar `lead`, `comprador`, `inmobiliaria`, `proveedor`, y solo cuando el contacto está sin clasificar: nunca pisa una clasificación hecha y nunca marca `propio` (solo manual).
   - `comprador`, `inmobiliaria`, `propio`: fuera de la venta y de la IA (el contacto queda con el agente apagado; lo atiende una persona).
   - `proveedor`: fuera de la venta. Hasta que exista su flujo propio, también lo atiende una persona.
2. **Una oportunidad abierta por contacto.** Abiertas: `recibido`, `no_responde`, `en_charlas`, `conoce_informacion`, `visito`, `reservo`. Cerradas: `compro`, `no_calificado`, `perdido`. Se abre otra recién cuando la anterior se cierra. La base lo garantiza con un índice único parcial.
3. **Etapas** sin cambios (no se agrega "conoce precios").
4. **La IA avanza la oportunidad abierta solo hasta `conoce_informacion`**, y solo hacia adelante: `recibido → en_charlas → conoce_informacion`. Visitó, Reservó, Compró, No responde, No calificado y Perdido los marca una persona.
5. **Interés múltiple:** una oportunidad puede tener varios edificios (`oportunidad_edificio`) y varias tipologías (`oportunidad_tipologia`). El departamento puntual (`departamento_id`) sigue siendo uno, para cuando se define la unidad.

## Cómo se integra con el cerebro (Nea no cambia)

El contrato de `/api/bot/*` se respeta; el CRM traduce:

- `GET /api/bot/context` → `lead` describe la **oportunidad abierta** (`id`, `stageName`, `nextStages` = etapas permitidas a la IA). `null` si el contacto no es `lead` o no tiene oportunidad abierta. Aditivo: `contact.tipoContacto`.
- `POST /api/bot/stage` → mueve la oportunidad abierta con las reglas del punto 4 (misma validación de IA activa y herramienta `etapa`).
- `PUT /api/bot/ficha` → además de guardar la ficha, el CRM lee tres claves:
  - `tipo_contacto`: clasifica (punto 1). Si es `lead`, abre la oportunidad en `recibido`.
  - `edificios_interes`: nombres de edificios separados por coma → se suman a la oportunidad abierta (coincidencia por nombre o dirección, sin acentos).
  - `tipologias_interes`: "2 ambientes", "monoambiente", "triplex"… → se suman.
- `GET /api/bot/profile` → a las instrucciones del negocio se les agrega un bloque fijo que le explica al agente esas tres claves y sus reglas.
- Conversaciones del Laboratorio (`is_test`): la ficha se guarda, pero no se clasifica ni se crean oportunidades.

## Pantallas

- Panel del contacto en la Bandeja: el bloque "Etapa del pipeline" se reemplaza por **Tipo de contacto** + **Oportunidad abierta** (etapas, cierre, edificios y tipologías de interés) y la cantidad de oportunidades anteriores.
- Contactos: tipo en la lista, en el alta y en la edición.
- Oportunidades: varios edificios y tipologías por oportunidad; error claro si se intenta abrir una segunda para el mismo contacto.

## Fuera de alcance (siguiente iteración)

- Pasar a `no_responde` por tiempo sin respuesta (necesita una tarea programada).
- Flujo propio de proveedores.
- Que Resultados y el Pipeline de Vocero cuenten oportunidades en vez de leads (el Pipeline de leads sigue existiendo, pero el chat ya no lo muestra).
