-- War — Qué se importó de afuera (Notion) y en qué registro del CRM quedó.
-- Hace repetible la importación: lo que ya entró no se vuelve a crear.
-- Migración propia de WAR: ver WAR.md. Re-ejecutable.
CREATE TABLE IF NOT EXISTS "importacion_externa" (
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "fuente" text NOT NULL,
  "clave" text NOT NULL,
  "tipo" text NOT NULL,
  "crm_id" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  PRIMARY KEY ("organization_id", "fuente", "clave")
);
