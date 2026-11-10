# 070 — Motor de objetos personalizados

Estado: pasos 1 a 7 de 8 (metadatos y configuración; lectura y escritura; pantallas; CSV; oportunidad y reglas de etapa; agente; estadísticas) · Repo: GudLime/gudlime-crm-service
Diseño completo: documento «Diseño técnico: objetos personalizados en Vocero».

## Qué

Cada cliente define su propia estructura —objetos como Edificio, Unidad o
Tratamiento, sus campos y sus relaciones— en un archivo
`clientes/<cliente>.json`, sin tocar el código del núcleo. Contacto,
oportunidad, mensajes, tareas, notas, orígenes e historial siguen siendo del
núcleo.

## Decisiones (acordadas con Sebastián, 06/11/2026)

- La estructura cambia solo desde el archivo, por PR. Nadie agrega columnas
  desde la interfaz; un CSV con columnas nuevas carga el resto y avisa.
- Una tabla real por objeto y una columna real por campo (sin clave-valor).
- **Adoptar, no mudar**: un objeto puede describir una tabla que ya existe
  (`adopta`), como `edificio` y `departamento` en WAR. Conserva ids, datos e
  historial.
- Nunca se borra: lo que sale del archivo se archiva.
- Visibilidad para el agente: interruptor por objeto y por columna; solo el
  administrador.
- Dos roles: administrador (agencia) y cliente; preparado para sumar Vendedor.

## Paso 1 (este)

- Migración `0038_motor_objetos`: `motor_objeto`, `motor_campo`,
  `motor_relacion` (con `organization_id`).
- `src/lib/motor/config.ts`: formato y validación del archivo (versión 1).
- `src/lib/motor/ddl.ts`: SQL de los objetos nuevos; solo `CREATE ... IF NOT
  EXISTS` y `ADD COLUMN IF NOT EXISTS`.
- `src/server/motor/sincronizar.ts`: al arrancar, con `CLIENTE_CONFIG`, valida,
  crea la estructura de los nuevos, verifica las tablas adoptadas y registra
  los metadatos en cada organización. Nunca tumba el arranque.
- `clientes/ejemplo.json` y `clientes/README.md` (formato).
- Sin `CLIENTE_CONFIG` no cambia nada: gudlime-crm-service y WAR siguen igual.

## Paso 2: lectura y escritura genéricas

- `src/lib/motor/valores.ts` (puro): conversión por tipo (número en formato
  argentino o internacional, moneda en centavos, sí/no, selección por valor o
  por nombre), título (campos pegados: «6B», «111»), suma, igualdad.
- `src/server/motor/metadatos.ts`: metadatos vigentes de la organización y
  las columnas reales de cada tabla.
- `src/server/motor/registros.ts`: listar (búsqueda en el título, filtros,
  hijos de un padre), obtener, crear, actualizar, borrar (`cascada` o
  `soltar`), contar asociados e historial. Título único por organización o
  dentro del padre, comparado normalizado. Resúmenes de relaciones con filtro.
  Toda consulta lleva `organization_id`.
- Migración `0039_motor_cambios`: `motor_cambio`, historial de solo agregar,
  con el título del momento.
- CI: Postgres 16 de prueba con las migraciones aplicadas;
  `tests/unit/motor-registros-db.test.ts` corre contra él.

## Paso 3: pantallas genéricas

- API: `GET/POST /api/objetos/<objeto>` (lista con `q`, `padre=<relación>:<id>`,
  `f.<campo>=a,b`; alta) y `GET/PATCH/DELETE /api/objetos/<objeto>/<id>`
  (detalle con padres, hijos, asociados e historial; edición; borrado con
  `?modo=cascada|soltar`). Cualquier usuario de la organización: el cliente
  carga registros, la estructura no se toca.
- Pantallas `/objetos/<objeto>` (buscar, filtrar, crear) y
  `/objetos/<objeto>/<id>` (datos, edición, padres, hijos con alta ya
  relacionada, historial, borrado que pregunta qué hacer con los asociados).
- Menú: cada objeto entra solo en «Ventas» (`appNavGroups({ objetos })`).
- La moneda se escribe en unidades y viaja en centavos.

## Paso 4: CSV genérico

- `src/lib/motor/csv.ts` (puro): reconoce columnas por nombre o clave del
  campo (sin acentos ni mayúsculas), el padre por su nombre; celda vacía = no
  cambiar; la moneda se escribe en unidades; exporta las mismas columnas.
- `src/server/motor/importar.ts`: plan por fila (crear, actualizar, igual,
  error) y aplicación. Empareja por nombre, dentro del padre si corresponde.
  Nunca crea padres. Cada fila se guarda sola; todo comparte un lote en el
  historial. Columnas no reconocidas: se avisan, «las tiene que agregar un
  administrador».
- API `POST /api/objetos/<objeto>/importar` (`aplicar: false` = vista previa;
  `padre` fija la relación) y `GET /api/objetos/<objeto>/exportar` (mismos
  filtros que la lista).
- Botones Importar y Exportar en la lista y en cada sección de hijos.

## Paso 5: la oportunidad y los objetos

- Relaciones muchos a muchos desde `oportunidad`: la oportunidad se vincula con
  registros del cliente (unidades, tratamientos). Nunca se borra por un objeto.
- La tabla intermedia puede adoptarse (`adoptaTabla`, con `columnaDesde` /
  `columnaHacia`), como `oportunidad_edificio` en WAR, y puede sembrarse UNA
  vez desde una columna existente (`sembrarDesde`, marca `sembrado_at`), como
  `oportunidad.departamento_id`.
- `reglasEtapa`: cuando la oportunidad pasa a una etapa, un campo de los
  vinculados toma un valor. Se enganchan en `cambiarEstadoOportunidad` (vale
  para personas, agente y cierres automáticos): con un vinculado se aplica
  sola; con varios, la pantalla pregunta cuáles. Nunca frena el cambio de
  estado.
- Migración `0040_motor_oportunidad`: columnas nuevas en `motor_relacion`,
  tabla `motor_regla`.
- API `GET/PUT /api/oportunidades/<id>/objetos` y
  `GET/POST /api/oportunidades/<id>/reglas`; tarjeta «Interés» en la página de
  la oportunidad (solo con configuración).
- Las columnas viejas de WAR (`edificio_id`, `departamento_id`,
  `oportunidad_edificio`) no se tocan: el paso 8 las adopta o las siembra.

## Paso 6: el agente lee los objetos

- Es del núcleo (vale para todo cliente): el administrador decide qué lee el
  agente desde la tabla de cada objeto. Interruptor «Visible para el agente»
  en la cabecera y, con el objeto prendido, un ícono de IA en cada columna.
  Solo quien administra (`canConfigure`); el cliente no ve los controles.
  La sincronización nunca pisa lo que eligió el administrador.
- `PATCH /api/objetos/<objeto>/agente` `{ visible?, campos? }`. El GET del
  objeto devuelve `puedeConfigurar`.
- Texto genérico (`src/lib/motor/agente.ts`, puro): una línea por registro que
  se entiende sola (repite el título de sus padres), solo columnas visibles;
  el título va siempre. Tope de 400 líneas por objeto.
- Bloque opcional `agente` por objeto en la configuración: `filtro` (solo se
  listan los que lo cumplen; los demás se cuentan; si el padre queda afuera,
  sus hijos también), `agruparPor` + `rangos` (mínimo y máximo por grupo, para
  que el agente copie y no calcule; una columna oculta no entra al resumen),
  `indicacion`. Migración `0041_motor_agente` (columna `agente` jsonb).
- Se suma al conocimiento en `GET /api/bot/profile` y en el juez del
  Laboratorio, después de la memoria de edificios de WAR. Nunca lanza.
- La memoria de edificios vieja (`memoriaDeEdificios`) sigue hasta el paso 8:
  ahí WAR prende Edificio y Unidad en el motor, se compara el texto que recibe
  Mateo y recién entonces se apaga la vieja (para no duplicar).
- Los objetos del núcleo (contacto, oportunidad) le llegan al agente por su
  propio camino; estos controles son solo para los objetos personalizados.

## Paso 7: estadísticas de oportunidades

- Sección «Oportunidades» arriba de todo en Resultados (`/api/analytics/oportunidades`),
  con el mismo selector de período. Cuenta las oportunidades que ENTRARON en el
  período (cohorte), sin las del Laboratorio.
- Bloques: embudo (hasta qué etapa del camino llegó cada una, también las
  perdidas), tiempo en cada etapa (mediana y promedio en días, de
  `oportunidad_evento.segundos_en_estado_anterior`), motivos de pérdida y
  orígenes con su conversión.
- «Ver por» y filtros se arman solos: origen y tipo (núcleo) y, por cada
  relación muchos a muchos de la oportunidad, el registro vinculado, sus campos
  de selección y booleanos, los de texto o número con hasta 25 valores, y sus
  padres (unidad → edificio). Una oportunidad con dos valores suma en los dos
  grupos y la pantalla lo avisa. Se puede filtrar por «sin valor».
- Tablero a medida: `estadisticas` en la configuración elige qué bloques y en
  qué orden, y el «Ver por» de arranque. Gráficos propios por cliente, más
  adelante.
- Si el motor falla, las estadísticas del núcleo siguen andando.
- Cálculo puro en `src/lib/estadisticas-oportunidades.ts`; lectura en
  `src/server/analytics/oportunidades.ts`.

## Paso 8a: tablas adoptadas que crecen (para WAR)

- `crear: true` en un campo de un objeto adoptado: el motor agrega la columna
  (`ALTER TABLE IF EXISTS … ADD COLUMN IF NOT EXISTS`). Nunca cambia ni borra.
- `inicial`: valor fijo o copiado de otra columna (patrón y/o equivalencias),
  una vez por organización (`motor_campo.inicializado_at`) y solo donde está
  vacía. Si falla, se anota en el log y no se marca.
- `columnaTitulo`: el nombre armado se guarda en una columna existente
  (`departamento.unidad`). Se lee lo guardado (sirve para «PB 02» de antes) y
  se reescribe solo cuando cambia un campo del título; para rearmarlo tienen
  que estar todos.
- Migración `0042_motor_war`. `aplicarConfig(config, orgs?)` separa la
  sincronización de la lectura del archivo.
- Vista previa «Lo que lee el agente» (`/agent/conocimiento`, solo
  administrador): el texto exacto de hoy y, simulando objetos prendidos, cómo
  quedaría. Perfil, Laboratorio y vista previa usan `conocimientoDelAgente`.
- La memoria de edificios de WAR se apaga sola cuando un objeto que adopta
  `edificio` está visible para el agente.
- `enMenu: false` (migración `0043_motor_menu`): el objeto no aparece en el
  menú, pero sus pantallas andan por enlace (un hijo que se ve dentro del
  padre, o mientras un cliente usa una página propia).
- Mientras conviven pantallas viejas y el motor, lo que crean o editan las
  viejas se completa con la misma regla de `inicial`
  (`completarColumnasDe`): en WAR, crear o importar unidades desde la página
  de Edificios llena tipo, ambientes y tipología.

## Paso 9: fotos, video y documento

- Tres tipos de campo nuevos: `galeria` (fotos JPG, hasta `maxArchivos`, 6
  por defecto, tope 20), `video` (un MP4, `maxMb` hasta 16: el tope de
  WhatsApp) y `documento` (un PDF, `maxMb` 10 por defecto, tope 25). En un
  objeto adoptado van con `crear: true` (galería = `jsonb`, los otros `text`).
- El binario va a `lib/storage/medios` (volumen o bucket) y `motor_archivo`
  (migración `0044_motor_archivos`) dice qué es; el registro guarda los ids.
  Se reconoce por el contenido (JPG, MP4, PDF), no por la extensión. Subir:
  `POST /api/motor-archivos`; ver: `GET /api/motor-archivos/<id>`.
- Las fotos se achican en el navegador antes de subir (lado mayor 1600 px,
  JPG, ~1,5 MB como máximo); el servidor rechaza más de 2 MB. El video no se
  recodifica: si pesa más del tope, se pide uno más liviano.
- Sacar un archivo de un registro, o borrar el registro, lo borra del disco.
  Los archivos no viajan en el CSV ni en el texto del historial.
- El agente: una línea con fotos o video visibles lleva `[fotos:<id>]`. Si
  la persona pide fotos, el agente escribe el código; `/api/bot/messages` lo
  saca del texto, manda el texto y después, en segundo plano, TODAS las fotos
  (en orden) y el video, marcados como IA. Hasta 3 registros por mensaje. En
  una conversación de prueba se anota «[Se envían N fotos…]» y no se manda
  nada. El PDF no sale por el agente.

## Próximos pasos

8. Configuración de WAR (adopta Edificio y Departamento).

Tests: `tests/unit/motor-config.test.ts`, `motor-valores.test.ts`, `motor-registros-db.test.ts` (con Postgres), `motor-pantallas.test.ts`, `motor-csv.test.ts`, `motor-agente.test.ts`, `estadisticas-oportunidades.test.ts`, `motor-adopta.test.ts`.
