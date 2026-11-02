-- War: qué edificios entran en la memoria del agente, y notas para el agente
-- por edificio y por unidad. Aditivo y re-ejecutable.
ALTER TABLE "edificio" ADD COLUMN IF NOT EXISTS "memoria_agente" boolean DEFAULT false NOT NULL;
ALTER TABLE "edificio" ADD COLUMN IF NOT EXISTS "notas_agente" text;
ALTER TABLE "departamento" ADD COLUMN IF NOT EXISTS "notas_agente" text;
