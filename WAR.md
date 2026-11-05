# Customizaciones WAR Construcciones

Copia de [kevinrivm/vocero-crm](https://github.com/kevinrivm/vocero-crm) usada
por la agencia WAR Construcciones para todas las instancias de CRM-as-a-service.
Basada en el fork de GudLime (`GudLime/vocero-crm`), con la marca cambiada a War.

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

## Actualizar desde upstream

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
  (`src/lib/instrucciones-war.ts`).
- Código: `src/server/oportunidades-war.ts`, panel del chat en
  `src/components/ventas/oportunidad-panel.tsx`.

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
