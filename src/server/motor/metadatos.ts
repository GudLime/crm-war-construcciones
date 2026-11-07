import { asc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import type { TipoCampo } from "@/lib/motor/config";
import type { CalculoMeta, CampoMeta } from "@/lib/motor/valores";

/**
 * Motor — los metadatos de una organización, listos para usar: objetos con sus
 * campos, relaciones y las columnas que cada tabla tiene de verdad (una tabla
 * adoptada puede no tener `created_at` o `updated_at`).
 *
 * Solo lo vigente: lo archivado no se ve.
 */

export type ObjetoMeta = {
  id: string;
  clave: string;
  nombre: string;
  nombrePlural: string;
  icono: string;
  tabla: string;
  adoptada: boolean;
  titulo: string[];
  tituloUnicoDentroDe: string | null;
  visibleAgente: boolean;
  campos: CampoMeta[];
  /** Columnas reales de la tabla. */
  columnas: Set<string>;
};

export type RelacionMeta = {
  clave: string;
  desde: string;
  hacia: string;
  tipo: "uno_a_muchos" | "muchos_a_muchos";
  nombreDesde: string;
  nombreHacia: string;
  columna: string | null;
  tabla: string | null;
  /** Muchos a muchos: columnas de la tabla intermedia. */
  columnaDesde: string;
  columnaHacia: string;
  obligatoria: boolean;
};

export type ReglaMeta = {
  clave: string;
  etapa: string;
  relacion: string;
  campo: string;
  valor: string | number | boolean;
};

export type Motor = {
  objetos: Map<string, ObjetoMeta>;
  relaciones: RelacionMeta[];
  reglas: ReglaMeta[];
};

/** Columnas por tabla del esquema actual. */
async function columnasPorTabla(tablas: string[]): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  if (!tablas.length) return out;
  const filas = (await getDb().execute(
    sql`select table_name, column_name from information_schema.columns
        where table_schema = current_schema()
          and table_name in (${sql.join(
            tablas.map((t) => sql`${t}`),
            sql`, `
          )})`
  )) as unknown as { table_name: string; column_name: string }[];
  for (const f of filas) {
    const set = out.get(f.table_name) ?? new Set<string>();
    set.add(f.column_name);
    out.set(f.table_name, set);
  }
  return out;
}

export async function cargarMotor(organizationId: string): Promise<Motor> {
  const db = getDb();
  const objetos = await db
    .select()
    .from(schema.motorObjeto)
    .where(scoped(schema.motorObjeto.organizationId, organizationId, eq(schema.motorObjeto.archivado, false)))
    .orderBy(asc(schema.motorObjeto.orden));
  const campos = await db
    .select()
    .from(schema.motorCampo)
    .where(scoped(schema.motorCampo.organizationId, organizationId, eq(schema.motorCampo.archivado, false)))
    .orderBy(asc(schema.motorCampo.orden));
  const relaciones = await db
    .select()
    .from(schema.motorRelacion)
    .where(scoped(schema.motorRelacion.organizationId, organizationId, eq(schema.motorRelacion.archivado, false)));

  const reglas = await db
    .select()
    .from(schema.motorRegla)
    .where(scoped(schema.motorRegla.organizationId, organizationId, eq(schema.motorRegla.archivado, false)));

  const columnas = await columnasPorTabla(objetos.map((o) => o.tabla));
  const mapa = new Map<string, ObjetoMeta>();
  for (const o of objetos) {
    mapa.set(o.clave, {
      id: o.id,
      clave: o.clave,
      nombre: o.nombre,
      nombrePlural: o.nombrePlural,
      icono: o.icono,
      tabla: o.tabla,
      adoptada: o.adoptada,
      titulo: o.titulo,
      tituloUnicoDentroDe: o.tituloUnicoDentroDe,
      visibleAgente: o.visibleAgente,
      columnas: columnas.get(o.tabla) ?? new Set(),
      campos: campos
        .filter((c) => c.objetoId === o.id)
        .map((c) => ({
          clave: c.clave,
          nombre: c.nombre,
          tipo: c.tipo as TipoCampo,
          columna: c.columna,
          obligatorio: c.obligatorio,
          opciones: c.opciones,
          calculo: (c.calculo as CalculoMeta | null) ?? null,
          visibleLista: c.visibleLista,
          visibleAgente: c.visibleAgente,
        })),
    });
  }

  return {
    objetos: mapa,
    relaciones: relaciones
      .filter((r) => (mapa.has(r.desde) || isNucleo(r.desde)) && (mapa.has(r.hacia) || isNucleo(r.hacia)))
      .map((r) => ({
        clave: r.clave,
        desde: r.desde,
        hacia: r.hacia,
        tipo: r.tipo,
        nombreDesde: r.nombreDesde,
        nombreHacia: r.nombreHacia,
        columna: r.columna,
        tabla: r.tabla,
        columnaDesde: r.columnaDesde ?? "desde_id",
        columnaHacia: r.columnaHacia ?? "hacia_id",
        obligatoria: r.obligatoria,
      })),
    reglas: reglas.map((g) => ({ clave: g.clave, etapa: g.etapa, relacion: g.relacion, campo: g.campo, valor: g.valor })),
  };
}

function isNucleo(clave: string): boolean {
  return clave === "oportunidad" || clave === "contacto";
}

/** Tabla de un objeto del núcleo que una relación puede nombrar. */
export function tablaNucleo(clave: string): string | null {
  if (clave === "oportunidad") return "oportunidad";
  if (clave === "contacto") return "contact";
  return null;
}
