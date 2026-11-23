-- 071 — Contactos de un restaurante: umbral de Habitual y «Acepta promociones».
ALTER TABLE "reserva_ajustes" ADD COLUMN IF NOT EXISTS "umbral_habitual" integer DEFAULT 3 NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "reserva_ajustes" ADD CONSTRAINT "reserva_ajustes_umbral" CHECK ("umbral_habitual" BETWEEN 2 AND 100);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reserva_comensal" (
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "contact_id" text NOT NULL REFERENCES "contact"("id") ON DELETE CASCADE,
  "acepta_promociones" boolean DEFAULT false NOT NULL,
  "acepta_promociones_at" timestamp,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "reserva_comensal_unico" ON "reserva_comensal" ("organization_id", "contact_id");
