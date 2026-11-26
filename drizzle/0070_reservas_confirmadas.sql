-- Cambios 25/11 — Una reserva con día y hora es «Reservó» (Confirmada en un
-- restaurante): Recibido queda para el lead que todavía no reservó. Las que
-- se crearon en Recibido pasan a Reservó. Solo toca oportunidades con una
-- reserva del módulo; re-ejecutable.
UPDATE "oportunidad" SET "estado" = 'reservo', "updated_at" = now()
WHERE "estado" = 'recibido'
  AND "id" IN (SELECT "oportunidad_id" FROM "reserva");
