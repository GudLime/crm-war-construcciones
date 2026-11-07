# Customizaciones WAR Construcciones

CRM de WAR Construcciones. Cliente de la agencia GudLime: trae el núcleo de
[GudLime/gudlime-crm-service](https://github.com/GudLime/gudlime-crm-service)
(repo madre, que a su vez parte de kevinrivm/vocero-crm) y suma solo lo de WAR.

## Traer mejoras de GudLime

```bash
git remote add upstream https://github.com/GudLime/gudlime-crm-service.git  # una vez por copia local
git fetch upstream
git checkout -b chore/upstream-AAAA-MM-DD origin/main
git merge upstream/main   # y PR a main
```

- El flujo va solo hacia abajo: este repo nunca se mergea hacia GudLime. Si
  algo de acá sirve para todos, se lleva en forma genérica con un PR propio allá.
- No editar archivos del núcleo acá: usar opciones de configuración o puntos de
  reemplazo (`overrides/`).
- Si GudLime saca algo que WAR sí usa, registrar ese commit sin aplicarlo:
  `git merge -s ours <commit>` (así se hizo con la separación del 06/11/2026).

## Cambios respecto a upstream

1. **`src/app/war-theme.css`** — override del look (radios chicos, sombras
   mínimas, neutros slate). No toca `--accent*` ni el logo. El hilo de la
   Bandeja (`.thread-bg`) es un plano de `--accent-tint` (el lavado que ya
   inyecta la marca), sin el mosaico de dibujos de `globals.css`.
2. **`src/app/layout.tsx`** — una línea: `import "./war-theme.css"` después
   de `globals.css`.
3. **`src/lib/temas.ts`** — `APARIENCIA_POR_DEFECTO.letra = "inter"`.
4. **`src/components/app-nav.tsx`** — sidebar de escritorio con **icono + label**
   (ancho `w-56`, activo = acento sólido), en lugar del riel solo-iconos.
5. **Ventas de la constructora** — grupo de menú Edificios, Oportunidades y
   Tareas. Los departamentos cuelgan del edificio (unidad, orientación del
   edificio, orientación geográfica, metros cubiertos / semidescubiertos /
   descubiertos, valor). Los metros totales se calculan. Una oportunidad
   tiene origen, contacto y un interés que es un edificio o un departamento
   de ese edificio. Las tareas son llamadas, visitas y mensajes que hace una
   persona; la IA no las crea. Migración `0028_ventas_war`.

6. **Coexistencia (spec 067)** — `specs/067-coexistencia/`. Pensada para
   proponer upstream. Toca `src/server/whatsapp/coexistencia/`,
   `embedded.ts`, `signup-event.ts`, `embedded-signup.tsx`,
   `webhooks/procesar.ts`, `credentials.ts`, el esquema y la migración
   `0027_coexistencia`. Si upstream publica su propia coexistencia, preferir
   la suya y revisar el número de migración antes del merge.

Color y logo: cada cliente los configura en **Configuración → Marca** (DB).

## Actualizar desde Vocero (lo hace GudLime)

```bash
git remote add upstream https://github.com/kevinrivm/vocero-crm.git  # una vez
git fetch upstream
git checkout main
git merge upstream/main
# Conflictos esperables: import en layout.tsx, default de letra en temas.ts,
# y cambios en app-nav.tsx (sidebar con labels) si upstream tocó el riel.
```

Después: un push a `main` → GitHub Actions publica la imagen en
`ghcr.io/gudlime/crm-war-construcciones` (`:main`, `:<versión>` y `:sha-<commit>`)
→ el job `desplegar` del workflow «Imagen» le pide a Coolify que redespliegue la
app `vocero-crm` del equipo War, que usa el tag `:main`. No hay que tocar Coolify.

- Secretos del repo que necesita: `COOLIFY_URL` y `DEPLOY_WAR_COOLIFY_API` (token del
  equipo War con permiso `deploy` solamente). Sin ellos, el job avisa y no despliega.
- Volver atrás: en Coolify, poner el tag `sha-<commit anterior>` y redesplegar
  (y volver a `:main` cuando esté arreglado).
- Como todo lo que entra a `main` sale a producción, los cambios van por PR.

## Motor de objetos personalizados (spec 070, desde GudLime)

El motor viene del núcleo (paso 1 de 8: metadatos y archivo de
configuración). WAR todavía no lo usa: sin `CLIENTE_CONFIG` no hace nada.
En el paso 8 se suma `clientes/war.json`, que adopta las tablas `edificio` y
`departamento` sin mover datos. Formato: [clientes/README.md](clientes/README.md).

## Oportunidades (spec 068)

En War lo que avanza en el embudo es la **oportunidad**, no el contacto
(detalle en `specs/068-oportunidades-war/spec.md`):

- `contact.tipo_contacto`: lead · comprador · inmobiliaria · proveedor · propio
  (vacío = sin clasificar). Solo el lead entra a la venta y a la IA.
- Una oportunidad abierta por contacto (índice único parcial); varios
  edificios y tipologías de interés por oportunidad.
- La IA (Nea, sin cambios) clasifica con la clave de ficha `tipo_contacto`,
  suma interés con `edificios_interes` / `tipologias_interes`, y mueve la
  oportunidad abierta hasta «Conoce información» con `POST /api/bot/stage`.
  Las reglas se le agregan solas a las instrucciones del agente
  (`src/lib/instrucciones-oportunidades.ts`).
- Código: `src/server/oportunidades.ts`, panel del chat en
  `src/components/ventas/oportunidad-panel.tsx`.

## Orígenes de los leads (0035, imagen 0037)

**Configuración → Orígenes** (Negocio): nombre e ícono de cada origen, en el
orden del desplegable de Oportunidades. El ícono sale de la librería
(lucide) o es una **imagen propia** (el logo de Zonaprop, MercadoLibre…):
PNG/JPEG/WebP/SVG hasta 256 KB, tipo verificado por los bytes, guardada en el
volumen de medios como `origen-<id>` y servida con sesión por
`/api/origenes/<id>/imagen?v=` (misma CSP que el favicon). Tabla `origen_oportunidad`
(`src/lib/db/ventas-tables.ts`), catálogo de íconos y valores por defecto en
`src/lib/origenes.ts`, lógica en `src/server/origenes.ts`, API `/api/origenes`
(GET todos; POST/PATCH/DELETE/PUT orden solo quien configura).

- `oportunidad.origen` sigue siendo texto (el nombre). Renombrar un origen lo
  cambia también en las oportunidades y en `oportunidad_lead`. Borrarlo no
  toca las oportunidades: lo siguen mostrando con el ícono genérico.
- La entrada de Make (`POST /api/integraciones/leads`) acepta los nombres
  configurados; lo demás da 422 `origen_desconocido` con la lista vigente.
- La migración siembra los 16 de siempre en cada organización; una
  organización nueva los recibe al abrir la lista. No se puede borrar el último.
- «Anuncio» como fuente del contacto se sigue decidiendo por nombre (Meta Ads,
  Google Ads, Facebook, Instagram, Tik Tok); un origen nuevo cuenta como «otro».

## Memoria del agente (edificios)

Cada edificio tiene un interruptor **Memoria del agente** y un campo **Notas
para el agente** (las unidades también tienen notas). Los edificios prendidos
se suman al conocimiento que el CRM le pasa al agente (`GET /api/bot/profile`
→ `kb`) y al juez del Laboratorio: datos del edificio, notas y las unidades
Disponible / Consultar con metros, ambientes y precio (reservadas y vendidas
solo se cuentan). Nea guarda el perfil ~5 min, así que un cambio de precio
llega en ese plazo. Código: `src/lib/memoria-agente.ts`,
`memoriaDeEdificios` en `src/server/ventas.ts`.

## Leads de formularios y teléfonos (Make)

Referencia completa (campos, respuestas, errores, prueba con curl y armado
del escenario): [docs/integraciones-leads.md](docs/integraciones-leads.md) ·
contrato: [docs/openapi-integraciones.json](docs/openapi-integraciones.json).

Mientras la app de Meta no tenga Ads Management, los leads de los formularios
de Meta Ads (y de los portales) entran por **Make**: un escenario por
formulario manda el lead a `POST /api/integraciones/leads` con el header
`X-API-Key: <LEADS_API_KEY>` (variable de entorno, distinta de `BOT_API_KEY`).

Cuerpo (JSON): `leadId` y `origen` (uno de `ORIGENES_OPORTUNIDAD`, ej.
`Meta Ads`) obligatorios; `edificio` (id, o nombre / dirección de un único
edificio), `nombreCompleto` o `nombre` + `apellido`, `telefono`, `email`,
`campaignId/Name`, `adsetId/Name`, `adId/Name`, `formId/Name`, `plataforma`,
`creadoEn` y `respuestas` (objeto libre) opcionales. Responde 201 si abrió
una oportunidad, 200 si se sumó a una o si el `leadId` ya había entrado.

- **Teléfonos** (`src/lib/telefono.ts`, libphonenumber de Google): todo
  número que entra —alta manual, importación, leads— se guarda en E.164 sin
  `+`. El celular argentino lleva el 9 (`5491151191447`), igual que el `wa_id`
  de WhatsApp, así que el contacto del formulario y el mensaje que llega
  después son el mismo. Sin código de país se lee como argentino; sin 9, se le
  agrega. La migración 0034 pasa los `54` + 10 dígitos ya cargados a `549`.
- **Oportunidades**: el lead ID vive en `oportunidad_lead`, no en el contacto.
  Si la persona tiene una abierta del mismo edificio (o una abierta sin
  edificio, la del WhatsApp que llegó antes), el lead se suma; si no, se abre
  otra. Ya no hay una sola abierta por contacto (0034 borra ese índice).
- **Última interacción** (`oportunidad.ultima_interaccion`): la tocan un lead
  nuevo y cada mensaje de WhatsApp; ordena la lista de Oportunidades. Si un
  Lead escribe y no tiene ninguna abierta, se le abre una nueva.

## Página de la oportunidad, historial y «sin respuesta»

- **Página** `/oportunidades/[id]` (`components/ventas/oportunidad-detalle-client.tsx`,
  datos en `server/oportunidad-detalle.ts` → `GET /api/oportunidades/[id]/detalle`):
  encabezado con barra de avance, pestañas Timeline / Reuniones / Notas / Últimos
  mensajes (los últimos 4, con «Ir al chat») y tarjetas de Contacto, Próximos pasos
  y Datos. Muestra la oportunidad anterior del contacto y las abiertas en paralelo.
  Lo del contacto (mensajes, reuniones, tareas sueltas) se toma desde el cierre de
  la oportunidad anterior: las compras no se mezclan. WhatsApp va por ráfagas.
- **Historial** `oportunidad_evento` (`server/oportunidad-historial.ts`): solo se
  agregan filas. Tipos: creada, estado, cerrada, reabierta, formulario,
  primer_contacto, primera_respuesta. Cada fila guarda cuándo pasó, quién
  (persona con su usuario, ia, make, sistema), la foto de origen / edificio /
  tipo, el resultado y motivo del cierre y los segundos en el estado anterior.
  Todo cambio de estado pasa por `cambiarEstadoOportunidad`. El estado actual se
  sigue leyendo de `oportunidad`; el historial cuenta cómo se llegó. Empieza con
  la migración 0036 (un «creada» por cada oportunidad existente).
- **Sin respuesta**: «No responde» dejó de ser un estado. Un intento es una tanda
  de mensajes nuestros (dentro de la misma hora: Mateo, equipo, plantilla o el
  teléfono) o una tarea marcada «No responde»; se cuentan desde lo último que
  escribió la persona y vuelven a 0 cuando contesta. Configuración → Ventas
  (`ventas_ajustes`): con N intentos y D días desde el último (3 y 7) la
  oportunidad se cierra sola como Perdido «No responde» (barrido cada hora) o se
  marca «Para cerrar». Si la persona escribe dentro de la ventana de reapertura
  (120 días) se reabre la MISMA oportunidad en el estado que tenía; pasado el
  plazo, se abre otra. «No calificado» y «Compró» no se reabren.
- **Notas unificadas** (`conversation_note` con `contact_id` y `oportunidad_id`):
  cada nota queda en la oportunidad abierta cuando se escribió. En el chat se ven
  todas las del contacto (con la etiqueta de su oportunidad); en la oportunidad,
  solo las suyas.

## Migraciones propias de WAR

Las migraciones que vienen de GudLime se llaman `00NN_…` y avanzan su `when`
de a 3 horas. Las propias de WAR se llaman `war_NNNN_…` y su `when` va apenas
después (+1 minuto) de la última de GudLime que haya en ese momento. Así la
próxima de GudLime (+3 h) siempre queda después y no se saltea. Al traer
cambios de GudLime, si `_journal.json` choca, se ordenan las entradas por
`when` y se renumera `idx`.

- `war_0001_motivos_cierre`: motivos de cierre configurables (Ajustes →
  Motivos de cierre), sembrados con los 27 de Notion.
- `war_0002_datos_contacto`: datos personales del contacto (DNI, CUIL/CUIT,
  nacimiento, dirección, género, newsletter, ID de Google Contacts) y
  parientes, en `contacto_datos` y `contacto_pariente` (no se toca `contact`).
