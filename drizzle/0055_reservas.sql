-- 0055 — 071: reservas de restaurante (detrás de la bandera RESERVAS). La
-- reserva es una oportunidad renombrada; estas tablas agregan fecha, horario,
-- personas, sector y mesas, y los ajustes del negocio. Aditiva y re-ejecutable.
CREATE TABLE IF NOT EXISTS "reserva_ajustes" (
  "organization_id" text PRIMARY KEY NOT NULL REFERENCES "organization"("id") ON DELETE cascade,
  "zona_horaria" text DEFAULT 'America/Argentina/Buenos_Aires' NOT NULL,
  "anticipacion_dias" integer DEFAULT 7 NOT NULL,
  "minutos_antes" integer DEFAULT 20 NOT NULL,
  "max_personas" integer DEFAULT 6 NOT NULL,
  "duracion_minutos" integer DEFAULT 120 NOT NULL,
  "enlace_carta" text,
  "direccion" text,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reserva_horario" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE cascade,
  "dia_semana" integer NOT NULL,
  "hora" text NOT NULL,
  "activo" boolean DEFAULT true NOT NULL,
  CONSTRAINT "reserva_horario_dia_chk" CHECK ("dia_semana" BETWEEN 0 AND 6),
  CONSTRAINT "reserva_horario_hora_chk" CHECK ("hora" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "reserva_horario_unico" ON "reserva_horario" ("organization_id","dia_semana","hora");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reserva_cupo" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE cascade,
  "sector" text NOT NULL,
  "capacidad" integer NOT NULL,
  "cantidad" integer NOT NULL,
  "orden" integer DEFAULT 0 NOT NULL,
  CONSTRAINT "reserva_cupo_numeros_chk" CHECK ("capacidad" > 0 AND "cantidad" >= 0)
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "reserva_cupo_unico" ON "reserva_cupo" ("organization_id","sector","capacidad");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reserva_cierre" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE cascade,
  "fecha" date NOT NULL,
  "motivo" text
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "reserva_cierre_unico" ON "reserva_cierre" ("organization_id","fecha");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reserva" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE cascade,
  "oportunidad_id" text NOT NULL REFERENCES "oportunidad"("id") ON DELETE cascade,
  "contact_id" text NOT NULL REFERENCES "contact"("id") ON DELETE cascade,
  "fecha" date NOT NULL,
  "hora" text NOT NULL,
  "personas" integer NOT NULL,
  "nombre" text NOT NULL,
  "sector" text NOT NULL,
  "mesas" jsonb NOT NULL,
  "token_calendario" text NOT NULL,
  "canal" text DEFAULT 'manual' NOT NULL,
  "observaciones" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "reserva_personas_chk" CHECK ("personas" > 0)
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "reserva_oportunidad_unica" ON "reserva" ("oportunidad_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "reserva_token_unico" ON "reserva" ("token_calendario");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reserva_turno_idx" ON "reserva" ("organization_id","fecha","hora");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reserva_contacto_idx" ON "reserva" ("organization_id","contact_id");
