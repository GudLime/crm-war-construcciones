-- 0063 — v3: cada tipo de tarea con su lógica. Re-ejecutable.
-- Los estados: suma «programado» (un WhatsApp o un mail que sale solo a su
-- hora). Las restricciones se rehacen con los tipos de hoy (incluye «tarea»).
ALTER TABLE "tarea_venta" DROP CONSTRAINT IF EXISTS "tarea_venta_tipo_chk";--> statement-breakpoint
ALTER TABLE "tarea_venta" ADD CONSTRAINT "tarea_venta_tipo_chk" CHECK ("tipo" IN ('llamada', 'visita', 'mensaje', 'reunion', 'correo', 'tarea'));--> statement-breakpoint
ALTER TABLE "tarea_venta" DROP CONSTRAINT IF EXISTS "tarea_venta_estado_chk";--> statement-breakpoint
ALTER TABLE "tarea_venta" ADD CONSTRAINT "tarea_venta_estado_chk" CHECK ("estado" IN ('realizar', 'no_responde', 'listo', 'programado'));--> statement-breakpoint
-- Lo que se le manda: el texto del WhatsApp o del mail y el asunto del mail.
ALTER TABLE "tarea_venta" ADD COLUMN IF NOT EXISTS "mensaje" text;--> statement-breakpoint
ALTER TABLE "tarea_venta" ADD COLUMN IF NOT EXISTS "asunto" text;--> statement-breakpoint
-- Cuándo salió y, si no pudo salir (la ventana de 24 h cerrada), por qué.
ALTER TABLE "tarea_venta" ADD COLUMN IF NOT EXISTS "enviada_at" timestamp;--> statement-breakpoint
ALTER TABLE "tarea_venta" ADD COLUMN IF NOT EXISTS "aviso" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tarea_venta_programadas_idx" ON "tarea_venta" ("estado", "fecha") WHERE "estado" = 'programado';
