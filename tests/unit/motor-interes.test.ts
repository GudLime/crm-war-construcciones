import { describe, expect, it } from "vitest";
import type { UnidadDeInteresDto } from "@/lib/motor/dto";
import { coincideConInteres, promedioDeValores, unidadesElegibles, valorDelInteres } from "@/lib/motor/interes";
import { validarConfig } from "@/lib/motor/config";

/** 0049 — Interés encadenado (Edificio → Ambientes → Unidades) y Valor calculado (lo puro). */

const u = (id: string, extra: Partial<UnidadDeInteresDto> = {}): UnidadDeInteresDto => ({
  id,
  titulo: id.toUpperCase(),
  edificioId: "ed_1",
  ambientes: 2,
  valorCents: null,
  moneda: "USD",
  ofrecida: true,
  ...extra,
});

describe("coincideConInteres", () => {
  it("sin edificios ni ambientes, todo coincide", () => {
    expect(coincideConInteres(u("a"), { edificios: [], ambientes: [] })).toBe(true);
  });
  it("edificio y ambientes tienen que estar entre los de interés", () => {
    expect(coincideConInteres(u("a"), { edificios: ["ed_2"], ambientes: [] })).toBe(false);
    expect(coincideConInteres(u("a"), { edificios: ["ed_1"], ambientes: [1, 3] })).toBe(false);
    expect(coincideConInteres(u("a"), { edificios: ["ed_1"], ambientes: [2] })).toBe(true);
  });
  it("una unidad sin ambientes cargados no se suelta por ambientes", () => {
    expect(coincideConInteres(u("a", { ambientes: null }), { edificios: [], ambientes: [3] })).toBe(true);
  });
});

describe("unidadesElegibles", () => {
  const todas = [
    u("1a", { ambientes: 1 }),
    u("2a", { ambientes: 2 }),
    u("3a", { ambientes: 3, ofrecida: false }),
    u("4a", { ambientes: 4 }),
  ];
  it("sin ambientes elegidos: todas las ofrecidas", () => {
    expect(unidadesElegibles(todas, [], []).map((x) => x.id)).toEqual(["1a", "2a", "4a"]);
  });
  it("con 1 y 2 ambientes: solo esas; las elegidas siempre están", () => {
    expect(unidadesElegibles(todas, [], [1, 2]).map((x) => x.id)).toEqual(["1a", "2a"]);
    expect(unidadesElegibles(todas, ["3a", "4a"], [1]).map((x) => x.id)).toEqual(["1a", "3a", "4a"]);
  });
});

describe("Valor", () => {
  it("promedio de las elegidas (100 y 200 → 150)", () => {
    expect(promedioDeValores([u("a", { valorCents: 10000 }), u("b", { valorCents: 20000 })])).toEqual({
      valorCents: 15000,
      moneda: "USD",
    });
  });
  it("con monedas distintas, solo las de la más repetida", () => {
    expect(
      promedioDeValores([
        u("a", { valorCents: 100, moneda: "USD" }),
        u("b", { valorCents: 300, moneda: "USD" }),
        u("c", { valorCents: 9_999_999, moneda: "ARS" }),
      ])
    ).toEqual({ valorCents: 200, moneda: "USD" });
  });
  it("sin precios: null", () => {
    expect(promedioDeValores([u("a"), u("b")])).toBeNull();
  });
  it("sin elegidas: el promedio de las ofrecidas de los ambientes elegidos", () => {
    const edificio = [
      u("1a", { ambientes: 1, valorCents: 100 }),
      u("2a", { ambientes: 2, valorCents: 200 }),
      u("2b", { ambientes: 2, valorCents: 400 }),
      u("2c", { ambientes: 2, valorCents: 9000, ofrecida: false }),
    ];
    expect(valorDelInteres([], edificio, { edificios: ["ed_1"], ambientes: [2] })).toEqual({ valorCents: 300, moneda: "USD" });
    expect(valorDelInteres([], edificio, { edificios: ["ed_1"], ambientes: [1, 2] })).toEqual({
      valorCents: 233,
      moneda: "USD",
    });
  });
  it("sin elegidas ni ambientes (o sin edificios): vacío", () => {
    const edificio = [u("2a", { valorCents: 200 })];
    expect(valorDelInteres([], edificio, { edificios: ["ed_1"], ambientes: [] })).toBeNull();
    expect(valorDelInteres([], edificio, { edificios: [], ambientes: [2] })).toBeNull();
  });
  it("las elegidas mandan sobre los ambientes", () => {
    const elegidas = [u("4b", { valorCents: 500 })];
    expect(valorDelInteres(elegidas, [u("2a", { valorCents: 100 })], { edificios: ["ed_1"], ambientes: [2] })).toEqual({
      valorCents: 500,
      moneda: "USD",
    });
  });
});

describe("configuración de «interes»", () => {
  const base = {
    version: 1,
    cliente: "Prueba",
    objetos: [
      {
        clave: "edificio",
        nombre: "Edificio",
        nombrePlural: "Edificios",
        adopta: "edificio",
        titulo: ["nombre"],
        campos: [{ clave: "nombre", nombre: "Nombre", tipo: "texto" }],
      },
      {
        clave: "unidad",
        nombre: "Unidad",
        nombrePlural: "Unidades",
        titulo: ["nombre"],
        campos: [
          { clave: "nombre", nombre: "Nombre", tipo: "texto" },
          { clave: "ambientes", nombre: "Ambientes", tipo: "numero" },
          { clave: "estado", nombre: "Estado", tipo: "seleccion", opciones: [{ valor: "disponible", nombre: "Disponible" }] },
          { clave: "valor", nombre: "Precio", tipo: "moneda" },
          { clave: "moneda", nombre: "Moneda", tipo: "texto" },
        ],
      },
    ],
    relaciones: [
      { clave: "edificio_unidades", desde: "edificio", hacia: "unidad", tipo: "uno_a_muchos", nombreDesde: "Unidades", nombreHacia: "Edificio" },
      {
        clave: "oportunidad_unidades",
        desde: "oportunidad",
        hacia: "unidad",
        tipo: "muchos_a_muchos",
        nombreDesde: "Unidades de interés",
        nombreHacia: "Oportunidades",
        interes: {
          edificio: "edificio_unidades",
          ambientes: "ambientes",
          estado: { campo: "estado", valores: ["disponible"] },
          valor: "valor",
          moneda: "moneda",
        },
      },
    ],
  };

  it("una configuración válida pasa", () => {
    const r = validarConfig(base);
    expect(r.ok ? [] : r.errores).toEqual([]);
  });

  it("ambientes tiene que ser numérico y edificio una relación al objeto", () => {
    const mal = JSON.parse(JSON.stringify(base)) as { relaciones: { interes?: Record<string, unknown> }[] };
    mal.relaciones[1]!.interes = { ...mal.relaciones[1]!.interes, ambientes: "nombre", edificio: "no_existe" };
    const r = validarConfig(mal);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errores.join("\n")).toMatch(/interes\.ambientes/);
      expect(r.errores.join("\n")).toMatch(/interes\.edificio/);
    }
  });
});
