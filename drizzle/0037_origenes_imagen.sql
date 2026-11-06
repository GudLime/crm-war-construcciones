-- War — Imagen propia de cada origen (el logo de Zonaprop, MercadoLibre…).
-- El archivo vive en el volumen de medios como `origen-<id>`. Re-ejecutable.
ALTER TABLE "origen_oportunidad" ADD COLUMN IF NOT EXISTS "imagen_mime" text;
ALTER TABLE "origen_oportunidad" ADD COLUMN IF NOT EXISTS "imagen_version" bigint;
