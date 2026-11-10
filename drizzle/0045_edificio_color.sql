-- Rediseño (D1) — el color de cada edificio, para sus píldoras. Una clave de
-- la paleta fija (`lib/colores-edificio.ts`). Los existentes reciben colores
-- en orden de creación. Solo agrega. Re-ejecutable.
ALTER TABLE "edificio" ADD COLUMN IF NOT EXISTS "color" text;
--> statement-breakpoint
UPDATE "edificio" e
SET "color" = (ARRAY['violeta','naranja','azul','rosa','cian','ambar'])[((o.n - 1) % 6) + 1]
FROM (
  SELECT "id", row_number() OVER (PARTITION BY "organization_id" ORDER BY "created_at", "id") AS n
  FROM "edificio"
) o
WHERE e."id" = o."id" AND e."color" IS NULL;
