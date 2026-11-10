-- Rediseño (PR 6) — responsable de cada tarea (null = sin asignar). Solo
-- agrega. Re-ejecutable.
ALTER TABLE "tarea_venta" ADD COLUMN IF NOT EXISTS "responsable_user_id" text REFERENCES "user"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tarea_venta_responsable_idx" ON "tarea_venta" ("organization_id", "responsable_user_id");
