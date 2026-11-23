-- 0061 — Workflow de la primera llamada: plantillas por origen, la situación
-- «al asignar» (se crea sola) y la de fábrica «Avisar que lo llamamos» para
-- las organizaciones que ya tenían sus plantillas. Re-ejecutable.
ALTER TABLE "tarea_plantilla" ADD COLUMN IF NOT EXISTS "origenes" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
INSERT INTO "tarea_plantilla" ("id", "organization_id", "nombre", "tipo", "situacion", "vence", "mensaje", "activa", "orden", "origenes")
SELECT 'tpl_' || substr(md5(random()::text || va.organization_id), 1, 21), va.organization_id,
  'Avisar que lo llamamos', 'mensaje', 'llamada_sin_atender', 'hoy',
  'Hola {nombre}, soy {vendedor}. Te llamamos recién y no pudimos hablar. Cuando puedas, contame por acá qué estás buscando.',
  true, 15, '[]'::jsonb
FROM "ventas_ajustes" va
WHERE va.plantillas_sembradas = true
  AND NOT EXISTS (
    SELECT 1 FROM "tarea_plantilla" tp
    WHERE tp.organization_id = va.organization_id AND tp.situacion = 'llamada_sin_atender'
  );
