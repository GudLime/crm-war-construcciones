-- v7 — El lector lee cada ráfaga y no la pierde con un deploy: lo pendiente
-- queda anotado en la conversación, y hasta dónde leyó, para no releer.
ALTER TABLE "conversation" ADD COLUMN IF NOT EXISTS "lector_pendiente_desde" timestamp;
ALTER TABLE "conversation" ADD COLUMN IF NOT EXISTS "lector_leido_hasta" timestamp;
CREATE INDEX IF NOT EXISTS "conversation_lector_pendiente_idx" ON "conversation" ("lector_pendiente_desde") WHERE "lector_pendiente_desde" IS NOT NULL;
