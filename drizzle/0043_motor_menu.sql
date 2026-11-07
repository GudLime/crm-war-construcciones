-- Motor de objetos personalizados — paso 8: si el objeto aparece en el menú.
-- Solo agrega. Re-ejecutable.
ALTER TABLE "motor_objeto" ADD COLUMN IF NOT EXISTS "en_menu" boolean DEFAULT true NOT NULL;
