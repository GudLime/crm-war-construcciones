import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validarConfig, type ConfigCliente } from "@/lib/motor/config";
import { columnasEsperadas, ident, sentenciaSiembra, sentenciasDdl } from "@/lib/motor/ddl";
import { rutaConfig } from "@/server/motor/sincronizar";

/** Motor de objetos personalizados — paso 1: configuración y estructura. */

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const EJEMPLO: unknown = JSON.parse(readFileSync(path.join(RAIZ, "clientes", "ejemplo.json"), "utf8"));

function valida(datos: unknown): ConfigCliente {
  const r = validarConfig(datos);
  if (!r.ok) throw new Error(r.errores.join("\n"));
  return r.config;
}

function errores(datos: unknown): string[] {
  const r = validarConfig(datos);
  return r.ok ? [] : r.errores;
}

/** Una configuración mínima válida para variar en cada caso. */
function base(): Record<string, unknown> {
  return {
    version: 1,
    cliente: "Prueba",
    objetos: [
      {
        clave: "edificio",
        nombre: "Edificio",
        nombrePlural: "Edificios",
        titulo: ["nombre"],
        campos: [{ clave: "nombre", nombre: "Nombre", tipo: "texto" }],
      },
      {
        clave: "unidad",
        nombre: "Unidad",
        nombrePlural: "Unidades",
        titulo: ["piso", "tipologia"],
        tituloUnicoDentroDe: "edificio_unidades",
        campos: [
          { clave: "piso", nombre: "Piso", tipo: "numero" },
          { clave: "tipologia", nombre: "Tipología", tipo: "texto" },
          { clave: "valor", nombre: "Valor", tipo: "moneda" },
          {
            clave: "estado",
            nombre: "Estado",
            tipo: "seleccion",
            opciones: [
              { valor: "disponible", nombre: "Disponible" },
              { valor: "vendido", nombre: "Vendido" },
            ],
          },
        ],
      },
    ],
    relaciones: [
      {
        clave: "edificio_unidades",
        desde: "edificio",
        hacia: "unidad",
        tipo: "uno_a_muchos",
        nombreDesde: "Unidades",
        nombreHacia: "Edificio",
      },
    ],
  };
}

describe("el archivo de ejemplo", () => {
  it("es válido", () => {
    const c = valida(EJEMPLO);
    expect(c.objetos.map((o) => o.clave)).toEqual(["sede", "tratamiento"]);
  });

  it("aplica los valores por defecto", () => {
    const c = valida(EJEMPLO);
    const sede = c.objetos[0]!;
    // El ejemplo la prende a propósito (paso 6); sin decirlo, arranca apagada.
    expect(sede.visibleAgente).toBe(true);
    expect(valida(base()).objetos[0]!.visibleAgente).toBe(false);
    expect(sede.campos[0]!.visibleLista).toBe(true);
    expect(sede.campos[0]!.visibleAgente).toBe(true);
  });
});

describe("validación", () => {
  it("acepta la configuración base", () => {
    expect(errores(base())).toEqual([]);
  });

  it("rechaza una versión desconocida", () => {
    expect(errores({ ...base(), version: 2 }).length).toBeGreaterThan(0);
  });

  it("rechaza claves que no sirven como identificador", () => {
    const c = base();
    (c.objetos as { clave: string }[])[0]!.clave = "Edificio Uno";
    expect(errores(c).join(" ")).toMatch(/minúsculas/);
  });

  it("rechaza un título que nombra un campo que no existe", () => {
    const c = base();
    (c.objetos as { titulo: string[] }[])[1]!.titulo = ["piso", "letra"];
    expect(errores(c).join(" ")).toMatch(/«letra», que no existe/);
  });

  it("exige opciones en los campos de selección", () => {
    const c = base();
    const unidad = (c.objetos as { campos: Record<string, unknown>[] }[])[1]!;
    delete unidad.campos[3]!.opciones;
    expect(errores(c).join(" ")).toMatch(/necesita opciones/);
  });

  it("rechaza relaciones con objetos que no existen", () => {
    const c = base();
    (c.relaciones as { hacia: string }[])[0]!.hacia = "cochera";
    expect(errores(c).join(" ")).toMatch(/«cochera» no es un objeto/);
  });

  it("acepta relaciones con la oportunidad del núcleo", () => {
    const c = base();
    (c.relaciones as unknown[]).push({
      clave: "oportunidad_unidades",
      desde: "oportunidad",
      hacia: "unidad",
      tipo: "muchos_a_muchos",
      nombreDesde: "Unidades",
      nombreHacia: "Oportunidades",
    });
    expect(errores(c)).toEqual([]);
  });

  it("no deja redefinir objetos ni tablas del núcleo", () => {
    const c = base();
    (c.objetos as { clave: string }[])[0]!.clave = "oportunidad";
    expect(errores(c).join(" ")).toMatch(/objeto del núcleo/);
    const d = base();
    (d.objetos as { adopta?: string }[])[0]!.adopta = "contact";
    expect(errores(d).join(" ")).toMatch(/es del núcleo/);
  });

  it("rechaza columnas que maneja el motor", () => {
    const c = base();
    (c.objetos as { campos: { columna?: string }[] }[])[0]!.campos[0]!.columna = "organization_id";
    expect(errores(c).join(" ")).toMatch(/la maneja el motor/);
  });

  it("valida los resúmenes de relaciones", () => {
    const c = base();
    (c.objetos as { campos: unknown[] }[])[0]!.campos.push({
      clave: "precio_min",
      nombre: "Precio mínimo",
      tipo: "calculado",
      calculo: {
        resumen: { relacion: "edificio_unidades", campo: "valor", operacion: "minimo", filtro: { estado: ["disponible"] } },
      },
    });
    expect(errores(c)).toEqual([]);
    (c.objetos as { campos: { calculo?: { resumen: { campo: string } } }[] }[])[0]!.campos[1]!.calculo!.resumen.campo = "precio";
    expect(errores(c).join(" ")).toMatch(/resume un campo/);
  });

  it("tituloUnicoDentroDe tiene que ser una relación que llegue al objeto", () => {
    const c = base();
    (c.objetos as { tituloUnicoDentroDe?: string }[])[0]!.tituloUnicoDentroDe = "edificio_unidades";
    expect(errores(c).join(" ")).toMatch(/tituloUnicoDentroDe/);
  });
});

describe("estructura (DDL)", () => {
  it("solo crea y agrega: nunca borra ni modifica", () => {
    const sql = sentenciasDdl(valida(EJEMPLO)).join("\n");
    expect(sql).not.toMatch(/\bDROP\b|\bALTER COLUMN\b|\bRENAME\b|\bTRUNCATE\b|\bDELETE FROM\b/i);
    for (const s of sentenciasDdl(valida(EJEMPLO))) {
      expect(s).toMatch(/^(CREATE TABLE IF NOT EXISTS|CREATE INDEX IF NOT EXISTS|ALTER TABLE .+ ADD COLUMN IF NOT EXISTS)/);
    }
  });

  it("crea la tabla del objeto con organization_id y una columna por campo", () => {
    const sql = sentenciasDdl(valida(EJEMPLO));
    expect(sql).toContain(
      `CREATE TABLE IF NOT EXISTS "obj_tratamiento" ("id" text PRIMARY KEY, "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE, "created_at" timestamp DEFAULT now() NOT NULL, "updated_at" timestamp DEFAULT now() NOT NULL)`
    );
    expect(sql).toContain(`ALTER TABLE "obj_tratamiento" ADD COLUMN IF NOT EXISTS "precio" bigint`);
    expect(sql).toContain(`ALTER TABLE "obj_tratamiento" ADD COLUMN IF NOT EXISTS "activo" boolean`);
    // El calculado no tiene columna.
    expect(sql.join("\n")).not.toContain(`"tratamientos_activos"`);
  });

  it("arma las relaciones: columna en uno a muchos, tabla en muchos a muchos", () => {
    const sql = sentenciasDdl(valida(EJEMPLO)).join("\n");
    expect(sql).toContain(
      `ALTER TABLE "obj_tratamiento" ADD COLUMN IF NOT EXISTS "sede_id" text REFERENCES "obj_sede"("id") ON DELETE SET NULL`
    );
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS "rel_oportunidad_tratamientos" .*REFERENCES "oportunidad"\("id"\)/);
  });

  it("no toca la estructura de los objetos adoptados", () => {
    const c = base();
    (c.objetos as { adopta?: string }[])[0]!.adopta = "edificio";
    (c.objetos as { adopta?: string }[])[1]!.adopta = "departamento";
    const config = valida(c);
    expect(sentenciasDdl(config)).toEqual([]);
    expect(columnasEsperadas(config).get("departamento")).toEqual([
      "id",
      "organization_id",
      "piso",
      "tipologia",
      "valor",
      "estado",
      "edificio_id",
    ]);
  });

  it("no acepta identificadores inseguros", () => {
    expect(() => ident(`x"; DROP TABLE contact; --`)).toThrow();
  });
});

describe("ruta del archivo", () => {
  it("solo acepta un .json dentro de clientes/", () => {
    expect(rutaConfig("clientes/war.json", "/app")).toBe("/app/clientes/war.json");
    expect(rutaConfig("../etc/passwd", "/app")).toBeNull();
    expect(rutaConfig("clientes/../package.json", "/app")).toBeNull();
    expect(rutaConfig("clientes/war.txt", "/app")).toBeNull();
  });
});

describe("paso 5: relaciones con la oportunidad y reglas de etapa", () => {
  function conOportunidad(extra: Record<string, unknown> = {}, regla?: Record<string, unknown>) {
    const c = base();
    (c.relaciones as unknown[]).push({
      clave: "oportunidad_unidades",
      desde: "oportunidad",
      hacia: "unidad",
      tipo: "muchos_a_muchos",
      nombreDesde: "Unidades",
      nombreHacia: "Oportunidades",
      ...extra,
    });
    c.reglasEtapa = regla ? [regla] : [];
    return c;
  }
  const reserva = { clave: "reserva", etapa: "reservo", relacion: "oportunidad_unidades", campo: "estado", valor: "vendido" };

  it("acepta una regla de etapa bien armada", () => {
    expect(errores(conOportunidad({}, reserva))).toEqual([]);
  });

  it("rechaza etapas, relaciones, campos y valores que no existen", () => {
    expect(errores(conOportunidad({}, { ...reserva, etapa: "firmo" })).join(" ")).toMatch(/no es una etapa/);
    expect(errores(conOportunidad({}, { ...reserva, relacion: "edificio_unidades" })).join(" ")).toMatch(
      /muchos a muchos desde la oportunidad/
    );
    expect(errores(conOportunidad({}, { ...reserva, campo: "color" })).join(" ")).toMatch(/no es un campo/);
    expect(errores(conOportunidad({}, { ...reserva, valor: "reservadisimo" })).join(" ")).toMatch(/no es una opción/);
  });

  it("adoptar una tabla intermedia exige nombrarla; no se crea y se verifica", () => {
    expect(errores(conOportunidad({ adoptaTabla: true })).join(" ")).toMatch(/nombrarla/);
    const config = valida(
      conOportunidad({ adoptaTabla: true, tabla: "oportunidad_departamento", columnaDesde: "oportunidad_id", columnaHacia: "departamento_id" })
    );
    expect(sentenciasDdl(config).join("\n")).not.toContain("oportunidad_departamento");
    expect(columnasEsperadas(config).get("oportunidad_departamento")).toEqual([
      "organization_id",
      "oportunidad_id",
      "departamento_id",
    ]);
  });

  it("las opciones de muchos a muchos no van en uno a muchos", () => {
    const c = base();
    (c.relaciones as Record<string, unknown>[])[0]!.adoptaTabla = true;
    expect(errores(c).join(" ")).toMatch(/solo para muchos a muchos/);
  });

  it("la siembra copia una sola columna a la tabla intermedia, sin pisar", () => {
    const config = valida(
      conOportunidad({ sembrarDesde: { tabla: "oportunidad", columnaDesde: "id", columnaHacia: "departamento_id" } })
    );
    const r = config.relaciones.find((x) => x.clave === "oportunidad_unidades")!;
    expect(sentenciaSiembra(r)).toBe(
      `INSERT INTO "rel_oportunidad_unidades" ("organization_id", "desde_id", "hacia_id") SELECT "organization_id", "id", "departamento_id" FROM "oportunidad" WHERE "id" IS NOT NULL AND "departamento_id" IS NOT NULL ON CONFLICT DO NOTHING`
    );
    expect(sentenciaSiembra(config.relaciones[0]!)).toBeNull();
  });
});

describe("campos de archivos", () => {
  const conCampo = (extra: Record<string, unknown>, titulo?: string[]) => {
    const b = base() as { objetos: { campos: Record<string, unknown>[]; titulo: string[] }[] };
    b.objetos[0]!.campos.push({ clave: "fotos", nombre: "Fotos", ...extra });
    if (titulo) b.objetos[0]!.titulo = titulo;
    return b;
  };
  it("acepta galería, video y documento con sus topes", () => {
    expect(errores(conCampo({ tipo: "galeria", maxArchivos: 6 }))).toEqual([]);
    expect(errores(conCampo({ tipo: "video", maxMb: 12 }))).toEqual([]);
    expect(errores(conCampo({ tipo: "documento", maxMb: 20 }))).toEqual([]);
  });
  it("rechaza topes que no van o que WhatsApp no acepta", () => {
    expect(errores(conCampo({ tipo: "texto", maxArchivos: 3 })).join()).toContain("solo para galerías");
    expect(errores(conCampo({ tipo: "galeria", maxMb: 3 })).join()).toContain("solo para video y documento");
    expect(errores(conCampo({ tipo: "video", maxMb: 20 })).join()).toContain("16 MB");
  });
  it("un archivo no puede ser el título", () => {
    expect(errores(conCampo({ tipo: "galeria" }, ["fotos"])).join()).toContain("campo de archivos");
  });
});
