# Configuración de clientes

Cada cliente define acá la estructura de su CRM: sus objetos (Edificio, Unidad,
Tratamiento…), los campos de cada uno y las relaciones entre ellos o con la
oportunidad. La instancia elige su archivo con la variable `CLIENTE_CONFIG`
(por ejemplo `CLIENTE_CONFIG=clientes/war.json`). Sin la variable, el motor no
hace nada.

En **gudlime-crm-service** solo vive `ejemplo.json`. El archivo de cada cliente
vive en el repo de ese cliente.

## Reglas

- La estructura cambia solo desde este archivo, por PR. Ni el administrador ni
  el cliente agregan columnas desde la interfaz.
- Se aplica al arrancar (`src/server/motor/sincronizar.ts`) y es
  re-ejecutable.
- **Nunca borra.** Un objeto, campo o relación que se saca del archivo queda
  archivado; la columna y sus datos siguen en la base.
- **Objeto nuevo**: el motor crea `obj_<clave>` y le agrega las columnas que
  falten.
- **Objeto adoptado** (`"adopta": "<tabla>"`): describe una tabla que ya existe.
  El motor no toca su estructura; si le falta una columna que el archivo
  nombra, no lo registra y lo avisa en el log.
- Con errores de validación, el archivo no se aplica y el log los lista todos.

## Formato (versión 1)

```jsonc
{
  "version": 1,
  "cliente": "Nombre del cliente",
  "rubro": "inmobiliaria",            // informativo
  "objetos": [
    {
      "clave": "unidad",              // minúsculas, dígitos y _
      "nombre": "Unidad", "nombrePlural": "Unidades", "icono": "home",
      "adopta": "departamento",       // opcional: tabla existente
      "titulo": ["piso", "tipologia"],// campos pegados: piso 6 + B = «6B»
      "tituloUnicoDentroDe": "edificio_unidades", // único dentro del edificio
      "visibleAgente": false,         // lo cambia después el administrador
      "campos": [
        { "clave": "piso", "nombre": "Piso", "tipo": "numero" },
        { "clave": "tipologia", "nombre": "Tipología", "tipo": "texto" },
        { "clave": "estado", "nombre": "Estado", "tipo": "seleccion",
          "opciones": [{ "valor": "disponible", "nombre": "Disponible" }] },
        { "clave": "m2_totales", "nombre": "m² totales", "tipo": "calculado",
          "calculo": { "suma": ["m2_cubiertos", "m2_descubiertos"] } }
      ]
    }
  ],
  "relaciones": [
    { "clave": "edificio_unidades", "desde": "edificio", "hacia": "unidad",
      "tipo": "uno_a_muchos", "nombreDesde": "Unidades", "nombreHacia": "Edificio" }
  ]
}
```

Tipos de campo: `texto`, `numero`, `moneda` (en centavos), `fecha`,
`seleccion`, `seleccion_multiple`, `booleano`, `enlace`, `imagen` y
`calculado` (suma de campos, o resumen de una relación: mínimo, máximo, suma,
cantidad o promedio, con filtro opcional).

Relaciones: `uno_a_muchos` (columna `<desde>_id` en la tabla del lado «hacia»)
o `muchos_a_muchos` (tabla `rel_<clave>`). `desde` puede ser `oportunidad` o
`contacto`, del núcleo.

## Interés encadenado y Valor calculado (0049)

Una relación muchos a muchos desde la oportunidad puede llevar `interes`: sus
registros pasan a ser el interés de la oportunidad (las unidades que mira) y se
eligen encadenados a lo que la oportunidad ya tiene en el núcleo.

```jsonc
{ "clave": "oportunidad_unidades", "desde": "oportunidad", "hacia": "unidad",
  "tipo": "muchos_a_muchos", "nombreDesde": "Unidades de interés", "nombreHacia": "Oportunidades",
  "interes": {
    "edificio": "edificio_unidades",          // uno a muchos desde el objeto que adopta `edificio`
    "ambientes": "ambientes",                 // campo numérico de la unidad
    "estado": { "campo": "estado", "valores": ["disponible", "consultar"] },
    "valor": "valor", "moneda": "moneda"      // el Valor de la oportunidad pasa a calcularse
  } }
```

- **Ambientes**: en la oportunidad se ofrecen los que tienen las unidades de
  sus edificios de interés.
- **Unidades**: solo las de esos edificios, con alguno de los ambientes
  elegidos y en un estado de `estado.valores`. Las ya elegidas siempre se ven.
- **Encadenado**: sacar un edificio o un ambiente suelta las unidades que ya no
  coinciden. Sumar (un lead, el agente) nunca suelta.
- **Valor**: promedio del precio de las unidades elegidas; sin elegidas, el de
  las ofrecidas de los ambientes elegidos; sin ambientes, vacío. Con monedas
  distintas, se promedian las de la más repetida. Se recalcula al elegir, al
  cambiar el interés, al editar o importar precios, y al arrancar (sin borrar
  un valor que no se pueda calcular).
- Una sola relación puede tener `interes`. Sin ella, el Valor sigue a mano.

## Adoptar una tabla que ya existe

`"adopta": "<tabla>"` describe una tabla del CRM en vez de crear una nueva:
conserva ids, datos e historial. El motor no cambia su estructura, salvo:

- **`"crear": true`** en un campo: agrega la columna si falta (nunca cambia ni
  borra las que ya están).
- **`"inicial"`** en un campo con `crear`: con qué se completa la columna nueva
  UNA vez, solo donde está vacía. Un valor fijo (`{ "valor": "departamento" }`)
  o copiado de otra columna, con un patrón (expresión regular de Postgres, se
  toma el primer grupo) y/o una tabla de equivalencias:
  `{ "copiarDe": "tipologia", "mapa": { "2_ambientes": 2 } }`. Lo que no
  coincide queda vacío.
- **`"columnaTitulo"`** en el objeto: la columna donde se guarda el nombre
  armado (como `departamento.unidad` = «6B»), para que lo que ya la usa siga
  andando. Se reescribe solo cuando cambia un campo del título.

`"enMenu": false` en un objeto lo saca del menú (sus pantallas siguen andando
por enlace).

## Estadísticas y agente

- `"estadisticas": { "bloques": [...], "verPor": "..." }`: qué bloques muestra
  la sección Oportunidades de Resultados y con qué «Ver por» arranca.
- `"agente"` en un objeto: `filtro`, `agruparPor`, `rangos` e `indicacion` para
  el texto que lee el agente. Qué objetos y columnas lee lo decide el
  administrador desde la tabla.
