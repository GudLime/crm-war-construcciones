-- War — Citas en paralelo (Sebastián, 26/11): Gloria y Sebastián pueden tener
-- dos visitas a la misma hora. Si la agenda todavía no tiene fila de ajustes,
-- se crea con los mismos valores por defecto del código. Re-ejecutable.
INSERT INTO "calendar_settings" ("id", "organization_id", "weekly_hours", "citas_en_paralelo")
SELECT 'cal_war_' || substr(md5(o."id"), 1, 16), o."id",
  '{"mon":[{"start":"09:00","end":"18:00"}],"tue":[{"start":"09:00","end":"18:00"}],"wed":[{"start":"09:00","end":"18:00"}],"thu":[{"start":"09:00","end":"18:00"}],"fri":[{"start":"09:00","end":"18:00"}]}'::jsonb,
  true
FROM "organization" o
ON CONFLICT ("organization_id") DO UPDATE SET "citas_en_paralelo" = true, "updated_at" = now();
