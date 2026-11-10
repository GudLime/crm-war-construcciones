-- Rediseño (D2–D4) — Ambientes de interés (números) y tipologías de interés
-- (unidades tipo «1A», «2B») de una oportunidad, y la unidad tipo de cada
-- departamento. Pasa lo de `oportunidad_tipologia` («N ambientes» → N,
-- «triplex» → 4) sin borrar esa tabla. Solo agrega. Re-ejecutable.
ALTER TABLE "departamento" ADD COLUMN IF NOT EXISTS "tipologia_unidad" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "oportunidad_ambiente" (
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "oportunidad_id" text NOT NULL REFERENCES "oportunidad"("id") ON DELETE CASCADE,
  "ambientes" integer NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY ("oportunidad_id", "ambientes")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "oportunidad_tipologia_unidad" (
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "oportunidad_id" text NOT NULL REFERENCES "oportunidad"("id") ON DELETE CASCADE,
  "tipologia" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY ("oportunidad_id", "tipologia")
);
--> statement-breakpoint
INSERT INTO "oportunidad_ambiente" ("organization_id", "oportunidad_id", "ambientes")
SELECT "organization_id", "oportunidad_id",
  CASE "tipologia"
    WHEN '1_ambiente' THEN 1
    WHEN '2_ambientes' THEN 2
    WHEN '3_ambientes' THEN 3
    WHEN '4_ambientes' THEN 4
    WHEN 'triplex' THEN 4
  END
FROM "oportunidad_tipologia"
WHERE "tipologia" IN ('1_ambiente', '2_ambientes', '3_ambientes', '4_ambientes', 'triplex')
ON CONFLICT DO NOTHING;
