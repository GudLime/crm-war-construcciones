import {
  columnaDeCampo,
  columnaDeRelacion,
  IDENTIFICADOR,
  tablaDeObjeto,
  tablaDeRelacion,
  tieneColumna,
  type ConfigCliente,
  type TipoCampo,
} from "./config";

/**
 * Motor — el SQL que crea la estructura de los objetos NUEVOS de un cliente.
 * Puro: devuelve sentencias; quien las corre es `server/motor/sincronizar.ts`.
 *
 * Reglas (las mismas que para las migraciones de GudLime):
 * - Solo `CREATE TABLE IF NOT EXISTS` y `ADD COLUMN IF NOT EXISTS`: se puede
 *   correr en cada arranque sin efecto si no cambió nada.
 * - Nunca borra ni cambia tablas o columnas. Quitar un campo de la
 *   configuración lo archiva en los metadatos; la columna y sus datos quedan.
 * - Los objetos adoptados (`adopta`) no se tocan: su tabla ya existe.
 * - Toda tabla lleva `organization_id` (Constitución III).
 */

export const TIPO_SQL: Record<Exclude<TipoCampo, "calculado">, string> = {
  texto: "text",
  numero: "numeric",
  // Centavos, como `departamento.valor_cents`: sin errores de redondeo.
  moneda: "bigint",
  fecha: "timestamp",
  seleccion: "text",
  seleccion_multiple: "jsonb",
  booleano: "boolean",
  enlace: "text",
  imagen: "text",
};

/** Comillas de identificador; solo acepta identificadores ya validados. */
export function ident(nombre: string): string {
  if (!IDENTIFICADOR.test(nombre)) throw new Error(`identificador inválido: ${nombre}`);
  return `"${nombre}"`;
}

/** La tabla de la oportunidad, del núcleo, para las relaciones que la nombran. */
function tablaNucleo(clave: string): string | null {
  if (clave === "oportunidad") return "oportunidad";
  if (clave === "contacto") return "contact";
  return null;
}

export function sentenciasDdl(config: ConfigCliente): string[] {
  const out: string[] = [];
  const nuevos = config.objetos.filter((o) => !o.adopta);
  const tablaDe = new Map(config.objetos.map((o) => [o.clave, tablaDeObjeto(o)] as const));

  // 1) Tablas y columnas propias.
  for (const o of nuevos) {
    const tabla = ident(tablaDeObjeto(o));
    out.push(
      `CREATE TABLE IF NOT EXISTS ${tabla} (` +
        `"id" text PRIMARY KEY, ` +
        `"organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE, ` +
        `"created_at" timestamp DEFAULT now() NOT NULL, ` +
        `"updated_at" timestamp DEFAULT now() NOT NULL)`
    );
    out.push(
      `CREATE INDEX IF NOT EXISTS ${ident(`${tablaDeObjeto(o)}_org_idx`.slice(0, 63))} ON ${tabla} ("organization_id")`
    );
    for (const c of o.campos) {
      if (!tieneColumna(c.tipo)) continue;
      const tipo = TIPO_SQL[c.tipo as Exclude<TipoCampo, "calculado">];
      // Sin NOT NULL a propósito: agregar una columna obligatoria a una tabla
      // con filas fallaría. «Obligatorio» lo exige el servidor al guardar.
      out.push(`ALTER TABLE ${tabla} ADD COLUMN IF NOT EXISTS ${ident(columnaDeCampo(c))} ${tipo}`);
    }
  }

  // 2) Relaciones. Uno a muchos: columna en la tabla del lado «muchos», si es
  // un objeto nuevo. Muchos a muchos: tabla intermedia.
  for (const r of config.relaciones) {
    const desde = tablaDe.get(r.desde) ?? tablaNucleo(r.desde);
    const hacia = tablaDe.get(r.hacia) ?? tablaNucleo(r.hacia);
    if (!desde || !hacia) continue;

    if (r.tipo === "uno_a_muchos") {
      const hijo = config.objetos.find((o) => o.clave === r.hacia);
      if (!hijo || hijo.adopta) continue; // la tabla adoptada ya trae su columna
      const col = columnaDeRelacion(r);
      out.push(
        `ALTER TABLE ${ident(hacia)} ADD COLUMN IF NOT EXISTS ${ident(col)} text ` +
          `REFERENCES ${ident(desde)}("id") ON DELETE SET NULL`
      );
      out.push(
        `CREATE INDEX IF NOT EXISTS ${ident(`${hacia}_${col}_idx`.slice(0, 63))} ON ${ident(hacia)} (${ident(col)})`
      );
      continue;
    }

    const tabla = tablaDeRelacion(r);
    out.push(
      `CREATE TABLE IF NOT EXISTS ${ident(tabla)} (` +
        `"organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE, ` +
        `"desde_id" text NOT NULL REFERENCES ${ident(desde)}("id") ON DELETE CASCADE, ` +
        `"hacia_id" text NOT NULL REFERENCES ${ident(hacia)}("id") ON DELETE CASCADE, ` +
        `"created_at" timestamp DEFAULT now() NOT NULL, ` +
        `PRIMARY KEY ("desde_id", "hacia_id"))`
    );
    out.push(
      `CREATE INDEX IF NOT EXISTS ${ident(`${tabla}_hacia_idx`.slice(0, 63))} ON ${ident(tabla)} ("organization_id", "hacia_id")`
    );
  }

  return out;
}

/**
 * Columnas que un objeto adoptado tiene que tener para que el motor lo pueda
 * leer: las de sus campos y la de cada relación uno a muchos que le llega.
 */
export function columnasEsperadas(config: ConfigCliente): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const o of config.objetos) {
    if (!o.adopta) continue;
    const cols = ["id", "organization_id"];
    for (const c of o.campos) if (tieneColumna(c.tipo)) cols.push(columnaDeCampo(c));
    for (const r of config.relaciones) {
      if (r.tipo === "uno_a_muchos" && r.hacia === o.clave) cols.push(columnaDeRelacion(r));
    }
    out.set(o.adopta, cols);
  }
  return out;
}
