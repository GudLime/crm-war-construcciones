-- War — Datos personales del contacto (punto 5 de la checklist de Notion):
-- DNI, CUIL/CUIT, nacimiento, dirección, género, newsletter, ID de Google
-- Contacts y parientes. En tablas propias de WAR para no tocar `contact`
-- (núcleo). Migración propia de WAR: ver WAR.md. Re-ejecutable.
CREATE TABLE IF NOT EXISTS "contacto_datos" (
  "contact_id" text PRIMARY KEY REFERENCES "contact"("id") ON DELETE CASCADE,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "dni" text,
  "cuil" text,
  "nacimiento" date,
  "direccion" text,
  "genero" text,
  "newsletter" boolean DEFAULT false NOT NULL,
  "google_contact_id" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contacto_datos_org_idx" ON "contacto_datos" ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contacto_datos_dni_idx" ON "contacto_datos" ("organization_id", "dni");
--> statement-breakpoint
-- Parientes: un vínculo por par (contact_a < contact_b), se ve desde los dos.
CREATE TABLE IF NOT EXISTS "contacto_pariente" (
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "contact_a" text NOT NULL REFERENCES "contact"("id") ON DELETE CASCADE,
  "contact_b" text NOT NULL REFERENCES "contact"("id") ON DELETE CASCADE,
  "relacion" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  PRIMARY KEY ("contact_a", "contact_b"),
  CHECK ("contact_a" < "contact_b")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contacto_pariente_b_idx" ON "contacto_pariente" ("contact_b");
