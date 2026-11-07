-- Motor de objetos personalizados — historial de cambios de los registros
-- (paso 2). Como oportunidad_evento: solo se agregan filas, nunca se editan
-- ni se borran. Guarda el título del registro en ese momento, así el
-- historial se sigue leyendo aunque el registro se borre.
-- Re-ejecutable.
CREATE TABLE IF NOT EXISTS "motor_cambio" (
  "id" text PRIMARY KEY,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "objeto" text NOT NULL,
  "registro_id" text NOT NULL,
  "titulo" text NOT NULL,
  "accion" text NOT NULL,
  "campo" text,
  "antes" jsonb,
  "despues" jsonb,
  "actor_tipo" text NOT NULL,
  "actor_id" text,
  "lote_id" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "motor_cambio_registro_idx"
  ON "motor_cambio" ("organization_id", "objeto", "registro_id", "created_at");
CREATE INDEX IF NOT EXISTS "motor_cambio_lote_idx"
  ON "motor_cambio" ("lote_id");
