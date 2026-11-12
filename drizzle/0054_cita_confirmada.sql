-- 0054 — Inicio: una persona confirma la cita (visita o reunión). Las
-- manuales que ya existían cuentan como confirmadas. Re-ejecutable.
ALTER TABLE "booking" ADD COLUMN IF NOT EXISTS "confirmada_at" timestamp;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN IF NOT EXISTS "confirmada_por_user_id" text REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
UPDATE "booking" SET "confirmada_at" = "created_at"
  WHERE "confirmada_at" IS NULL AND "source" = 'manual' AND "kind" = 'session';
