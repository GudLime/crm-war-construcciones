-- 0059 — Plantillas de tareas sugeridas por etapa y descartes. Re-ejecutable.
CREATE TABLE IF NOT EXISTS "tarea_plantilla" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "nombre" text NOT NULL,
  "tipo" text NOT NULL,
  "situacion" text NOT NULL,
  "dias_sin_respuesta" integer,
  "vence" text DEFAULT 'hoy' NOT NULL,
  "mensaje" text,
  "activa" boolean DEFAULT true NOT NULL,
  "orden" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tarea_plantilla_org_idx" ON "tarea_plantilla" ("organization_id","orden");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "oportunidad_sugerencia_descartada" (
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "oportunidad_id" text NOT NULL REFERENCES "oportunidad"("id") ON DELETE CASCADE,
  "plantilla_id" text NOT NULL REFERENCES "tarea_plantilla"("id") ON DELETE CASCADE,
  "estado" text NOT NULL,
  "user_id" text REFERENCES "user"("id") ON DELETE SET NULL,
  "at" timestamp DEFAULT now() NOT NULL,
  PRIMARY KEY ("oportunidad_id","plantilla_id")
);--> statement-breakpoint
ALTER TABLE "tarea_venta" ADD COLUMN IF NOT EXISTS "plantilla_id" text;--> statement-breakpoint
ALTER TABLE "ventas_ajustes" ADD COLUMN IF NOT EXISTS "plantillas_sembradas" boolean DEFAULT false NOT NULL;
