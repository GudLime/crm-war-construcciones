-- War: correo opcional del contacto. Aditivo y re-ejecutable: los contactos
-- existentes quedan con email NULL y significan exactamente lo mismo.
ALTER TABLE "contact" ADD COLUMN IF NOT EXISTS "email" text;
