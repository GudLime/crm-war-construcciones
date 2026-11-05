-- War — Leads de formularios (Make) y teléfonos en E.164. Re-ejecutable.

-- 1. Una persona puede tener varias oportunidades abiertas (una por edificio):
--    el lead de un formulario de otro edificio abre la suya.
DROP INDEX IF EXISTS "oportunidad_una_abierta_uq";

-- 2. Última interacción del interesado: ordena la lista de oportunidades.
ALTER TABLE "oportunidad" ADD COLUMN IF NOT EXISTS "ultima_interaccion" timestamp;
UPDATE "oportunidad" SET "ultima_interaccion" = "updated_at" WHERE "ultima_interaccion" IS NULL;
ALTER TABLE "oportunidad" ALTER COLUMN "ultima_interaccion" SET DEFAULT now();
ALTER TABLE "oportunidad" ALTER COLUMN "ultima_interaccion" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "oportunidad_org_ultima_idx"
  ON "oportunidad" ("organization_id", "ultima_interaccion");

-- 3. Cada formulario recibido, con su lead ID (idempotencia de Make).
CREATE TABLE IF NOT EXISTS "oportunidad_lead" (
  "id" text PRIMARY KEY,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "oportunidad_id" text NOT NULL REFERENCES "oportunidad"("id") ON DELETE CASCADE,
  "contact_id" text REFERENCES "contact"("id") ON DELETE SET NULL,
  "lead_id" text NOT NULL,
  "origen" text NOT NULL,
  "edificio_id" text REFERENCES "edificio"("id") ON DELETE SET NULL,
  "telefono_crudo" text,
  "campaign_id" text,
  "campaign_name" text,
  "adset_id" text,
  "adset_name" text,
  "ad_id" text,
  "ad_name" text,
  "form_id" text,
  "form_name" text,
  "plataforma" text,
  "respuestas" jsonb,
  "recibido_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "oportunidad_lead_org_lead_uq"
  ON "oportunidad_lead" ("organization_id", "lead_id");
CREATE INDEX IF NOT EXISTS "oportunidad_lead_oportunidad_idx"
  ON "oportunidad_lead" ("organization_id", "oportunidad_id");

-- 4. Celulares argentinos cargados sin el 9 (`54` + 10 dígitos) pasan a E.164
--    (`549` + 10), que es como WhatsApp reporta a esa persona. Solo si no
--    hay ya otro contacto con ese número: esos se dejan para unir a mano.
UPDATE "contact" c
SET "phone" = '549' || substr(c."phone", 3),
    "updated_at" = now()
WHERE c."channel" = 'whatsapp'
  AND c."phone" ~ '^54[0-8][0-9]{9}$'
  AND NOT EXISTS (
    SELECT 1 FROM "contact" o
    WHERE o."organization_id" = c."organization_id"
      AND o."channel" = 'whatsapp'
      AND o."id" <> c."id"
      AND (o."phone" = '549' || substr(c."phone", 3)
           OR o."wa_identity" = '549' || substr(c."phone", 3))
  );

UPDATE "contact" c
SET "wa_identity" = '549' || substr(c."wa_identity", 3),
    "updated_at" = now()
WHERE c."channel" = 'whatsapp'
  AND c."wa_identity" ~ '^54[0-8][0-9]{9}$'
  AND NOT EXISTS (
    SELECT 1 FROM "contact" o
    WHERE o."organization_id" = c."organization_id"
      AND o."channel" = 'whatsapp'
      AND o."id" <> c."id"
      AND o."wa_identity" = '549' || substr(c."wa_identity", 3)
  );
