-- 0058 — Tareas por tipo en la oportunidad: dónde es una visita o una
-- reunión (también en la cita) y la dirección de la oficina. Re-ejecutable.
ALTER TABLE "tarea_venta" ADD COLUMN IF NOT EXISTS "ubicacion" text;--> statement-breakpoint
ALTER TABLE "tarea_venta" ADD COLUMN IF NOT EXISTS "edificio_id" text REFERENCES "edificio"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN IF NOT EXISTS "ubicacion" text;--> statement-breakpoint
ALTER TABLE "ventas_ajustes" ADD COLUMN IF NOT EXISTS "direccion_oficina" text DEFAULT '' NOT NULL;
