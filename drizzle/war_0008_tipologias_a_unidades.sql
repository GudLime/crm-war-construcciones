-- War — Interés encadenado (0049): las tipologías de interés («A», «2B»…)
-- pasan a Unidades de interés. Cada tipología elegida se vincula con las
-- unidades (departamentos, no cocheras ni bauleras) de esa tipología en los
-- edificios de interés de la oportunidad. No borra `oportunidad_tipologia_unidad`
-- (queda como respaldo) ni toca las que no tienen edificio. Re-ejecutable.
-- Si la tabla de vínculos todavía no existe (instancia nueva: la crea el motor
-- al arrancar), no hace nada: no hay tipologías que pasar.
DO $$
DECLARE
  con_tipo boolean;
BEGIN
  IF to_regclass('public.rel_oportunidad_unidades') IS NULL THEN
    RETURN;
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'departamento' AND column_name = 'tipo'
  ) INTO con_tipo;
  EXECUTE format(
    'INSERT INTO rel_oportunidad_unidades (organization_id, desde_id, hacia_id)
     SELECT DISTINCT t.organization_id, t.oportunidad_id, d.id
     FROM oportunidad_tipologia_unidad t
     JOIN oportunidad_edificio oe
       ON oe.oportunidad_id = t.oportunidad_id AND oe.organization_id = t.organization_id
     JOIN departamento d
       ON d.edificio_id = oe.edificio_id AND d.organization_id = t.organization_id
      AND lower(btrim(d.tipologia_unidad)) = lower(btrim(t.tipologia))
     WHERE %s
     ON CONFLICT DO NOTHING',
    CASE WHEN con_tipo THEN 'coalesce(d.tipo, ''departamento'') = ''departamento''' ELSE 'true' END
  );
END $$;
