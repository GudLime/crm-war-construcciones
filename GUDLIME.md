# GudLime CRM — repo madre

Base de los CRM que la agencia GudLime instala para sus clientes. Parte de
[kevinrivm/vocero-crm](https://github.com/kevinrivm/vocero-crm) (upstream) y le
suma el núcleo comercial: oportunidades, orígenes, historial, leads, «sin
respuesta». No tiene nada de ningún cliente.

## Repos y flujo

- **GudLime/gudlime-crm-service** (este): núcleo y motor. Publica
  `ghcr.io/gudlime/gudlime-crm-service` (`:main`, `:<versión>`, `:sha-<commit>`).
  No despliega en ningún lado.
- **Un repo por cliente** (por ejemplo `GudLime/crm-war-construcciones`), que
  trae este como `upstream` y suma solo lo suyo: su configuración y, si hace
  falta, overrides. Cada cliente tiene su proyecto, servidor y base en Coolify,
  y su propio workflow de despliegue.
- **El flujo va solo hacia abajo**: GudLime → clientes. Un repo de cliente nunca
  se mergea hacia acá. Si algo nacido en un cliente sirve para todos, se trae en
  forma genérica con un PR propio.
- **El núcleo no se edita en el repo del cliente.** Overrides, de más limpio a
  más sucio: (1) una opción en la configuración; (2) un punto de reemplazo que el
  núcleo deja preparado (carpeta `overrides/` del cliente); (3) editar archivos
  del núcleo en el cliente: no se usa. Si un override se repite en dos clientes,
  pasa al núcleo como opción.
- **Migraciones**: este repo nunca agrega una migración que borre tablas o datos
  que un cliente pueda tener; llegaría a producción con el merge.

### Traer mejoras a un cliente

```bash
# en el repo del cliente, una vez por copia local
git remote add upstream https://github.com/GudLime/gudlime-crm-service.git
git fetch upstream
git merge upstream/main   # en una rama, por PR
```

Cuando acá se saca algo que el cliente sí usa (como pasó al separar WAR), el
cliente registra ese commit sin aplicarlo: `git merge -s ours <commit>`.

### Actualizar desde Vocero

```bash
git remote add vocero https://github.com/kevinrivm/vocero-crm.git  # una vez
git fetch vocero
git merge vocero/main   # en una rama, por PR
```

Diferencias con Vocero: spec 067 (coexistencia), 068 (oportunidades), 069
(CSV de unidades) y las secciones de abajo. Si Vocero publica su propia
coexistencia, preferir la suya y revisar el número de migración antes del merge.

## Motor de objetos personalizados (spec 070)

Cada cliente define sus objetos, campos y relaciones en `clientes/<cliente>.json`
y la instancia lo elige con `CLIENTE_CONFIG`. Formato y reglas en
[clientes/README.md](clientes/README.md). Se aplica al arrancar, nunca borra y
puede «adoptar» tablas que ya existen. Paso 1 de 8: metadatos y configuración.

## Pendiente

Pasos 2 a 8 del motor (edificio y departamento pasan a ser objetos
del cliente), interruptor de configuración para las reglas que se suman a las
instrucciones del agente (`src/lib/instrucciones-oportunidades.ts`). Diseño
técnico: documento «Diseño técnico: objetos personalizados en Vocero».

## Oportunidades (spec 068)

Lo que avanza en el embudo es la **oportunidad**, no el contacto
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

> Edificios, departamentos y tipologías siguen fijos en el código hasta que el
> motor de objetos personalizados los reemplace (ver «Pendiente»).

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
  encabezado con el nombre (lápiz al pasar el mouse), los datos en dos columnas
  (origen, interés, tipologías —editables—, las relaciones del motor con su
  selector, valor · creada, en este estado, tipo) y la barra de avance en flechas;
  las reglas de etapa que piden elegir salen como aviso debajo. Pestañas Timeline
  (arriba los próximos pasos —tareas por hacer y reuniones futuras, de la más
  lejana a la más cercana—, un divisor «Hoy» y el historial, con fecha exacta y
  relativa) / Reuniones / Notas / Últimos mensajes. A la derecha, el Contacto
  plegable con «Ver contacto completo» (`/contacts/[id]`). Muestra la oportunidad
  anterior del contacto y las abiertas en paralelo.
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

## Color de cada edificio (0045)

- `edificio.color` guarda una clave de la paleta fija de `lib/colores-edificio.ts`
  (violeta, naranja, azul, rosa, cian, ámbar; sin verdes, para no confundirse
  con la marca ni con el avance). La migración 0045 les dio color a los
  existentes en orden de creación; uno nuevo recibe el menos usado. Se cambia
  en la página del edificio.
- `PildoraEdificio` (`components/ventas/pildora-edificio.tsx`): punto, fondo con
  tinte y texto oscuro del mismo tono; en tema oscuro el tinte sale del punto.
  Se usa en la oportunidad (interés y oportunidad paralela), la lista de
  oportunidades y las tareas (el edificio principal de su oportunidad).

## Lista de oportunidades: Lista, Mosaico y Pipeline

- `components/ventas/oportunidades-vistas.tsx` (lo puro en `lib/oportunidades-lista.ts`):
  selector de forma de ver; en la Lista, menú por columna (ascendente /
  descendente con su criterio, quitar orden, ocultar), «Columnas N/M» y ancho
  ajustable (arrastrar el borde, mínimo 70 px; doble clic restablece). Estado
  en el orden del embudo; los vacíos van al final. Mosaico: tarjetas. Pipeline:
  una columna por etapa del camino con contador y suma de valores.
- Un clic en la fila o la tarjeta abre un panel lateral con lo esencial; el
  ícono de dos flechas (al pasar el mouse) abre la página.
- Forma, columnas, orden y anchos se recuerdan en el navegador (localStorage)
  hasta que existan las vistas guardadas.

## Vistas guardadas y filtros (0046)

- `vista_guardada`: pestañas de una página (hoy Oportunidades) con filtros,
  orden, columnas ocultas y anchos. `user_id` null = del equipo (la ven y
  editan todos); con usuario = solo suya. «Todas» y «Para cerrar» vienen de
  fábrica. `vista_ultima` recuerda la última que usó cada persona.
  API `/api/vistas` (GET ?pagina=, POST), `/api/vistas/[id]` (PATCH, DELETE),
  `/api/vistas/ultima` (PUT). Lo puro en `lib/vistas.ts`.
- Barra de filtros (`components/ventas/filtros-oportunidades.tsx`): Responsable
  con avatares (solo si la instancia expone `/api/oportunidades/responsables`;
  «yo» = quien mira, «sin» = sin asignar), «+ Filtro» (Edificio, Origen,
  Estado, Tipología, Para cerrar) con pastillas «Propiedad: valor», Limpiar y
  «Cambios sin guardar · Descartar · Guardar vista». La forma de ver no se
  guarda en la vista: queda en el navegador.

## Ambientes y tipologías de interés (0047)

- La oportunidad guarda **ambientes** (números, varios: `oportunidad_ambiente`)
  y **tipologías** (unidades tipo «1A», «2B», varias:
  `oportunidad_tipologia_unidad`). Las opciones de tipologías salen de las
  unidades de los edificios de interés (`departamento.tipologia_unidad`, que se
  carga en la unidad). La migración pasó `oportunidad_tipologia` a ambientes
  («N ambientes» → N, «triplex» → 4); esa tabla queda sin uso y no se borró.
- El cerebro sigue mandando `tipologias_interes` en la ficha («2 ambientes»): se
  convierte a ambientes.
- En la lista: columnas Ambientes y Tipología; el filtro «Tipología» usa las
  unidades tipo.

## Tareas: formas de ver, agrupación y responsable (0048)

- `/tareas` (`components/ventas/tareas-client.tsx`, lo puro en `lib/tareas-grupos.ts`):
  Lista / Mosaico / Pipeline; estados Realizar (por defecto) · No responde ·
  Todas · Listo; agrupación «Por fecha» (Sin fecha arriba, Vencidas, Hoy,
  Mañana, Esta semana hasta el domingo, Más adelante, Anteriores plegado) o
  «Sin agrupar», con «+» en cada grupo para crear una tarea ya fechada. Lista:
  Tipo (ícono en un cuadradito) · Tarea · Estado · Fecha · Contacto ·
  Oportunidad · Edificio (sale de la oportunidad) · Responsable.
- Pipeline de tareas y de oportunidades: se arrastra la tarjeta a otra columna
  para cambiar el estado (las oportunidades pasan por el historial).
- `tarea_venta.responsable_user_id` (0048): al crear, quien la crea si no se
  elige; filtro por avatares. `/api/equipo` lista el equipo.

## Oportunidades: abiertas por defecto y por páginas

- La lista arranca en la pestaña **Abiertas** (Recibido, En charlas, Conoce
  información, Visitó: `ESTADOS_ABIERTOS_LISTA`). **Cerradas** (Reservó,
  Compró, Perdido, No calificado) es otra pestaña de fábrica y el filtro
  «Situación». El servidor trae solo esa parte (`GET /api/oportunidades?situacion=`),
  así que las cerradas no se cargan hasta que se piden. Las pestañas cuentan
  solo lo que está cargado.
- Lista y Mosaico van **por páginas** (25 / 50 / 100, se recuerda en el
  navegador); el Pipeline muestra 30 por columna con «Mostrar más». Los
  contactos del formulario se piden recién al abrirlo.

## Visibilidad por rol (0050)

Cada oportunidad tiene un **responsable** (`oportunidad.responsable_user_id`).
Eso define quién ve qué, en todo el sistema:

- **Admin** (`owner` o `admin`): ve y edita todo. Por defecto arranca viendo
  **lo suyo y lo sin asignar** en Oportunidades, Bandeja y Tareas, y puede
  cambiar a todo el equipo o a otra persona (pestaña «Todas», selector de la
  Bandeja, filtro de responsable). Solo el admin asigna responsables, borra
  oportunidades y chats, y entra a Ajustes, Pipeline, Agente y Laboratorio.
- **Operador** (`member`): ve solo las oportunidades que tiene asignadas y, por
  ellas, sus contactos, sus chats y sus tareas. Lo único de todos que ve son
  las **visitas** (citas de la Agenda y tareas tipo Visita), en solo lectura.
  Edificios los ve en solo lectura. En Resultados ve solo sus números de
  oportunidades. Los chats sin oportunidad solo los ve el admin.
- Lo que no puede ver responde **404**; lo que puede ver pero no cambiar, **403**.
  El tiempo real (`/api/events`) filtra los eventos por persona.

Dónde vive: `src/server/acceso.ts` (las reglas: condiciones SQL para listas y
chequeos `puedeVer…` para cada ruta), `withAdmin` en `src/lib/api.ts` para la
configuración, y `esAdmin` en `src/lib/auth/roles.ts`. Una oportunidad creada a
mano queda a cargo de quien la crea.

## Asignación automática de leads de Meta (0051)

Ajustes → Ventas → «Asignación automática de leads de Meta». **Apagada por
defecto.** Encendida, cada edificio se mapea a una persona del equipo o al
agente de IA (`"ia"`). Cuando una oportunidad de Meta (origen Meta Ads,
Facebook o Instagram) recibe su **primer edificio** —un formulario de Make o la
IA que anota el interés— y no tiene responsable, queda a cargo del destino de
ese edificio. Lo que no está mapeado queda sin asignar (lo ve solo el admin).
Nunca pisa una asignación hecha.

- `oportunidad.responsable_ia`: la lleva el agente (sin persona: solo la ve el
  admin). En la página de la oportunidad, el admin puede elegir «<Agente> (IA)».
- `ventas_ajustes.asignacion_activa` y `asignacion_por_edificio` (jsonb).
- Código: `src/lib/asignacion.ts` (reglas puras), `src/server/asignacion.ts`
  (`asignarLeadDeMeta`, llamada desde `sumarInteres`),
  `GET/PUT /api/settings/ventas/asignacion`.

## Inicio del vendedor

`/inicio` es la primera pantalla (la raíz redirige ahí) y el primer ítem del
menú. Todo se calcula para quien mira (`GET /api/inicio?usuario=me`; otra
persona, solo admin). Spec: proyecto «CRM War Construcciones» →
`claude/inicio-vendedor.md`.

- **Contadores**: Nuevas para vos, Tareas de hoy, Visitas de hoy, Derivadas por
  la IA (del equipo) y Leads calientes. Los botones abren Oportunidades y Tareas
  con filtros por query que entran como borrador («Cambios sin guardar»), sin
  pisar la última vista: `?responsable=me&estado=…&sinPrimerContacto=1` y
  `?tipo=…&desde=hoy&hasta=hoy`. `?nueva=1` abre el alta.
- **Derivadas por la IA (0052)**: una conversación con handoff, IA pausada, sin
  respuesta humana posterior y sin tomar le aparece a todo el equipo. «Tomar»
  (`POST /api/inicio/derivadas/[id]/tomar`) guarda `conversation.tomada_por_user_id`
  y `tomada_at`; quien la toma ve ese chat y su contacto, y si la oportunidad
  abierta no tenía una persona a cargo (nadie o la IA), pasa a ser suya. Un
  handoff nuevo o reactivar la IA la vuelve del equipo. El cerebro puede mandar
  `summary` en `/api/bot/handoff` (se guarda en `handoff_resumen`) y es el texto
  del motivo. La Bandeja filtra con `?derivadas=1`.
- **Tu día**: tareas para hacer (vencidas arriba) y citas de hoy; tildar una
  tarea la pasa a Listo (`POST /api/tareas/[id]/hecha`).
