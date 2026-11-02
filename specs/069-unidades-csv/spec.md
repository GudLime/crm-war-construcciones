# 069 — Lista de precios de un edificio en CSV

Estado: implementado (PR feat/unidades-csv) · Fork: GudLime/crm-war-construcciones

## Qué

- Al **crear** un edificio se puede elegir un CSV con sus unidades.
- En un edificio **existente**, «Importar CSV» empareja las filas con las
  unidades actuales y actualiza precio, estado, metros, etc.
- «Descargar CSV» baja la lista actual con las mismas columnas, para
  editarla en Excel/Sheets y volver a subirla.
- Siempre hay **vista previa** (nuevas, cambios campo por campo, avisos,
  errores, unidades que no vinieron) antes de escribir.

## Reglas (acordadas con Sebastián, 02/11/2026)

- Se empareja por unidad. Si la columna Unidad es solo la letra, se le
  antepone el piso: `1` + `A` = `1A`. La comparación ignora `°`, espacios y
  mayúsculas.
- Celda vacía = no cambiar. `-` en VALOR = sin precio.
- **Estado manda siempre.** INVERSOR = Disponible. Si VALOR trae un estado
  (VENDIDO, RESERVADO) la unidad queda sin precio, y si contradice a Estado
  se avisa en la vista previa (no hay regla especial).
- Terraza se suma a los metros descubiertos.
- Se guardan además dormitorios, baños, toilette y en suite (migración 0031).
  TOTAL, USD/m², Metros valorados y la nota sin título se ignoran.
- Las unidades del CRM que no vienen en el archivo no se tocan (se avisan).
- Moneda: USD si el archivo lo dice (encabezado o precios); si no, la del
  negocio.
- El servidor recalcula la comparación al aplicar (no confía en la vista
  previa del navegador) y escribe todo en una transacción.

## Código

`src/lib/unidades-csv.ts` (puro: leer, comparar, generar) ·
`importarUnidadesCsv` / `exportarUnidadesCsv` en `src/server/ventas.ts` ·
`/api/edificios/[id]/unidades-csv` (GET descarga, POST vista previa/aplicar) ·
`src/components/ventas/importar-unidades.tsx`.

Tests: `tests/unit/unidades-csv.test.ts`, con una planilla **inventada** con
la misma forma que las reales (`tests/fixtures/lista-precios-ejemplo.csv`).
El repo es público: las listas de precios reales no se suben.
