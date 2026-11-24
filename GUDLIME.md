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

## Vocabulario de la oportunidad (spec 071)

Cada cliente puede renombrar la oportunidad (Reserva), elegir qué etapas usa
y con qué nombre, sus motivos de cierre, y apagar lo inmobiliario, desde
`clientes/<cliente>.json` (formato en [clientes/README.md](clientes/README.md)).
El servidor lo lee una vez (`src/server/vocabulario.ts`) y lo baja a las
pantallas con `useVocabulario()` (`src/components/vocabulario.tsx`); lo puro
vive en `src/lib/vocabulario.ts`. Las API de estado y motivo lo revisan
(`revisarCambio`). Sin `inmobiliario`, abrir una oportunidad no exige que el
contacto sea Lead. Primer cliente: Beba (reservas de restaurante).

## Reservas de restaurante (spec 071)

Módulo opcional detrás de `RESERVAS=on`; apagado, sus pantallas y su API dan
404. Se reserva por cupo, no por mesa: cada horario arranca con todas las
mesas de Ajustes → Reservas libres y cada reserva se lleva la más chica que
alcanza (o dos del mismo sector). Cada reserva es una oportunidad con su fila
en `reserva` (fecha, hora, personas, sector, mesas); las etapas que ocupan
mesa son las abiertas y Compró (en Beba, Confirmada y Llegó). El día se
maneja desde la vista Mosaico de Reservas (el salón por horario y sector,
`src/components/reservas/salon-del-dia.tsx`). En Contactos, cada persona
muestra sus reservas, visitas y faltas, su segmento (Nuevo, Cliente,
Habitual) y las vistas armadas; todo se cuenta de sus reservas
(`src/server/reservas/comensales.ts`). El menú de cada cliente (orden,
nombres, pantallas apagadas) va en el bloque `menu` de su configuración. Reglas puras en `src/lib/reservas.ts`,
servicio en `src/server/reservas/`.

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

- `edificio.color` guarda una clave de la paleta de `lib/colores-edificio.ts`
  (16: los seis de siempre —violeta, naranja, azul, rosa, cian, ámbar— más
  rojo, índigo, turquesa, fucsia, celeste, amarillo, frambuesa, lima, marrón y
  gris oscuro; sin verdes plenos) o un color propio `#rrggbb` elegido con
  «Otro color…» (`selector-color.tsx`: el selector del navegador o el código);
  de un color propio se sacan el fondo claro y el texto oscuro (`tonoDeHex`), y
  si es verde se avisa (`esVerdoso`). La migración 0045 les dio color a los
  existentes en orden de creación; uno nuevo recibe el menos usado de la
  paleta. Se cambia en la página del edificio.
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
- **Nuevas para vos** (asignadas y sin primer contacto, la asignación más vieja
  primero; `oportunidad.responsable_desde`, 0053) y **Leads calientes** (en
  Visitó, con el próximo paso: la tarea o cita futura más cercana; primero las
  que no tienen). Máximo 5 por bloque, con link a Oportunidades filtrada.
- **Visitas de hoy (0054)**: Visita y Reunión son la misma cita (`booking`). Las
  agenda una persona (nacen confirmadas por ella) o el agente (nacen sin
  confirmar); «Confirmar» (`POST /api/bookings/[id]/confirmar`) guarda
  `confirmada_at` y `confirmada_por_user_id` y no le manda nada al cliente. Las
  tareas de tipo Visita o Reunión que ya existían se pasan a citas desde Ajustes
  → Ventas (no corre solo; las que chocan con otra cita o no tienen fecha
  quedan). Tareas ya no ofrece esos tipos.
- **Ventana de 24 h por cerrar**: chats de WhatsApp de mis contactos donde el
  último mensaje es del cliente, nadie respondió y la ventana cierra en menos de
  12 h.
- **Tu semana**: desde el lunes contra la semana anterior hasta el mismo punto:
  nuevas asignadas, % contactadas, mediana hasta el 1.er contacto, visitas,
  reservas (Reservó o Compró) y perdidas, de `oportunidad_evento`.
- **Ver como** (solo admin): el Inicio de otra persona del equipo; los links
  abren las listas filtradas por esa persona.

## Tareas por tipo en la oportunidad (0058)

En «Próximos pasos», en lugar de «Agregar tarea», va una fila de botones por
tipo — WhatsApp (`mensaje`) · Llamada · Reunión · Mail (`correo`) · Tarea (nuevo,
genérico) — que muestran el nombre al pasar el mouse y abren una ventanita
anclada (`components/ventas/nueva-tarea.tsx`): título por defecto según el tipo,
cuándo (Hoy · Mañana · En 3 días · Otra fecha con el calendario propio
`components/ui/calendario.tsx`) y hora, responsable y nota. **Reunión** tiene
dos pestañas: **Visita** (en un edificio, por defecto el de la oportunidad) y
**Reunión** (en la oficina, `ventas_ajustes.direccion_oficina`, Ajustes →
Ventas). Con la Agenda prendida y contacto, crea una **cita** (`booking`, con
`ubicacion`, que el conector de Google manda como `location` del evento); si no,
una tarea `visita`/`reunion` con `tarea_venta.ubicacion` y `edificio_id`.

## Plantillas de tareas sugeridas (0059)

Configuración → Plantillas de tareas (`/settings/tareas`, solo admin, para todo
el equipo). Cada plantilla se sugiere en una **situación fija** de la
oportunidad (`lib/sugerencias.ts`: `sin_contacto`, `no_contesta` con N días,
`conoce`, `visita_agendada`, `visito`, `no_vino`, `reservo`, `compro`), con su
vencimiento (hoy · mañana · +N · el día antes de la visita) y un mensaje con
variables (`{nombre}`, `{vendedor}`, `{edificio}`, `{unidad}`,
`{fecha_visita}`). Las de fábrica se cargan la primera vez que se piden
(`ventas_ajustes.plantillas_sembradas`). La función pura `sugerencias()`
devuelve hasta 3 y no repite una plantilla con tarea abierta
(`tarea_venta.plantilla_id`) ni una descartada en la misma etapa
(`oportunidad_sugerencia_descartada`). Nunca crea tareas sola.
- **En el detalle** («Sugeridas para esta etapa», en Próximos pasos): de 1 a 3
  sugerencias con el porqué y el mensaje ya completado. **Crear**
  (`POST /api/oportunidades/[id]/sugerencias/[plantillaId]/crear`) arma la tarea
  en un paso, a las 10:00 del día que vence, con el mensaje como comentario y a
  cargo del responsable; el aviso tiene **Deshacer** (borra la tarea). La **✕**
  (`…/descartar`) la oculta mientras siga en esa etapa; «N descartadas ·
  mostrar» permite volver a mostrarlas. Se recalcula con la etapa, los mensajes
  y las citas. El admin ve «Configurar plantillas».

## Resultados: barra de período, edificio y filtros

Arriba de Resultados, tres filas (`components/results/barra-resultados.tsx`):
**Período** (pestañas de fábrica relativas a hoy — 7 / 30 / este mes / mes
pasado / 90 / este año — y propias con fechas fijas, «+ Guardar fechas» con el
calendario propio), **Edificio** (Todos, una por edificio y grupos propios,
«+ Guardar grupo») y **Filtros** manuales que no se guardan (Origen, Responsable
para el admin, Operación). Las pestañas viven en `vista_guardada` con `pagina =
'resultados.fechas' | 'resultados.edificios'` (del equipo si las guarda un
admin, o propias) y la última de cada fila en `vista_ultima`
(`/api/resultados/pestanas`). Los endpoints de `/api/analytics/*` aceptan
`desde`, `hasta` (además de `from`/`to`), `edificioIds`, `origen`,
`responsable` y `operacion` (`server/analytics/filtros.ts`). «Origen y
anuncios» y «El agente» dejaron de mostrarse (el código y los endpoints siguen).
- **Oportunidades** (rediseño §2–3, `oportunidades-resumen.tsx`): dos gráficos
  circulares de las consultas del período — por edificio (con su color;
  `porEdificio` en `/api/analytics/oportunidades`) y por origen (4 colores fijos
  y «Otros») — y el **Embudo por etapa** (`embudo-etapas.tsx` +
  `lib/embudo-resultados.ts`): fila de totales con el % sobre la anterior
  (verde/ámbar/rojo) y sobre el total, bandas con raíz cuadrada y la pastilla
  «Conversión total · Ciclo promedio» (suma de medianas por etapa). Funnel |
  Tabla. Salieron «Ver por», «Filtrar», las tarjetas y las tablas.
- **Visitas** (rediseño §4, reemplaza a Ventas; `visitas-section.tsx` +
  `lib/visitas-resultados.ts` + `server/analytics/visitas.ts`,
  `/api/analytics/visitas`): las citas con fecha en el período, ligadas a la
  oportunidad de su contacto (la de interacción más reciente) y con los mismos
  filtros; el operador ve solo las suyas. Números (agendadas, realizadas, no
  vinieron, canceladas), mapa de calor de las REALIZADAS (semanas de lunes a
  domingo, máximo 13) con barras por día de la semana, línea realizadas vs
  agendadas, dona por edificio, dona «Quién agendó» (agente vs vendedor),
  «Qué pasó después» (estado actual: reservó o compró / abierta / perdida) y la
  tabla de las que visitaron con «Ver las N en Oportunidades →», que abre
  Oportunidades con el filtro `visitaDesde`/`visitaHasta` (chip «Tuvo visita
  realizada»). El endpoint de Ventas sigue, sin mostrarse.

## Asignaciones: la mesa de reparto (0060)

Solo admin (`/asignaciones`; el operador recibe 404 y no ve el ítem, que va
debajo de Tareas con la pastilla de sin asignar). Spec:
`claude/asignaciones.md`.
- **Quién asignó y cómo:** `oportunidad.asignada_por` (`auto` | `manual` |
  `ia`) y `asignada_por_user_id`. Todo cambio de responsable pasa por
  `aplicarResponsable` (`server/responsables.ts`), que además deja un evento
  `responsable` en `oportunidad_evento` con `datos { como, desde, hacia }` (los
  nombres como foto; se ve en la línea de tiempo). La regla por edificio
  (`asignarLeadDeMeta`) escribe `auto`; el admin, `manual`.
- **Mesa** (`server/asignaciones.ts`, `GET /api/asignaciones?edificio=`): las
  abiertas sin nadie a cargo (de la más vieja a la más nueva), las que asignó
  la regla en las últimas 24 h (con «Corregida → X» si se cambiaron) y los
  vendedores con abiertas, sin contactar, visitas de hoy y las asignadas hoy.
  Tope de carga fijo en 30 (`TOPE_CARGA`): alta desde 65%, saturada desde 85%.
- **Quién recibe:** `ventas_ajustes.asignacion_vendedores` (orden = tecla
  1–9). Sin ajuste, los de rol `member`, por nombre (si no hay ninguno, todos).
- **Sugerencia** (`lib/asignaciones.ts`, `sugerir`): la regla por edificio si
  apunta a alguien que recibe; si no, el de menos carga sin los saturados. Cada
  sugerencia suma carga, así «Aceptar todas» reparte.
- `POST /api/asignaciones { oportunidadIds, userId }` devuelve `cambios` (cómo
  estaba cada una) y `POST /api/asignaciones/deshacer { cambios }` las vuelve
  tal cual. Sin aviso al vendedor (decidido 22/11).
- **Mesa** (`components/asignaciones/asignaciones-client.tsx`): arrastrar y
  soltar nativo (HTML5, sin dependencias) de una tarjeta o de las elegidas
  (clic elige, Shift+clic suma), el carril de abajo se pinta con borde
  punteado; el avatar late al recibir. Barra de teclado siempre visible: 1–9
  (el nombre al lado), Enter acepta la sugerencia, Z deshace (pila por
  sesión), Esc suelta. Los números van a las elegidas o a la de arriba
  (`objetivoDe`, `accionDeTecla` en `lib/asignaciones.ts`). «Ver y reasignar»
  en cada carril pasa una de hoy a otro vendedor. Aviso abajo de 6 s con
  Deshacer.
- **Modo foco** (`modo-foco.tsx`, Mesa | Foco · F): una tarjeta por vez con
  dos asomando detrás, progreso «N de M · quedan K», → o Enter al sugerido, ←
  la manda al final (`ordenDeFoco`), 1–9 a ese vendedor, Z deshace, Esc vuelve.
  La tarjeta sale hacia donde va (~200 ms). Al terminar, «¡Todo asignado!».
- **Ajustes → Ventas → Asignaciones** (`vendedores-asignacion.tsx`,
  `/api/settings/ventas/vendedores`): el orden (define la tecla) y quién
  recibe. El tope no se configura.

## Color por etapa (cambios 23/11, punto 5)

`lib/colores-etapa.ts` (`COLOR_ETAPA`, `colorDeEtapa`, `varsDeEtapa`): sólido,
tinte, texto, lavado y texto sobre el sólido por etapa (Recibido verde, En
charlas celeste, Conoce información amarillo, Visitó rojo, Reservó violeta,
Compró rosa, Perdido y No calificado gris; una etapa propia de un cliente cae
en el gris). Lo usan la barra de avance (actual en sólido, pasadas en tinte),
`EtapaPill`, los puntos del Pipeline, el fondo lavado de filas y tarjetas de
Oportunidades (`.fondo-etapa`, `.borde-etapa` en `globals.css`, con modo
oscuro) y las bandas del embudo de Resultados.

## Workflow de la primera llamada (0061, cambios 23/11 punto 4)

- **Plantillas por origen:** `tarea_plantilla.origenes` (vacío = todos;
  `aplicaAlOrigen` compara sin tildes ni mayúsculas). Vale para sugerir y para
  crear.
- **«Al asignarle responsable»** (situación `al_asignar`): no se sugiere, se
  crea sola (`server/tareas-automaticas.ts`, llamado desde
  `aplicarResponsable`). De nadie a una persona crea la tarea a su nombre (sin
  duplicar la abierta); de una persona a otra le pasa las abiertas; a la IA,
  nada. Un fallo nunca rompe la asignación.
- **Cómo salió la llamada** (`resultado-llamada.tsx`, `POST
  /api/tareas/[id]/llamada`): «No atendió» → `no_responde` (intento);
  «Atendió» → `listo`, primer contacto y, si estaba en Recibido, a En charlas.
  En Próximos pasos, Tareas y el Tu día de Inicio.
- **La ventana de «Atendió»** pide el comentario (va a la tarea) y tiene un
  lugar para el cliente: `components/extensiones/llamada-atendida.tsx`
  (`ExtraLlamadaAtendida`). **El núcleo no vuelve a tocar ese archivo**: cada
  cliente lo reemplaza con lo suyo (en WAR, «¿Qué buscaba?»).
- **«Llamada sin atender»**: la última llamada marcada quedó «No atendió» y el
  cliente no escribió después → plantilla de fábrica «Avisar que lo llamamos»
  (la migración la siembra en las organizaciones que ya tenían plantillas).

## Calendario en Tareas (cambios 23/11, punto 2)

- `/tareas` suma la forma **Calendario** (`SelectorDeForma` con
  `conCalendario`): es el mismo calendario de Citas (`BookingsClient` con
  `embebido`: vista en `?cal=`, sin pedir citas si la agenda está apagada) con
  las tareas del filtro de la página como bloques de 30 min en Día y Semana
  (`TareaCal` en `time-grid.tsx`, barrita del color del tipo; las hechas,
  atenuadas y tachadas). Tocar una tarea abre su edición; tocar una cita, el
  panel de siempre (confirmar, reprogramar, cancelar, bloquear).
- **Citas se puede ocultar** (`menu.ocultar: ["bookings"]`): `/bookings`
  redirige a `/tareas?vista=calendario`. En el núcleo sigue visible.

## Contactos compacta (cambios 23/11, punto 8)

`GET /api/contacts?pagina=N&porPagina=50&q=&tipo=&fuente=&agente=con|sin&archivados=solo&orden=nombre|telefono|creado:asc|desc`
devuelve `{ items, total, pagina, porPagina }` (filtros y orden en el
servidor, `lib/contactos-lista.ts`). Sin `pagina` responde lo de siempre
(`{ contacts }`, las últimas 200): lo usan otros selectores. La pantalla
(`contactos-lista.tsx`, fuera del restaurante) es una tabla liviana: buscador
redondo, pastillas de filtro con ×, «+ Filtro» y «Limpiar», una línea por
contacto (avatar, nombre, teléfono, alta), orden por columna y páginas de a
50. En el restaurante sigue la lista de comensales.

## Inicio por bloques (cambios 23/11, punto 7)

En la config del cliente, `inicio.bloques` (`BLOQUES_INICIO`: `etapas`,
`tareas`, `derivadas`, `nuevas`, `calientes`, `visitas`, `tu_dia`, `ventanas`,
`semana`) elige qué muestra el Inicio y en qué orden. Sin `inicio`, el de
siempre. Con bloques: encabezado con la fecha y el saludo grande; `etapas` es
el mini dashboard (abiertas de quien mira en Recibido, En charlas, Conoce
información y Visitó, cada número abre Oportunidades filtrada) y `tareas` el
widget (`tareas-widget.tsx`: lista continua Vencidas → Sin hora → Hoy con la
línea de «Ahora» → días siguientes, en columnas de 280 px con alto fijo,
filtros por tipo que restan, «+N más» medido, y cada ítem se despliega con sus
acciones). `GET /api/inicio` suma `etapas`, `widget` y `hoy` solo si el
cliente los usa (`etapasDelUsuario`, `widgetDeTareas`).

## Derivaciones de la IA → tarea (0062, cambios 23/11 punto 6)

Cuando el agente deriva (`POST /api/bot/handoff`, o el traspaso por error del
despacho), `tareaPorDerivacion` (`server/derivaciones.ts`) crea una tarea
`creada_por = 'ia'` con la `conversation_id`, a nombre de
`ventas_ajustes.derivaciones_responsable_user_id` (Ajustes → Ventas →
«Responsable de las derivaciones de la IA»; vacío = sin asignar) y ligada a la
oportunidad del contacto. Tipo y título según el motivo
(`lib/derivaciones.ts`): quiere reservar o comprar → «Llamar a {nombre}»;
pregunta que no sabe → «Contestar consulta»; si no, «Responder a {nombre}»
(WhatsApp, en 15 min). El comentario lleva el último mensaje y «derivada por
{agente} · motivo». No se duplica (se actualiza el comentario) y se cierra
sola cuando una persona responde (`registrarSaliente` →
`cerrarTareasDeDerivacion`). En Tareas y en el widget del Inicio lleva la
marca de chispas; en el widget suma «Responder en Bandeja».

## v2 (23/11) — chispas en Próximos pasos, tareas en Lista, widget lavado

- Próximos pasos de la oportunidad: las tareas de la IA llevan las chispas y
  «Responder en Bandeja» (`TareaCorta.creadaPor` / `conversationId`).
- Calendario de Tareas, vista Lista: también las tareas (`AgendaList` recibe
  `tareas` como la rejilla). En Mes, solo las citas.
- Widget «Tareas» del Inicio: los filtros y los íconos con el estilo lavado de
  `IconoTipo` (tinte del tipo).
- **Tablas de trabajo diario** (punto 5): `components/ui/tabla-configurable.tsx`
  (`TablaConfigurable`, `SelectorColumnasTabla`, `usePrefTabla`) y
  `lib/tabla.ts`: ordenar desde el título, ocultar, cambiar el ancho, **mover
  la columna arrastrando el título** y «Columnas → Restablecer». Preferencias
  por tabla en el navegador (`vocero:tabla:<clave>`). Lo usan Tareas (Lista;
  con un orden elegido no agrupa por fecha), Contactos (orden en el servidor),
  Edificios, Unidades del edificio y los objetos del cliente. Oportunidades
  suma mover columnas (`posiciones` en sus preferencias).

## v3 (24/11) — tareas por tipo, cita única, sidebar del chat

- **Estados por tipo** (`estadosDeTipo` / `etiquetaDeEstado` en `lib/ventas.ts`):
  los valores guardados son los de siempre (`realizar`, `listo`, `no_responde`)
  más `programado` (0063); cambia el nombre según el tipo (una llamada cerrada
  es «Atendió», un WhatsApp o un mail, «Enviado»). Tareas no tiene Pipeline.
- **WhatsApp y Mail** (0063: `mensaje`, `asunto`, `enviada_at`, `aviso`):
  «Enviar ahora» (`POST /api/tareas/[id]/enviar`, `server/tareas-envio.ts`),
  «Programar» y «Dejar pendiente». El barrido de programadas corre cada minuto
  en el proceso; con la ventana de 24 h cerrada no sale y queda Pendiente con
  el aviso. El mail todavía no se envía.
- **Fechas de tareas:** una fecha sin zona del formulario es hora del negocio
  (`fechaDeTarea` en `server/ventas.ts`).
- **Cita única** (0064: `booking.modo`, `edificio_id`, `responsable_user_id`):
  `VentanaCita` con la pestaña Visita | Reunión, `GET /api/bookings/[id]` y la
  acción `datos`. Extensión `components/extensiones/cita-visita.tsx`
  (`ExtraCitaVisita`). Las tareas de visita/reunión con fecha pasan solas a
  citas al arrancar.
- **Sugerencias:** vencimiento `cierre-Nh` (N h antes de que cierre la ventana
  de WhatsApp); un WhatsApp con mensaje queda Programado a esa hora.
- **Sidebar del chat:** sin el bloque del contacto ni el tipo de contacto; la
  tira `BotonesNuevaTarea` (con `modal`) entre la IA y la etapa.
- **Asignaciones:** orden por llegada (más nuevas / más viejas).
- **Edificios:** `en_venta` booleano (0065), desplegable Sí/No.

## v4 (24/11) — tipos de contacto, lector, llamadas, respuestas con fotos

- **Tipos de contacto** (0066, `contact.tipos_contacto`, selección múltiple):
  Cliente, Proveedor, Inquilino, Inmobiliaria, Propio. Lo que busca va en el
  tipo de la oportunidad (Venta, Alquiler, Inmobiliaria). «Lead» ya no es un
  tipo: los que lo eran pasan a Venta (`pasarLeadsAVentaAlArrancar`).
- **Quién atiende la IA** (`iaAtiende` en `lib/ventas.ts`): con oportunidad
  abierta, solo Venta; sin oportunidad, si no es Proveedor, Propio ni
  Inmobiliaria.
- **La ficha del agente** (`normalizarTipoContacto` → `aplicarClasificacionIa`):
  «lead» abre Venta, «alquiler» abre Alquiler, el resto se suma al contacto.
- **El lector** (`server/lector.ts`): con el agente apagado o la IA en pausa,
  lee el chat por ráfaga (90 s) y arma la oportunidad por el mismo camino, sin
  contestar. Solo si hace falta (sin nada clasificado o sin interés).
- **Sidebar del chat:** el interés (edificio, tipología y la extensión
  `components/extensiones/oportunidad-chat.tsx`) arriba de la etapa;
  «Crear oportunidad» con su tipo.
- **Llamadas** (`server/inbox/llamadas.ts`, webhook `calls`): quedan en el chat
  como mensaje `type: "call"`; cada aviso queda en el log.
- **Respuestas rápidas con fotos y videos** (0067, `quick_reply.adjuntos`).
- El nombre del chat abre el contacto; buscador en Oportunidades.

