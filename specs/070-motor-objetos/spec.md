# 070 — Motor de objetos personalizados

Estado: pasos 1 a 3 de 8 (metadatos y configuración; lectura y escritura; pantallas) · Repo: GudLime/gudlime-crm-service
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

## Próximos pasos

4. CSV genérico ·
5. Relación oportunidad ↔ objetos · 6. Agente · 7. Estadísticas ·
8. Configuración de WAR (adopta Edificio y Departamento).

Tests: `tests/unit/motor-config.test.ts`, `motor-valores.test.ts`, `motor-registros-db.test.ts` (con Postgres), `motor-pantallas.test.ts`.
