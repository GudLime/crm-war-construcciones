-- War — La oficina donde se hacen las reuniones formales (reservas, boletos):
-- la ubicación por defecto de una «Reunión en la oficina» (0058). Re-ejecutable:
-- solo la carga si todavía está vacía.
INSERT INTO "ventas_ajustes" ("organization_id", "direccion_oficina")
SELECT o."id", 'Oficina WAR · Salguero 2731, Piso 3, Of. 36' FROM "organization" o
ON CONFLICT ("organization_id") DO UPDATE SET "direccion_oficina" = EXCLUDED."direccion_oficina"
  WHERE "ventas_ajustes"."direccion_oficina" = '';
