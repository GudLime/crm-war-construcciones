-- Motor de objetos personalizados — campos de archivos (galería de fotos JPG,
-- video MP4, documento PDF). Los binarios van al volumen de medios; acá queda
-- quién es cada uno. Solo agrega. Re-ejecutable.
CREATE TABLE IF NOT EXISTS "motor_archivo" (
  "id" text PRIMARY KEY,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "tipo" text NOT NULL,
  "mime" text NOT NULL,
  "nombre" text,
  "bytes" integer NOT NULL,
  "ruta" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "motor_archivo_org_idx" ON "motor_archivo" ("organization_id", "created_at");
--> statement-breakpoint
ALTER TABLE "motor_campo" ADD COLUMN IF NOT EXISTS "limites" jsonb;
