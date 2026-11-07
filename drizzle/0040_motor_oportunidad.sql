-- Motor de objetos personalizados — la oportunidad y los objetos (paso 5).
-- Solo agrega. Re-ejecutable.

-- Relaciones muchos a muchos: tabla intermedia adoptada, columnas propias y
-- siembra de una sola vez desde una columna existente.
ALTER TABLE "motor_relacion" ADD COLUMN IF NOT EXISTS "adopta_tabla" boolean DEFAULT false NOT NULL;
ALTER TABLE "motor_relacion" ADD COLUMN IF NOT EXISTS "columna_desde" text;
ALTER TABLE "motor_relacion" ADD COLUMN IF NOT EXISTS "columna_hacia" text;
ALTER TABLE "motor_relacion" ADD COLUMN IF NOT EXISTS "sembrar_desde" jsonb;
ALTER TABLE "motor_relacion" ADD COLUMN IF NOT EXISTS "sembrado_at" timestamp;

-- Reglas de etapa: cuando la oportunidad pasa a una etapa, un campo de los
-- registros vinculados toma un valor (Reservó → la unidad, Reservado).
CREATE TABLE IF NOT EXISTS "motor_regla" (
  "id" text PRIMARY KEY,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "clave" text NOT NULL,
  "etapa" text NOT NULL,
  "relacion" text NOT NULL,
  "campo" text NOT NULL,
  "valor" jsonb NOT NULL,
  "archivado" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "motor_regla_org_clave_uq"
  ON "motor_regla" ("organization_id", "clave");
