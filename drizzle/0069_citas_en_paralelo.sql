-- 0069 — Citas en paralelo (pedido de WAR, 26/11): un negocio con varias
-- personas atiende dos visitas a la misma hora. Es un ajuste de la agenda,
-- apagado por defecto. La llave única de la agenda queda solo para lo que
-- reserva el agente (cierra su carrera); lo manual se valida en el código.
ALTER TABLE "calendar_settings" ADD COLUMN IF NOT EXISTS "citas_en_paralelo" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
DROP INDEX IF EXISTS "booking_org_active_slot_uq";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "booking_org_active_slot_ai_uq" ON "booking" USING btree ("organization_id","scheduled_at") WHERE "booking"."status" in ('agendada','realizada') and "booking"."is_test" = false and "booking"."source" = 'ai';
