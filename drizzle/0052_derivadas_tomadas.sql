-- 0052 — Inicio: las derivaciones de la IA son del equipo hasta que alguien
-- las toma. Quién y cuándo, y el resumen del motivo que deja el agente.
-- Re-ejecutable.
ALTER TABLE "conversation" ADD COLUMN IF NOT EXISTS "handoff_resumen" text;--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN IF NOT EXISTS "tomada_por_user_id" text REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN IF NOT EXISTS "tomada_at" timestamp;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversation_org_handoff_idx" ON "conversation" ("organization_id","handoff_at");
