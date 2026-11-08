-- War — Responsable de la oportunidad (un usuario del equipo). Viene de la
-- columna «Responsable» de Notion. Migración propia de WAR: ver WAR.md.
-- Re-ejecutable.
ALTER TABLE "oportunidad" ADD COLUMN IF NOT EXISTS "responsable_user_id" text REFERENCES "user"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "oportunidad_responsable_idx" ON "oportunidad" ("organization_id", "responsable_user_id");
