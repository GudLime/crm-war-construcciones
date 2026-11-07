-- War — Motivos de cierre configurables (Ajustes → Motivos de cierre).
-- Migración propia de WAR (no viene de GudLime): su `when` va apenas después
-- de la última de GudLime para que las próximas de GudLime (+3 h) no queden
-- antes y se salteen. Re-ejecutable.
CREATE TABLE IF NOT EXISTS "motivo_cierre" (
  "id" text PRIMARY KEY,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "nombre" text NOT NULL,
  "orden" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "motivo_cierre_org_nombre_uq" ON "motivo_cierre" ("organization_id", "nombre");
--> statement-breakpoint
-- Los 27 de Notion en cada organización que todavía no tenga ninguno.
INSERT INTO "motivo_cierre" ("id", "organization_id", "nombre", "orden")
SELECT 'mci_' || substr(md5(random()::text || o."id" || d."nombre"), 1, 20), o."id", d."nombre", d."orden"
FROM "organization" o
CROSS JOIN (VALUES
  ('Compró', 0),
  ('Compró en otro lado', 1),
  ('Compró con una inmobiliaria', 2),
  ('Presupuesto insuficiente', 3),
  ('Crédito hipotecario', 4),
  ('Cuotas a largo plazo', 5),
  ('Ofrece propiedad en forma de pago', 6),
  ('Busca menos metros', 7),
  ('Busca más metros', 8),
  ('Busca de pozo', 9),
  ('Busca terminado', 10),
  ('Busca con amenities', 11),
  ('Busca sin amenities', 12),
  ('Busca alquiler', 13),
  ('No le gusta la zona', 14),
  ('No tenemos disponibilidad', 15),
  ('No tenemos el producto que busca', 16),
  ('No responde', 17),
  ('Número incorrecto', 18),
  ('Solo pidió info', 19),
  ('Confunde el anuncio', 20),
  ('Pausó la búsqueda', 21),
  ('Depende de la venta', 22),
  ('Incertidumbre', 23),
  ('Incertidumbre política', 24),
  ('Proveedor', 25),
  ('Chusma de barrio', 26)
) AS d("nombre", "orden")
WHERE NOT EXISTS (SELECT 1 FROM "motivo_cierre" m WHERE m."organization_id" = o."id")
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- «Busca de Pozo» (Notion) y «Busca de pozo» (CRM) son el mismo.
UPDATE "oportunidad" SET "motivo_cierre" = 'Busca de pozo' WHERE "motivo_cierre" = 'Busca de Pozo';
--> statement-breakpoint
UPDATE "oportunidad" SET "motivo_cierre" = 'Número incorrecto' WHERE "motivo_cierre" = 'Numero incorrecto';
