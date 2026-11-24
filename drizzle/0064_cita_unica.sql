-- 0064 — v3: Visita y Reunión son una sola cita (la de la Agenda). La cita
-- guarda si es visita (en un edificio) o reunión (en la oficina), el edificio
-- de la visita y quién la atiende. Re-ejecutable.
ALTER TABLE "booking" ADD COLUMN IF NOT EXISTS "modo" text;--> statement-breakpoint
ALTER TABLE "booking" DROP CONSTRAINT IF EXISTS "booking_modo_chk";--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_modo_chk" CHECK ("modo" IS NULL OR "modo" IN ('visita', 'reunion'));--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN IF NOT EXISTS "edificio_id" text REFERENCES "edificio"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN IF NOT EXISTS "responsable_user_id" text REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
-- Las que ya existen: con la ubicación de la oficina son reuniones; el resto, visitas.
UPDATE "booking" b SET "modo" = CASE
    WHEN va."direccion_oficina" <> '' AND b."ubicacion" = va."direccion_oficina" THEN 'reunion'
    ELSE 'visita'
  END
  FROM "ventas_ajustes" va
  WHERE b."modo" IS NULL AND b."kind" = 'session' AND va."organization_id" = b."organization_id";--> statement-breakpoint
UPDATE "booking" SET "modo" = 'visita' WHERE "modo" IS NULL AND "kind" = 'session';
