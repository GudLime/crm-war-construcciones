-- War — Historial de oportunidades (para estadísticas), «sin respuesta»,
-- Ajustes → Ventas y notas unificadas. Re-ejecutable.

-- 1. «No responde» deja de ser un estado: es una marca que se calcula.
UPDATE "oportunidad" SET "estado" = 'recibido' WHERE "estado" = 'no_responde';

-- 2. Columnas nuevas de la oportunidad.
ALTER TABLE "oportunidad" ADD COLUMN IF NOT EXISTS "estado_desde" timestamp;
ALTER TABLE "oportunidad" ADD COLUMN IF NOT EXISTS "cerrada_at" timestamp;
ALTER TABLE "oportunidad" ADD COLUMN IF NOT EXISTS "intentos_sin_respuesta" integer DEFAULT 0 NOT NULL;
ALTER TABLE "oportunidad" ADD COLUMN IF NOT EXISTS "ultimo_intento_at" timestamp;
ALTER TABLE "oportunidad" ADD COLUMN IF NOT EXISTS "ultima_respuesta_at" timestamp;
ALTER TABLE "oportunidad" ADD COLUMN IF NOT EXISTS "primer_contacto_at" timestamp;
ALTER TABLE "oportunidad" ADD COLUMN IF NOT EXISTS "primera_respuesta_at" timestamp;
UPDATE "oportunidad" SET "estado_desde" = "updated_at" WHERE "estado_desde" IS NULL;
ALTER TABLE "oportunidad" ALTER COLUMN "estado_desde" SET DEFAULT now();
ALTER TABLE "oportunidad" ALTER COLUMN "estado_desde" SET NOT NULL;
UPDATE "oportunidad" SET "cerrada_at" = "updated_at"
WHERE "cerrada_at" IS NULL AND "estado" IN ('compro', 'perdido', 'no_calificado');

-- 3. El historial.
CREATE TABLE IF NOT EXISTS "oportunidad_evento" (
  "id" text PRIMARY KEY,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "oportunidad_id" text NOT NULL REFERENCES "oportunidad"("id") ON DELETE CASCADE,
  "contact_id" text REFERENCES "contact"("id") ON DELETE SET NULL,
  "tipo" text NOT NULL,
  "estado_desde" text,
  "estado_hasta" text,
  "resultado" text,
  "motivo" text,
  "segundos_en_estado_anterior" integer,
  "intentos_sin_respuesta" integer,
  "origen" text,
  "edificio_id" text REFERENCES "edificio"("id") ON DELETE SET NULL,
  "tipo_oportunidad" text,
  "fuente" text NOT NULL,
  "actor_user_id" text REFERENCES "user"("id") ON DELETE SET NULL,
  "datos" jsonb,
  "occurred_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "oportunidad_evento_op_idx"
  ON "oportunidad_evento" ("organization_id", "oportunidad_id", "occurred_at");
CREATE INDEX IF NOT EXISTS "oportunidad_evento_tipo_idx"
  ON "oportunidad_evento" ("organization_id", "tipo", "occurred_at");

-- 3b. Punto de partida: un «creada» por oportunidad existente, con su fecha
--     real y su estado de hoy (los pasos intermedios no se pueden recuperar).
--     Las cerradas suman su «cerrada». Solo si todavía no tienen historial.
INSERT INTO "oportunidad_evento"
  ("id", "organization_id", "oportunidad_id", "contact_id", "tipo", "estado_hasta",
   "origen", "edificio_id", "tipo_oportunidad", "fuente", "occurred_at")
SELECT 'oev_m' || substr(md5(o."id"), 1, 20), o."organization_id", o."id", o."contact_id",
       'creada', o."estado", o."origen", o."edificio_id", o."tipo", 'migracion', o."created_at"
FROM "oportunidad" o
WHERE NOT EXISTS (SELECT 1 FROM "oportunidad_evento" e WHERE e."oportunidad_id" = o."id");

INSERT INTO "oportunidad_evento"
  ("id", "organization_id", "oportunidad_id", "contact_id", "tipo", "estado_hasta",
   "resultado", "motivo", "origen", "edificio_id", "tipo_oportunidad", "fuente", "occurred_at")
SELECT 'oev_c' || substr(md5(o."id"), 1, 20), o."organization_id", o."id", o."contact_id",
       'cerrada', o."estado",
       CASE o."estado" WHEN 'compro' THEN 'ganada' WHEN 'no_calificado' THEN 'no_calificado' ELSE 'perdida' END,
       o."motivo_cierre", o."origen", o."edificio_id", o."tipo", 'migracion', o."cerrada_at"
FROM "oportunidad" o
WHERE o."estado" IN ('compro', 'perdido', 'no_calificado')
  AND NOT EXISTS (
    SELECT 1 FROM "oportunidad_evento" e WHERE e."oportunidad_id" = o."id" AND e."tipo" = 'cerrada'
  );

-- 4. Ajustes → Ventas.
CREATE TABLE IF NOT EXISTS "ventas_ajustes" (
  "organization_id" text PRIMARY KEY REFERENCES "organization"("id") ON DELETE CASCADE,
  "sin_respuesta_intentos" integer DEFAULT 3 NOT NULL,
  "sin_respuesta_dias" integer DEFAULT 7 NOT NULL,
  "sin_respuesta_modo" text DEFAULT 'cerrar' NOT NULL,
  "reapertura_dias" integer DEFAULT 120 NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- 5. Notas unificadas: cada nota es de un contacto y queda asociada a la
--    oportunidad que estaba abierta cuando se escribió.
ALTER TABLE "conversation_note" ALTER COLUMN "conversation_id" DROP NOT NULL;
ALTER TABLE "conversation_note" ADD COLUMN IF NOT EXISTS "contact_id" text;
ALTER TABLE "conversation_note" ADD COLUMN IF NOT EXISTS "oportunidad_id" text;
DO $$ BEGIN
  ALTER TABLE "conversation_note" ADD CONSTRAINT "conversation_note_contact_fk"
    FOREIGN KEY ("contact_id") REFERENCES "contact"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "conversation_note" ADD CONSTRAINT "conversation_note_oportunidad_fk"
    FOREIGN KEY ("oportunidad_id") REFERENCES "oportunidad"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "conversation_note_contacto_idx"
  ON "conversation_note" ("organization_id", "contact_id", "created_at");
CREATE INDEX IF NOT EXISTS "conversation_note_oportunidad_idx"
  ON "conversation_note" ("organization_id", "oportunidad_id", "created_at");

UPDATE "conversation_note" n
SET "contact_id" = c."contact_id"
FROM "conversation" c
WHERE n."contact_id" IS NULL AND c."id" = n."conversation_id";

-- La oportunidad de cada nota vieja: la más reciente del contacto creada
-- antes de la nota.
UPDATE "conversation_note" n
SET "oportunidad_id" = (
  SELECT o."id" FROM "oportunidad" o
  WHERE o."contact_id" = n."contact_id"
    AND o."organization_id" = n."organization_id"
    AND o."created_at" <= n."created_at"
  ORDER BY o."created_at" DESC
  LIMIT 1
)
WHERE n."oportunidad_id" IS NULL AND n."contact_id" IS NOT NULL;
