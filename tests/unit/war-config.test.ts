import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validarConfig } from "@/lib/motor/config";
import { columnasEsperadas, sentenciasDdl } from "@/lib/motor/ddl";

/**
 * WAR — la configuración del cliente (`clientes/war.json`) es válida y no le
 * hace nada destructivo a las tablas que adopta (edificio, departamento,
 * oportunidad_edificio): solo agrega columnas y la tabla de vínculos nueva.
 */

const config = JSON.parse(readFileSync(path.join(process.cwd(), "clientes/war.json"), "utf8"));

describe("WAR: clientes/war.json", () => {
  const r = validarConfig(config);

  it("es válida", () => {
    expect(r.ok ? [] : r.errores).toEqual([]);
  });

  it("solo agrega: tipo, ambientes y tipología en departamento, y la tabla de vínculos con unidades", () => {
    if (!r.ok) return;
    const ddl = sentenciasDdl(r.config);
    expect(ddl.join("\n")).not.toMatch(/\bDROP\b|\bALTER COLUMN\b|\bRENAME\b|\bDELETE\b|\bTRUNCATE\b/);
    expect(ddl.filter((s) => s.includes('"departamento"'))).toEqual([
      'ALTER TABLE IF EXISTS "departamento" ADD COLUMN IF NOT EXISTS "tipo" text',
      'ALTER TABLE IF EXISTS "departamento" ADD COLUMN IF NOT EXISTS "tipologia_unidad" text',
      'ALTER TABLE IF EXISTS "departamento" ADD COLUMN IF NOT EXISTS "ambientes" numeric',
    ]);
    expect(ddl.some((s) => s.startsWith('CREATE TABLE IF NOT EXISTS "rel_oportunidad_unidades"'))).toBe(true);
    expect(ddl.some((s) => s.includes('"edificio"') && s.startsWith("ALTER"))).toBe(false);
  });

  it("lo que exige de las tablas existentes coincide con el esquema de WAR", () => {
    if (!r.ok) return;
    const esperadas = columnasEsperadas(r.config);
    expect(esperadas.get("departamento")).toEqual(
      expect.arrayContaining(["edificio_id", "unidad", "piso", "estado", "valor_cents", "metros_cubiertos", "notas_agente"])
    );
    expect(esperadas.get("edificio")).toEqual(expect.arrayContaining(["nombre", "estado", "memoria_agente", "en_venta"]));
    expect(esperadas.get("oportunidad_edificio")).toEqual(["organization_id", "oportunidad_id", "edificio_id"]);
  });
});
