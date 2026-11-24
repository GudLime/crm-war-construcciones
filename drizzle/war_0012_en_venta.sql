-- War — v3: «En venta» Sí / No por edificio (decidido 24/11). A la venta:
-- Olazábal, Gallo, Lavalle y Urquiza 1872; todos los demás, No. Re-ejecutable.
UPDATE "edificio" SET "en_venta" = (
  "nombre" ILIKE '%olaz_bal%'
  OR "nombre" ILIKE '%gallo%'
  OR "nombre" ILIKE '%lavalle%'
  OR ("nombre" ILIKE '%urquiza%' AND ("nombre" LIKE '%1872%' OR coalesce("direccion", '') LIKE '%1872%'))
);
