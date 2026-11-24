-- 0066 — v4: el tipo de contacto pasa a ser una lista (selección múltiple).
-- Lo que la persona es: cliente, proveedor, inquilino, inmobiliaria, propio.
-- Lo que busca va en el tipo de la oportunidad (venta, alquiler, inmobiliaria).
-- Re-ejecutable.
ALTER TABLE "contact" ADD COLUMN IF NOT EXISTS "tipos_contacto" text[] NOT NULL DEFAULT '{}'::text[];--> statement-breakpoint
-- Comprador pasa a Cliente; el resto pasa igual. «Lead» no es un tipo: queda
-- en `tipo_contacto` hasta que el arranque le arme su oportunidad de Venta.
UPDATE "contact" SET "tipos_contacto" = ARRAY[
    CASE "tipo_contacto" WHEN 'comprador' THEN 'cliente' ELSE "tipo_contacto" END
  ]::text[]
  WHERE "tipo_contacto" IN ('comprador', 'inmobiliaria', 'proveedor', 'propio')
    AND "tipos_contacto" = '{}'::text[];--> statement-breakpoint
UPDATE "contact" SET "tipo_contacto" = NULL
  WHERE "tipo_contacto" IN ('comprador', 'inmobiliaria', 'proveedor', 'propio');--> statement-breakpoint
-- Los Lead con una oportunidad abierta sin tipo: esa oportunidad es de Venta.
UPDATE "oportunidad" o SET "tipo" = 'venta'
  FROM "contact" c
  WHERE o."contact_id" = c."id" AND c."tipo_contacto" = 'lead' AND o."tipo" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contact_tipos_contacto_idx" ON "contact" USING gin ("tipos_contacto");
