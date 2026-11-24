-- 0067 — v4: una respuesta rápida puede llevar fotos y videos además del
-- texto. Los archivos viven donde viven los demás medios (disco o bucket);
-- aquí queda la lista. Re-ejecutable.
ALTER TABLE "quick_reply" ADD COLUMN IF NOT EXISTS "adjuntos" jsonb NOT NULL DEFAULT '[]'::jsonb;
