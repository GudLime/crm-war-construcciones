-- Ventas de la constructora: edificios, departamentos, oportunidades y
-- tareas que hace una persona (no la IA). Aditivo: no toca contactos ni leads.

CREATE TABLE IF NOT EXISTS "edificio" (
  "id" text PRIMARY KEY,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "nombre" text NOT NULL,
  "direccion" text,
  "estado" text NOT NULL DEFAULT 'en_construccion',
  "en_venta" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "edificio_estado_chk" CHECK (
    "estado" IN ('en_construccion', 'terminado', 'en_pozo', 'a_construir')
  )
);

CREATE INDEX IF NOT EXISTS "edificio_org_nombre_idx" ON "edificio" ("organization_id", "nombre");

CREATE TABLE IF NOT EXISTS "departamento" (
  "id" text PRIMARY KEY,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "edificio_id" text NOT NULL REFERENCES "edificio"("id") ON DELETE CASCADE,
  "unidad" text NOT NULL,
  "orientacion_edificio" text,
  "orientacion_geo" text,
  "metros_cubiertos" numeric(8, 2),
  "metros_semicubiertos" numeric(8, 2),
  "metros_descubiertos" numeric(8, 2),
  "valor_cents" integer,
  "moneda" text,
  "estado" text NOT NULL DEFAULT 'disponible',
  "tipologia" text,
  "piso" integer,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "departamento_estado_chk" CHECK (
    "estado" IN ('disponible', 'consultar', 'reservado', 'vendido')
  ),
  CONSTRAINT "departamento_tipologia_chk" CHECK (
    "tipologia" IS NULL OR "tipologia" IN (
      '1_ambiente', '2_ambientes', '3_ambientes', '4_ambientes', 'triplex'
    )
  )
);

CREATE INDEX IF NOT EXISTS "departamento_edificio_idx"
  ON "departamento" ("organization_id", "edificio_id", "unidad");
CREATE UNIQUE INDEX IF NOT EXISTS "departamento_edificio_unidad_uq"
  ON "departamento" ("edificio_id", "unidad");

CREATE TABLE IF NOT EXISTS "oportunidad" (
  "id" text PRIMARY KEY,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "nombre" text NOT NULL,
  "origen" text,
  "contact_id" text REFERENCES "contact"("id") ON DELETE SET NULL,
  "edificio_id" text REFERENCES "edificio"("id") ON DELETE SET NULL,
  "departamento_id" text REFERENCES "departamento"("id") ON DELETE SET NULL,
  "estado" text NOT NULL DEFAULT 'recibido',
  "tipo" text,
  "motivo_cierre" text,
  "valor_cents" integer,
  "moneda" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "oportunidad_estado_chk" CHECK (
    "estado" IN (
      'recibido', 'no_responde', 'en_charlas', 'conoce_informacion', 'visito',
      'reservo', 'compro', 'no_calificado', 'perdido'
    )
  ),
  CONSTRAINT "oportunidad_tipo_chk" CHECK (
    "tipo" IS NULL OR "tipo" IN ('venta', 'alquiler', 'inmobiliaria')
  )
);

CREATE INDEX IF NOT EXISTS "oportunidad_org_estado_idx"
  ON "oportunidad" ("organization_id", "estado", "updated_at");
CREATE INDEX IF NOT EXISTS "oportunidad_contacto_idx"
  ON "oportunidad" ("organization_id", "contact_id");

CREATE TABLE IF NOT EXISTS "tarea_venta" (
  "id" text PRIMARY KEY,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "titulo" text NOT NULL,
  "tipo" text NOT NULL,
  "estado" text NOT NULL DEFAULT 'realizar',
  "fecha" timestamp,
  "comentarios" text,
  "contact_id" text REFERENCES "contact"("id") ON DELETE SET NULL,
  "oportunidad_id" text REFERENCES "oportunidad"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "tarea_venta_tipo_chk" CHECK (
    "tipo" IN ('llamada', 'visita', 'mensaje', 'reunion', 'correo')
  ),
  CONSTRAINT "tarea_venta_estado_chk" CHECK (
    "estado" IN ('realizar', 'no_responde', 'listo')
  )
);

CREATE INDEX IF NOT EXISTS "tarea_venta_org_estado_idx"
  ON "tarea_venta" ("organization_id", "estado", "fecha");
CREATE INDEX IF NOT EXISTS "tarea_venta_oportunidad_idx"
  ON "tarea_venta" ("organization_id", "oportunidad_id");
