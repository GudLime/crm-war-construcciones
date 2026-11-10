-- War — vista del equipo «Mis oportunidades» en Oportunidades: las del
-- responsable que mira («yo»). Re-ejecutable.
INSERT INTO "vista_guardada" ("id", "organization_id", "pagina", "nombre", "filtros", "posicion")
SELECT 'vis_mias_' || o."id", o."id", 'oportunidades', 'Mis oportunidades', '{"responsables":["yo"]}'::jsonb, -1
FROM "organization" o
ON CONFLICT ("id") DO NOTHING;
