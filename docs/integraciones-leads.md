# Entrada de leads (Make → CRM)

Mientras la app de Meta no tenga Ads Management, los leads de los formularios
de Meta Ads (y de los portales) entran al CRM por **Make**: un escenario por
formulario manda cada lead nuevo a esta entrada.

- **Contrato**: [`openapi-integraciones.json`](openapi-integraciones.json)
  (validado contra el código en `tests/unit/openapi-integraciones.test.ts`).
- **Código**: ruta `src/app/api/integraciones/leads/route.ts` · lógica
  `src/server/integraciones/leads.ts` · reglas puras y cuerpo `src/lib/leads.ts`
  · teléfonos `src/lib/telefono.ts` · llave `src/server/integraciones/auth.ts`.

## La llamada

```
POST https://crm.war.gudlime.com.ar/api/integraciones/leads
Content-Type: application/json
X-API-Key: <LEADS_API_KEY>
```

`LEADS_API_KEY` es una variable de entorno de la app `vocero-crm` en Coolify
(mínimo 16 caracteres, distinta de `BOT_API_KEY`). También vale
`Authorization: Bearer <LEADS_API_KEY>`. Sin la variable cargada, todo
responde 401.

### Cuerpo

| Campo | Obligatorio | Qué es |
|---|---|---|
| `leadId` | sí | ID del lead en Meta (o del portal). Hace la entrada idempotente. |
| `origen` | sí | Uno de los orígenes de **Configuración → Orígenes** (`Meta Ads`, `Zonaprop`, `Argenprop`…). Acepta `meta_ads`, `META ADS`, etc. Si se renombra o se borra un origen allá, hay que cambiarlo también en el escenario de Make. |
| `edificio` | no | Id del edificio, o su nombre o dirección tal como está en el CRM. |
| `ambientes` | no | Ambientes de interés: un número (`2`), una lista (`[1, 2]`) o texto («2 Ambientes», «Monoambiente», «1, 2 y 3 ambientes», «Unidad de interés: 2 Ambientes»). Triplex cuenta como 4. Lo que no se reconoce se ignora. Se suman a los de la oportunidad. |
| `nombre`, `apellido` / `nombreCompleto` | no | Nombre de la persona. |
| `telefono` | no* | Como lo escribió la persona: el CRM lo normaliza. |
| `email` | no | Si no tiene forma de correo, se ignora. |
| `campaignId`, `campaignName`, `adsetId`, `adsetName`, `adId`, `adName`, `formId`, `formName` | no | Datos del anuncio y del formulario. |
| `plataforma` | no | `fb`, `ig`, el portal… |
| `creadoEn` | no | Fecha del lead: ISO 8601 o epoch en segundos. |
| `respuestas` | no | Objeto con las preguntas extra del formulario, tal cual. |

\* Sin teléfono (o con uno que no se puede leer) la oportunidad se crea igual,
sin contacto, y su nombre dice «revisar teléfono: …».

### Respuestas

| Código | `resultado` | Qué pasó |
|---|---|---|
| 201 | `nueva` | Se abrió una oportunidad nueva. |
| 200 | `sumada` | El contacto ya tenía una oportunidad abierta del mismo edificio (o una abierta sin edificio): el lead se sumó y la oportunidad volvió arriba. |
| 200 | `duplicado` | Ese `leadId` ya había entrado: no se tocó nada. Es lo que ve Make si reintenta. |
| 401 | — | Falta la llave o no coincide. |
| 409 | — | `no_org`: la instancia todavía no tiene organización. |
| 422 | — | `invalid_body` (falta `leadId`/`origen` o el JSON está mal), `origen_desconocido`, `edificio_desconocido` (no coincide con ninguno o coincide con varios). |
| 429 | — | Demasiados intentos con llave equivocada (30/min por IP) o más de 300 leads por minuto. |
| 500 | — | Error interno: se puede reintentar sin miedo. |

Cuerpo de una respuesta exitosa:

```json
{
  "resultado": "sumada",
  "oportunidadId": "opt_apap4arub1riifug4lvu",
  "contactId": "ct_0fhwos6sb9cnk3pnb24z",
  "contactoNuevo": false,
  "telefonoValido": true,
  "telefono": "5491140540056",
  "edificioId": null
}
```

Los errores vienen como `{ "error": { "code": "...", "message": "..." } }`.

## Qué hace con el lead

1. **Idempotencia**: si el `leadId` ya entró, devuelve lo mismo que la primera
   vez (`duplicado`). Dos reintentos simultáneos tampoco duplican.
2. **Teléfono**: lo normaliza a E.164 sin `+` con libphonenumber (Google). El
   celular argentino lleva el 9, igual que el `wa_id` con el que WhatsApp
   reporta a esa persona: `+541151191447`, `011 15 5119-1447` y
   `5491151191447` quedan todos como `5491151191447`. Sin código de país se lee
   como argentino.
3. **Contacto**: lo busca por ese número con la misma regla que la ingesta de
   WhatsApp. Si la persona ya escribió (o escribe después), es el mismo
   contacto. Si no existe, lo crea como Lead (fuente «anuncio» si el origen es
   de anuncios). A un contacto existente le completa lo que le falte (correo,
   tipo Lead si estaba sin clasificar, nombre si solo tenía el número); lo que
   ya clasificó una persona se respeta.
4. **Oportunidad**: si el contacto tiene una abierta del **mismo edificio**,
   o una abierta **sin edificio** (la que abrió el WhatsApp que llegó antes
   que el formulario), el lead se suma a esa. Si no, abre una nueva con el
   origen y el edificio. El edificio y los `ambientes` se suman al interés de
   la oportunidad (nunca se quitan los que ya tenía).
5. **Registro**: el `leadId`, la campaña, el anuncio y el formulario quedan en
   la tabla `oportunidad_lead`. En la lista de Oportunidades, la que sumó más
   de un formulario lo indica junto al origen.
6. **Última interacción**: el lead (y después cada WhatsApp de la persona)
   actualiza `oportunidad.ultima_interaccion`, que ordena la lista.

## Probarla

```bash
curl -i -X POST https://crm.war.gudlime.com.ar/api/integraciones/leads \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $LEADS_API_KEY" \
  -d '{
    "leadId": "prueba-001",
    "origen": "Meta Ads",
    "nombre": "Prueba",
    "apellido": "API",
    "telefono": "+541140540056",
    "campaignName": "Prueba API",
    "formName": "Formulario de prueba"
  }'
```

La primera vez responde `nueva` o `sumada`; la segunda, `duplicado`.
Probada en producción el 05/11/2026: `+541140540056` cayó en el contacto que
ya existía por WhatsApp (`contactoNuevo: false`, teléfono `5491140540056`) y
se sumó a su oportunidad abierta.

## Escenario de Make (uno por formulario)

1. **Facebook Lead Ads → Watch new leads**, con la página y el formulario.
2. **HTTP → Make a request**: método `POST`, la URL de arriba, header
   `X-API-Key` con la llave, cuerpo JSON con `leadId` = el id del lead,
   `origen` = `Meta Ads`, `edificio` fijo para ese formulario, y los campos del
   lead mapeados (`telefono` ← la pregunta del WhatsApp del formulario).
3. Marcar **Parse response** para ver `resultado` en el historial de Make.

Un 422 `edificio_desconocido` casi siempre es el nombre del edificio escrito
distinto que en el CRM: copiá el nombre exacto de Edificios, o usá su id.
