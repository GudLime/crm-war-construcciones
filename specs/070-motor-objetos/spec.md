# 070 — Motor de objetos personalizados

Estado: pasos 1 a 5 de 8 (metadatos y configuración; lectura y escritura; pantallas; CSV; oportunidad y reglas de etapa) · Repo: GudLime/gudlime-crm-service
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

## Próximos pasos


5. Relación oportunidad ↔ objetos · 6. Agente · 7. Estadísticas ·
8. Configuración de WAR (adopta Edificio y Departamento).

Tests: `tests/unit/motor-config.test.ts`, `motor-valores.test.ts`, `motor-registros-db.test.ts` (con Postgres), `motor-pantallas.test.ts`, `motor-csv.test.ts`.
