-- 071 — Sectores del local como lista propia (Configuración → Sectores).
CREATE TABLE IF NOT EXISTS "reserva_sector" (
  "id" text PRIMARY KEY,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "nombre" text NOT NULL,
  "orden" integer DEFAULT 0 NOT NULL,
  CONSTRAINT "reserva_sector_nombre" CHECK (length(btrim("nombre")) > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "reserva_sector_unico" ON "reserva_sector" ("organization_id", "nombre");
--> statement-breakpoint
-- Los sectores que ya tenían mesas pasan a ser sectores de la lista.
INSERT INTO "reserva_sector" ("id", "organization_id", "nombre", "orden")
SELECT 'rse_' || substr(md5(random()::text || c."organization_id" || c."sector"), 1, 21), c."organization_id", c."sector", min(c."orden")
FROM "reserva_cupo" c
GROUP BY c."organization_id", c."sector"
ON CONFLICT DO NOTHING;
