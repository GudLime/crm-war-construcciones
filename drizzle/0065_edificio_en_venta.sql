-- 0065 — v3: «En venta» es Sí / No, no un texto. Un edificio con texto
-- queda en Sí; sin texto, en No. Re-ejecutable (solo convierte si sigue siendo texto).
DO $$
BEGIN
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_name = 'edificio' AND column_name = 'en_venta') = 'text' THEN
    ALTER TABLE "edificio" ALTER COLUMN "en_venta" TYPE boolean
      USING (coalesce(btrim("en_venta"), '') <> '');
  END IF;
END $$;--> statement-breakpoint
UPDATE "edificio" SET "en_venta" = false WHERE "en_venta" IS NULL;--> statement-breakpoint
ALTER TABLE "edificio" ALTER COLUMN "en_venta" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "edificio" ALTER COLUMN "en_venta" SET NOT NULL;
