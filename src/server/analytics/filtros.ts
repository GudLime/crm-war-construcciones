import { sql, type SQL } from "drizzle-orm";
import { schema } from "@/lib/db";

/**
 * Resultados — los filtros comunes de `/api/analytics/*` sobre las
 * oportunidades: la pestaña de Edificio (`edificioIds`) y los manuales
 * (`origen`, `responsable`, `operacion`), todos listas separadas por coma.
 * `responsable` acepta ids, «yo» y «sin».
 */
export type FiltrosAnalytics = {
  edificioIds: string[];
  origenes: string[];
  responsables: string[];
  operaciones: string[];
};

const lista = (url: URL, clave: string) =>
  (url.searchParams.get(clave) ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 100);

export function filtrosDeRequest(url: URL): FiltrosAnalytics {
  return {
    edificioIds: lista(url, "edificioIds"),
    origenes: lista(url, "origen"),
    responsables: lista(url, "responsable"),
    operaciones: lista(url, "operacion"),
  };
}

const enLista = (valores: string[]) => sql.join(valores.map((v) => sql`${v}`), sql`, `);

/**
 * La condición sobre `oportunidad` (o undefined si no hay filtros). `col` es
 * la columna con el id de la oportunidad (por defecto, la de la tabla).
 */
export function condicionOportunidad(
  organizationId: string,
  userId: string,
  f: FiltrosAnalytics,
  col: SQL | typeof schema.oportunidad.id = schema.oportunidad.id
): SQL | undefined {
  const partes: SQL[] = [];
  const op = schema.oportunidad;
  if (f.edificioIds.length) {
    partes.push(sql`exists (
      select 1 from ${op} o2
      where o2.id = ${col} and (
        o2.edificio_id in (${enLista(f.edificioIds)})
        or exists (
          select 1 from ${schema.oportunidadEdificio} oe
          where oe.organization_id = ${organizationId} and oe.oportunidad_id = o2.id
            and oe.edificio_id in (${enLista(f.edificioIds)})
        )
      )
    )`);
  }
  if (f.origenes.length) {
    partes.push(sql`exists (select 1 from ${op} o3 where o3.id = ${col} and o3.origen in (${enLista(f.origenes)}))`);
  }
  if (f.operaciones.length) {
    partes.push(sql`exists (select 1 from ${op} o4 where o4.id = ${col} and o4.tipo in (${enLista(f.operaciones)}))`);
  }
  if (f.responsables.length) {
    const ids = f.responsables.filter((r) => r !== "sin").map((r) => (r === "yo" ? userId : r));
    const sin = f.responsables.includes("sin");
    const cond = [
      ids.length ? sql`o5.responsable_user_id in (${enLista(ids)})` : null,
      sin ? sql`o5.responsable_user_id is null` : null,
    ].filter((x): x is SQL => x !== null);
    partes.push(sql`exists (select 1 from ${op} o5 where o5.id = ${col} and (${sql.join(cond, sql` or `)}))`);
  }
  if (!partes.length) return undefined;
  return sql.join(partes, sql` and `);
}
