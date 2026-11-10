-- Rediseño (D5) — vistas guardadas por página (pestañas con filtros, orden,
-- columnas y anchos), del equipo (user_id null) o de una persona, y la última
-- que usó cada uno. «Todas» y «Para cerrar» vienen de fábrica (no se
-- guardan). Solo agrega. Re-ejecutable.
CREATE TABLE IF NOT EXISTS "vista_guardada" (
  "id" text PRIMARY KEY,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "user_id" text REFERENCES "user"("id") ON DELETE CASCADE,
  "pagina" text NOT NULL,
  "nombre" text NOT NULL,
  "filtros" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "orden" jsonb,
  "columnas" jsonb,
  "anchos" jsonb,
  "posicion" integer NOT NULL DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vista_guardada_org_pagina_idx" ON "vista_guardada" ("organization_id", "pagina");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vista_ultima" (
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "pagina" text NOT NULL,
  "vista_id" text,
  "updated_at" timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY ("organization_id", "user_id", "pagina")
);
