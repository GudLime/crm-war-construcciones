-- 0071 — v6: cada persona ordena sus pestañas de vistas (arrastrándolas). La
-- lista guarda los ids en orden, «Todas» y las de fábrica incluidas; la
-- primera es la vista por defecto cuando no hay una última para recordar.
CREATE TABLE IF NOT EXISTS "vista_orden" (
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE cascade,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
  "pagina" text NOT NULL,
  "ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "vista_orden_pk" PRIMARY KEY ("organization_id", "user_id", "pagina")
);
