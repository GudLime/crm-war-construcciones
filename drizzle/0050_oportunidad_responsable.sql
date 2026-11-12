-- Visibilidad por rol — el responsable de la oportunidad (un usuario del
-- equipo) pasa al núcleo: el operador ve solo lo suyo. Solo agrega; en una
-- instancia que ya la tenía (War, war_0004) no hace nada. Re-ejecutable.
ALTER TABLE "oportunidad" ADD COLUMN IF NOT EXISTS "responsable_user_id" text REFERENCES "user"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "oportunidad_responsable_idx" ON "oportunidad" ("organization_id", "responsable_user_id");
