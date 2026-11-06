-- War — Orígenes de las oportunidades, configurables (Ajustes → Orígenes).
-- Nombre + ícono por organización. Re-ejecutable.
CREATE TABLE IF NOT EXISTS "origen_oportunidad" (
  "id" text PRIMARY KEY,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "nombre" text NOT NULL,
  "icono" text DEFAULT 'tag' NOT NULL,
  "orden" integer DEFAULT 0 NOT NULL,
  "imagen_mime" text,
  "imagen_version" bigint,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "origen_oportunidad_org_nombre_uq"
  ON "origen_oportunidad" ("organization_id", "nombre");
CREATE INDEX IF NOT EXISTS "origen_oportunidad_org_orden_idx"
  ON "origen_oportunidad" ("organization_id", "orden");

-- Los de siempre (la lista fija que había hasta ahora), en cada organización
-- que todavía no tenga ninguno. Mismo orden e íconos que ORIGENES_POR_DEFECTO.
INSERT INTO "origen_oportunidad" ("id", "organization_id", "nombre", "icono", "orden")
SELECT 'ori_' || substr(md5(random()::text || o."id" || d."nombre"), 1, 20),
       o."id", d."nombre", d."icono", d."orden"
FROM "organization" o
CROSS JOIN (VALUES
  ('Newsletter', 'newspaper', 0),
  ('MercadoLibre', 'shopping-bag', 1),
  ('Argenprop', 'building', 2),
  ('Zonaprop', 'building-2', 3),
  ('Página Web', 'globe', 4),
  ('Google Ads', 'megaphone', 5),
  ('Referido', 'user-plus', 6),
  ('Cartel', 'signpost', 7),
  ('Meta Ads', 'target', 8),
  ('Facebook', 'facebook', 9),
  ('Instagram', 'instagram', 10),
  ('Cartel Showroom', 'store', 11),
  ('Inmobiliaria', 'key-round', 12),
  ('Google', 'search', 13),
  ('Mail', 'mail', 14),
  ('Tik Tok', 'music', 15)
) AS d("nombre", "icono", "orden")
WHERE NOT EXISTS (
  SELECT 1 FROM "origen_oportunidad" x WHERE x."organization_id" = o."id"
)
ON CONFLICT DO NOTHING;
