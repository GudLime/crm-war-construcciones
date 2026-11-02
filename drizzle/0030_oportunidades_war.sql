-- 068 — Oportunidades de War. Aditivo y re-ejecutable.
--
-- 1. Tipo de contacto (NULL = sin clasificar).
ALTER TABLE "contact" ADD COLUMN IF NOT EXISTS "tipo_contacto" text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'contact_tipo_contacto_chk'
  ) THEN
    ALTER TABLE "contact" ADD CONSTRAINT "contact_tipo_contacto_chk" CHECK (
      "tipo_contacto" IS NULL OR "tipo_contacto" IN (
        'lead', 'comprador', 'inmobiliaria', 'proveedor', 'propio'
      )
    );
  END IF;
END $$;

-- 2. Varios edificios por oportunidad.
CREATE TABLE IF NOT EXISTS "oportunidad_edificio" (
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "oportunidad_id" text NOT NULL REFERENCES "oportunidad"("id") ON DELETE CASCADE,
  "edificio_id" text NOT NULL REFERENCES "edificio"("id") ON DELETE CASCADE,
  "created_at" timestamp DEFAULT now() NOT NULL,
  PRIMARY KEY ("oportunidad_id", "edificio_id")
);
CREATE INDEX IF NOT EXISTS "oportunidad_edificio_edificio_idx"
  ON "oportunidad_edificio" ("organization_id", "edificio_id");

-- El edificio único que ya tuviera una oportunidad pasa a la tabla nueva.
INSERT INTO "oportunidad_edificio" ("organization_id", "oportunidad_id", "edificio_id")
SELECT "organization_id", "id", "edificio_id" FROM "oportunidad"
WHERE "edificio_id" IS NOT NULL
ON CONFLICT DO NOTHING;

-- 3. Varias tipologías por oportunidad.
CREATE TABLE IF NOT EXISTS "oportunidad_tipologia" (
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "oportunidad_id" text NOT NULL REFERENCES "oportunidad"("id") ON DELETE CASCADE,
  "tipologia" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  PRIMARY KEY ("oportunidad_id", "tipologia"),
  CONSTRAINT "oportunidad_tipologia_chk" CHECK (
    "tipologia" IN ('1_ambiente', '2_ambientes', '3_ambientes', '4_ambientes', 'triplex')
  )
);

-- 4. Una sola oportunidad abierta por contacto.
CREATE UNIQUE INDEX IF NOT EXISTS "oportunidad_una_abierta_uq"
  ON "oportunidad" ("contact_id")
  WHERE "contact_id" IS NOT NULL
    AND "estado" IN (
      'recibido', 'no_responde', 'en_charlas', 'conoce_informacion', 'visito', 'reservo'
    );
