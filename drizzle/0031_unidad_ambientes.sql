-- War: más datos por unidad, para la lista de precios en CSV. Aditivo y
-- re-ejecutable: las unidades existentes quedan en NULL (sin dato).
ALTER TABLE "departamento" ADD COLUMN IF NOT EXISTS "dormitorios" integer;
ALTER TABLE "departamento" ADD COLUMN IF NOT EXISTS "banos" integer;
ALTER TABLE "departamento" ADD COLUMN IF NOT EXISTS "toilette" integer;
ALTER TABLE "departamento" ADD COLUMN IF NOT EXISTS "en_suite" integer;
