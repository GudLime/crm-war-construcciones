-- Interés encadenado (Edificio → Ambientes → Unidades) — la relación de la
-- oportunidad con su «interes» (ver `relacionSchema.interes` en
-- `lib/motor/config.ts`): qué relación da el edificio, qué campo son los
-- ambientes, qué estados se ofrecen y de qué campo sale el Valor calculado.
-- Solo agrega. Re-ejecutable.
ALTER TABLE "motor_relacion" ADD COLUMN IF NOT EXISTS "interes" jsonb;
