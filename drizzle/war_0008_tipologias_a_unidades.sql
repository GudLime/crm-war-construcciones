-- War — Interés encadenado (0049): las tipologías de interés pasan a Unidades
-- de interés. En War la «tipología» es el nombre de la unidad («4B»), no la
-- letra: cada una se vincula con la unidad (departamento, no cochera ni
-- baulera) que se llama así en los edificios de interés de la oportunidad.
-- Se compara sin espacios, «°» ni mayúsculas: «4B» = «4°B» = «4 b».
-- No borra `oportunidad_tipologia_unidad` (queda como respaldo) ni toca las
-- que no tienen edificio. Re-ejecutable.
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
    $sql$INSERT INTO rel_oportunidad_unidades (organization_id, desde_id, hacia_id)
     SELECT DISTINCT t.organization_id, t.oportunidad_id, d.id
     FROM oportunidad_tipologia_unidad t
     JOIN oportunidad_edificio oe
       ON oe.oportunidad_id = t.oportunidad_id AND oe.organization_id = t.organization_id
     JOIN departamento d
       ON d.edificio_id = oe.edificio_id AND d.organization_id = t.organization_id
      AND lower(regexp_replace(d.unidad, '[^0-9A-Za-z]', '', 'g'))
        = lower(regexp_replace(t.tipologia, '[^0-9A-Za-z]', '', 'g'))
      AND regexp_replace(t.tipologia, '[^0-9A-Za-z]', '', 'g') <> ''
     WHERE %s
     ON CONFLICT DO NOTHING$sql$,
    CASE WHEN con_tipo THEN 'coalesce(d.tipo, ''departamento'') = ''departamento''' ELSE 'true' END
  );
END $$;
