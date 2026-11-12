-- 0051 — Asignación automática de los leads de Meta por edificio, y
-- oportunidades a cargo del agente de IA. Re-ejecutable.
ALTER TABLE "oportunidad" ADD COLUMN IF NOT EXISTS "responsable_ia" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ventas_ajustes" ADD COLUMN IF NOT EXISTS "asignacion_activa" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ventas_ajustes" ADD COLUMN IF NOT EXISTS "asignacion_por_edificio" jsonb DEFAULT '{}'::jsonb NOT NULL;
