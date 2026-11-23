-- 0060 — Asignaciones: quién asignó cada oportunidad y cómo, y quién recibe
-- en la mesa de reparto (en qué orden). Re-ejecutable.
ALTER TABLE "oportunidad" ADD COLUMN IF NOT EXISTS "asignada_por" text;--> statement-breakpoint
ALTER TABLE "oportunidad" ADD COLUMN IF NOT EXISTS "asignada_por_user_id" text REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "ventas_ajustes" ADD COLUMN IF NOT EXISTS "asignacion_vendedores" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "oportunidad_org_responsable_idx" ON "oportunidad" ("organization_id","responsable_user_id");
