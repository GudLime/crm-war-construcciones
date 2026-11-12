-- 0053 — Inicio: desde cuándo la lleva su responsable («asignada hace X»).
-- Las que ya tenían responsable toman la fecha de creación. Re-ejecutable.
ALTER TABLE "oportunidad" ADD COLUMN IF NOT EXISTS "responsable_desde" timestamp;--> statement-breakpoint
UPDATE "oportunidad" SET "responsable_desde" = "created_at"
  WHERE "responsable_desde" IS NULL AND ("responsable_user_id" IS NOT NULL OR "responsable_ia" = true);
