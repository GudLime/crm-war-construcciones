-- War — «Mis oportunidades» muestra solo las abiertas (las cerradas ya no se
-- cargan por defecto), y quien había quedado en «Todas» vuelve a arrancar en
-- «Abiertas». Solo toca la vista sembrada y el recuerdo de la última vista.
-- Re-ejecutable.
UPDATE "vista_guardada"
SET "filtros" = "filtros" || '{"situacion":"abiertas"}'::jsonb, "updated_at" = now()
WHERE "id" LIKE 'vis_mias_%' AND NOT ("filtros" ? 'situacion');
--> statement-breakpoint
DELETE FROM "vista_ultima" WHERE "pagina" = 'oportunidades' AND "vista_id" = 'todas';
