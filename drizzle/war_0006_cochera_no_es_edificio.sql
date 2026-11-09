-- War — Corrección de la importación de Notion: «Cochera» entró como
-- edificio, pero es un tipo de unidad. A cada oportunidad que lo tenía se le
-- deja la nota «[Notion] Interés: cochera», su edificio principal pasa a otro
-- de los que tenga (o ninguno) y el edificio «Cochera» se borra, solo si no
-- tiene unidades cargadas. Re-ejecutable: después de borrarlo no hace nada.
-- Migración propia de WAR: ver WAR.md.
INSERT INTO "conversation_note" ("id", "organization_id", "contact_id", "oportunidad_id", "texto", "created_at")
SELECT 'cn_cochera_' || substr(md5(o."id"), 1, 16), o."organization_id", o."contact_id", o."id", '[Notion] Interés: cochera', o."created_at"
FROM "oportunidad" o
WHERE o."id" IN (
    SELECT oe."oportunidad_id" FROM "oportunidad_edificio" oe JOIN "edificio" e ON e."id" = oe."edificio_id"
    WHERE lower(trim(e."nombre")) = 'cochera'
      AND NOT EXISTS (SELECT 1 FROM "departamento" d WHERE d."edificio_id" = e."id")
    UNION
    SELECT o2."id" FROM "oportunidad" o2 JOIN "edificio" e ON e."id" = o2."edificio_id"
    WHERE lower(trim(e."nombre")) = 'cochera'
      AND NOT EXISTS (SELECT 1 FROM "departamento" d WHERE d."edificio_id" = e."id")
  )
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE "oportunidad" o
SET "edificio_id" = (
  SELECT oe."edificio_id" FROM "oportunidad_edificio" oe
  WHERE oe."oportunidad_id" = o."id" AND oe."edificio_id" <> o."edificio_id"
  ORDER BY oe."created_at" LIMIT 1
)
WHERE o."edificio_id" IN (
  SELECT e."id" FROM "edificio" e
  WHERE lower(trim(e."nombre")) = 'cochera'
    AND NOT EXISTS (SELECT 1 FROM "departamento" d WHERE d."edificio_id" = e."id")
);
--> statement-breakpoint
-- Borra el edificio: los vínculos con oportunidades se van con él (cascade) y
-- el historial y los leads quedan sin edificio (set null).
DELETE FROM "edificio" e
WHERE lower(trim(e."nombre")) = 'cochera'
  AND NOT EXISTS (SELECT 1 FROM "departamento" d WHERE d."edificio_id" = e."id");
