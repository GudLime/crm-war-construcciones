-- Motor de objetos personalizados — paso 8: columna donde se guarda el nombre
-- armado (objetos adoptados) y la marca de «completado una vez» de los campos
-- con valor inicial. Solo agrega. Re-ejecutable.
ALTER TABLE "motor_objeto" ADD COLUMN IF NOT EXISTS "columna_titulo" text;
--> statement-breakpoint
ALTER TABLE "motor_campo" ADD COLUMN IF NOT EXISTS "inicializado_at" timestamp;
