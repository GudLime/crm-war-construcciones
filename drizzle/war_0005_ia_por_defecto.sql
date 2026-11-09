-- War — Si el agente atiende solo las conversaciones nuevas (Ajustes →
-- Ventas). Apagado: los contactos llegan (Make, API, WhatsApp) y se ven en el
-- CRM, pero la IA no contesta hasta que alguien la prenda en esa conversación.
-- Migración propia de WAR: ver WAR.md. Re-ejecutable.
ALTER TABLE "ventas_ajustes" ADD COLUMN IF NOT EXISTS "ia_conversaciones_nuevas" boolean DEFAULT true NOT NULL;
