-- Motor de objetos personalizados — metadatos (paso 1).
-- Describen los objetos, campos y relaciones de cada organización, tal como
-- los define el archivo de configuración del cliente (clientes/<cliente>.json).
-- Los escribe solo el arranque (server/motor/sincronizar.ts), nunca la
-- interfaz. Lo que sale de la configuración se ARCHIVA, no se borra.
-- Re-ejecutable.
CREATE TABLE IF NOT EXISTS "motor_objeto" (
  "id" text PRIMARY KEY,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "clave" text NOT NULL,
  "nombre" text NOT NULL,
  "nombre_plural" text NOT NULL,
  "icono" text DEFAULT 'box' NOT NULL,
  "tabla" text NOT NULL,
  "adoptada" boolean DEFAULT false NOT NULL,
  "titulo" jsonb NOT NULL,
  "titulo_unico_dentro_de" text,
  "visible_agente" boolean DEFAULT false NOT NULL,
  "orden" integer DEFAULT 0 NOT NULL,
  "archivado" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "motor_objeto_org_clave_uq"
  ON "motor_objeto" ("organization_id", "clave");

CREATE TABLE IF NOT EXISTS "motor_campo" (
  "id" text PRIMARY KEY,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "objeto_id" text NOT NULL REFERENCES "motor_objeto"("id") ON DELETE CASCADE,
  "clave" text NOT NULL,
  "nombre" text NOT NULL,
  "tipo" text NOT NULL,
  "columna" text,
  "obligatorio" boolean DEFAULT false NOT NULL,
  "opciones" jsonb,
  "calculo" jsonb,
  "visible_lista" boolean DEFAULT true NOT NULL,
  "visible_agente" boolean DEFAULT true NOT NULL,
  "orden" integer DEFAULT 0 NOT NULL,
  "archivado" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "motor_campo_objeto_clave_uq"
  ON "motor_campo" ("objeto_id", "clave");
CREATE INDEX IF NOT EXISTS "motor_campo_org_idx"
  ON "motor_campo" ("organization_id", "objeto_id");

CREATE TABLE IF NOT EXISTS "motor_relacion" (
  "id" text PRIMARY KEY,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "clave" text NOT NULL,
  "desde" text NOT NULL,
  "hacia" text NOT NULL,
  "tipo" text NOT NULL,
  "nombre_desde" text NOT NULL,
  "nombre_hacia" text NOT NULL,
  "columna" text,
  "tabla" text,
  "obligatoria" boolean DEFAULT false NOT NULL,
  "archivado" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "motor_relacion_org_clave_uq"
  ON "motor_relacion" ("organization_id", "clave");
