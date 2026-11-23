-- War — Las tareas de las derivaciones de la IA van a Gloria por defecto
-- (cambios 23/11, punto 6). La busca por nombre o correo entre el equipo; si
-- todavía no tiene usuario, queda vacío (sin asignar). Re-ejecutable: solo
-- carga si está vacío.
INSERT INTO "ventas_ajustes" ("organization_id", "derivaciones_responsable_user_id")
SELECT o."id", (
  SELECT u."id" FROM "user" u
  JOIN "member" m ON m."user_id" = u."id" AND m."organization_id" = o."id"
  WHERE lower(u."name") LIKE 'gloria%' OR lower(u."email") LIKE 'gloria%'
  ORDER BY u."created_at" LIMIT 1
)
FROM "organization" o
ON CONFLICT ("organization_id") DO UPDATE
  SET "derivaciones_responsable_user_id" = EXCLUDED."derivaciones_responsable_user_id"
  WHERE "ventas_ajustes"."derivaciones_responsable_user_id" IS NULL;
