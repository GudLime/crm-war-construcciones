-- Motor de objetos personalizados — cómo se le presenta cada objeto al agente
-- (paso 6): filtro, agrupación, rangos e indicación. Solo agrega.
-- Re-ejecutable.
ALTER TABLE "motor_objeto" ADD COLUMN IF NOT EXISTS "agente" jsonb;
