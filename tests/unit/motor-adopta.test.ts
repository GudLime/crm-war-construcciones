import { describe, expect, it } from "vitest";
import { validarConfig } from "@/lib/motor/config";
import { columnasEsperadas, sentenciasDdl } from "@/lib/motor/ddl";

/** Motor — paso 8: columnas nuevas en tablas adoptadas, valor inicial y nombre guardado. */

function config(extraCampos: unknown[] = [], extraObjeto: Record<string, unknown> = {}) {
  return {
    version: 1,
    cliente: "WAR de prueba",
    objetos: [
      {
        clave: "unidad",
        nombre: "Unidad",
        nombrePlural: "Unidades",
        adopta: "departamento",
        titulo: ["piso", "tipologia"],
        columnaTitulo: "unidad",
        campos: [
          { clave: "piso", nombre: "Piso", tipo: "numero" },
          {
            clave: "tipologia",
            nombre: "Tipología",
            tipo: "texto",
            columna: "tipologia_unidad",
            crear: true,
            inicial: { copiarDe: "unidad", patron: "^[0-9]+\\s*(.+)$" },
          },
          {
            clave: "ambientes",
            nombre: "Ambientes",
            tipo: "numero",
            crear: true,
            inicial: { copiarDe: "tipologia", mapa: { "1_ambiente": 1, "2_ambientes": 2 } },
          },
          ...extraCampos,
        ],
        ...extraObjeto,
      },
    ],
  };
}

const errores = (c: unknown) => {
  const r = validarConfig(c);
  return r.ok ? [] : r.errores;
};

describe("motor: tablas adoptadas que crecen", () => {
  it("acepta columnas nuevas con valor inicial y nombre guardado", () => {
    expect(errores(config())).toEqual([]);
  });

  it("agrega solo las columnas marcadas, y solo si la tabla existe", () => {
    const r = validarConfig(config([{ clave: "piso_viejo", nombre: "X", tipo: "texto" }]));
    if (!r.ok) throw new Error(r.errores.join());
    const ddl = sentenciasDdl(r.config).join("\n");
    expect(ddl).toContain('ALTER TABLE IF EXISTS "departamento" ADD COLUMN IF NOT EXISTS "tipologia_unidad" text');
    expect(ddl).toContain('ALTER TABLE IF EXISTS "departamento" ADD COLUMN IF NOT EXISTS "ambientes" numeric');
    expect(ddl).not.toContain('"piso_viejo"');
    expect(ddl).not.toMatch(/\bDROP\b|\bALTER COLUMN\b|\bRENAME\b/);
    // Las que crea el motor no se exigen; la del nombre sí.
    expect(columnasEsperadas(r.config).get("departamento")).toEqual(["id", "organization_id", "piso", "piso_viejo", "unidad"]);
  });

  it("valida inicial, crear y columnaTitulo", () => {
    expect(errores(config([{ clave: "x", nombre: "X", tipo: "texto", inicial: { valor: "a" } }])).join()).toContain(
      "lleva «inicial» pero no «crear»"
    );
    expect(
      errores(config([{ clave: "y", nombre: "Y", tipo: "texto", crear: true, inicial: { copiarDe: "y" } }])).join()
    ).toContain("no puede copiarse de sí mismo");
    expect(errores(config([], { columnaTitulo: "piso" })).join()).toContain("no puede ser la columna de un campo");
    expect(
      errores(config([{ clave: "z", nombre: "Z", tipo: "texto", crear: true, inicial: { copiarDe: "unidad", patron: "(" } }])).join()
    ).toContain("patrón");
    expect(
      errores(config([{ clave: "w", nombre: "W", tipo: "calculado", calculo: { suma: ["piso"] }, inicial: { valor: 1 } }])).length
    ).toBeGreaterThan(0);
  });
});
