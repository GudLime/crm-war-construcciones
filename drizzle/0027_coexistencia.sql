-- 067: coexistencia (el número sigue en la app WhatsApp Business del teléfono).
-- Aditiva y re-ejecutable: una conexión existente queda con coexistence=false.
ALTER TABLE "meta_credentials" ADD COLUMN IF NOT EXISTS "coexistence" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "meta_credentials" ADD COLUMN IF NOT EXISTS "coexistence_since" timestamp;--> statement-breakpoint
ALTER TABLE "meta_credentials" ADD COLUMN IF NOT EXISTS "contacts_sync_request_id" text;--> statement-breakpoint
ALTER TABLE "meta_credentials" ADD COLUMN IF NOT EXISTS "history_sync_request_id" text;--> statement-breakpoint
ALTER TABLE "meta_credentials" ADD COLUMN IF NOT EXISTS "history_sync_status" text;--> statement-breakpoint
ALTER TABLE "meta_credentials" ADD COLUMN IF NOT EXISTS "history_sync_progress" integer;
