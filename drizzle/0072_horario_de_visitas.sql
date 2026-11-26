-- 0072 — v6: cada edificio puede tener su horario de visitas (días y franjas,
-- con la forma del horario de la agenda). Sin horario, usa el de la agenda.
ALTER TABLE "edificio" ADD COLUMN IF NOT EXISTS "horario_visitas" jsonb;
