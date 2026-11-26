-- War v6 — La agenda de WAR en la hora de Buenos Aires (nunca se había
-- guardado: usaba el valor por defecto del núcleo, México). Sebastián, 26/11:
-- no se corrige nada de lo ya cargado; él ajusta a mano. Re-ejecutable.
UPDATE "calendar_settings"
SET "timezone" = 'America/Argentina/Buenos_Aires', "updated_at" = now()
WHERE "timezone" = 'America/Mexico_City';
