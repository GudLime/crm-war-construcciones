-- 0062 — Las derivaciones de la IA crean una tarea (cambios 23/11, punto 6):
-- quién creó cada tarea, la conversación derivada y a quién van. Re-ejecutable.
ALTER TABLE "tarea_venta" ADD COLUMN IF NOT EXISTS "creada_por" text DEFAULT 'persona' NOT NULL;--> statement-breakpoint
ALTER TABLE "tarea_venta" ADD COLUMN IF NOT EXISTS "conversation_id" text;--> statement-breakpoint
ALTER TABLE "ventas_ajustes" ADD COLUMN IF NOT EXISTS "derivaciones_responsable_user_id" text REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
UPDATE "tarea_venta" SET "creada_por" = 'plantilla' WHERE "plantilla_id" IS NOT NULL AND "creada_por" = 'persona';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tarea_venta_conversation_idx" ON "tarea_venta" ("organization_id","conversation_id");
