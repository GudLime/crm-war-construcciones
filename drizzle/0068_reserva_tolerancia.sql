-- 071 — Tolerancia de llegada: cuántos minutos se guarda la mesa. NULL = el restaurante no la informa.
ALTER TABLE "reserva_ajustes" ADD COLUMN IF NOT EXISTS "tolerancia_minutos" integer;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "reserva_ajustes" ADD CONSTRAINT "reserva_ajustes_tolerancia" CHECK ("tolerancia_minutos" IS NULL OR "tolerancia_minutos" BETWEEN 1 AND 240);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
