import { describe, expect, it } from "vitest";
import {
  conMemoria,
  renderEdificioParaMemoria,
  renderMemoriaAgente,
  type EdificioParaMemoria,
  type UnidadParaMemoria,
} from "@/lib/memoria-agente";

/** Memoria del agente: lo que el cerebro lee de cada edificio prendido. */

const unidad = (over: Partial<UnidadParaMemoria>): UnidadParaMemoria => ({
  unidad: "1A",
  piso: 1,
  tipologia: "2_ambientes",
  metrosCubiertos: 50,
  metrosSemicubiertos: 5,
  metrosDescubiertos: null,
  valorCents: 15_000_000,
  moneda: "USD",
  estado: "disponible",
  dormitorios: 1,
  banos: 1,
  toilette: 0,
  enSuite: 0,
  notasAgente: null,
  ...over,
});

const edificio = (over: Partial<EdificioParaMemoria> = {}): EdificioParaMemoria => ({
  nombre: "Torre Ejemplo",
  direccion: "Calle Falsa 123, Almagro",
  estado: "en_construccion",
  enVenta: "2 y 3 ambientes",
  notasAgente: "Visitas martes y jueves de 10 a 17.",
  unidades: [
    unidad({ unidad: "1A" }),
    unidad({
      unidad: "1B",
      tipologia: "3_ambientes",
      dormitorios: 2,
      banos: 2,
      enSuite: 1,
      toilette: 1,
      metrosCubiertos: 70,
      metrosSemicubiertos: 8,
      metrosDescubiertos: 100,
      valorCents: 25_000_000,
      notasAgente: "Terraza propia con parrilla.",
    }),
    unidad({ unidad: "2A", estado: "vendido", valorCents: null }),
    unidad({ unidad: "2B", estado: "reservado" }),
    unidad({ unidad: "3A", estado: "consultar", valorCents: null }),
  ],
  ...over,
});

describe("un edificio en la memoria", () => {
  const texto = renderEdificioParaMemoria(edificio());

  it("trae los datos y las notas del edificio", () => {
    expect(texto).toContain("### Edificio Torre Ejemplo");
    expect(texto).toContain("Dirección: Calle Falsa 123, Almagro");
    expect(texto).toContain("Estado de obra: En construcción");
    expect(texto).toContain("Notas: Visitas martes y jueves de 10 a 17.");
  });

  it("lista solo lo que se puede ofrecer, y cuenta el resto", () => {
    expect(texto).toContain("Unidades disponibles (3 disponibles de 5, 1 reservada, 1 vendida)");
    // 2A (vendida) y 2B (reservada) no se listan; 3A (consultar) sí.
    expect(texto).toContain("Unidad 1A");
    expect(texto).toContain("Unidad 1B");
    expect(texto).toContain("Unidad 3A");
    expect(texto).not.toContain("Unidad 2A");
    expect(texto).not.toContain("Unidad 2B");
  });

  it("cada unidad con ambientes, baños, metros, precio y su nota", () => {
    const linea = texto.split("\n").find((l) => l.includes("Unidad 1B"))!;
    expect(linea).toContain("piso 1");
    expect(linea).toContain("3 ambientes");
    expect(linea).toContain("2 dormitorios");
    expect(linea).toContain("2 baños (1 en suite)");
    expect(linea).toContain("toilette");
    expect(linea).toContain("178 m² totales (70 cubiertos + 8 semicubiertos + 100 descubiertos)");
    expect(linea).toContain("precio USD 250.000");
    expect(texto).toContain("  Nota: Terraza propia con parrilla.");
  });

  it("sin precio o para consultar, lo dice", () => {
    const linea = texto.split("\n").find((l) => l.includes("Unidad 3A"))!;
    expect(linea).toContain("precio a consultar");
    expect(linea).toContain("disponibilidad a confirmar con el equipo");
  });

  it("sin unidades disponibles o sin unidades cargadas", () => {
    expect(
      renderEdificioParaMemoria(edificio({ unidades: [unidad({ estado: "vendido" })] }))
    ).toContain("no quedan disponibles (0 disponibles de 1, 1 vendida)");
    expect(renderEdificioParaMemoria(edificio({ unidades: [] }))).toContain(
      "todavía no están cargadas"
    );
  });
});

describe("la memoria completa", () => {
  it("sin edificios prendidos no agrega nada", () => {
    expect(renderMemoriaAgente([])).toBe("");
    expect(conMemoria("P: a\nR: b", "")).toBe("P: a\nR: b");
  });

  it("se suma al conocimiento, o lo reemplaza si estaba vacío", () => {
    const memoria = renderMemoriaAgente([edificio()]);
    expect(memoria).toContain("## Edificios de la constructora");
    expect(conMemoria("P: a\nR: b", memoria)).toBe(`P: a\nR: b\n\n${memoria}`);
    expect(conMemoria("(knowledge base vacío)", memoria)).toBe(memoria);
  });
});

describe("rangos por tipología", () => {
  const mono = (over: Partial<UnidadParaMemoria>) =>
    unidad({ tipologia: "1_ambiente", dormitorios: null, metrosSemicubiertos: null, ...over });
  const texto = renderEdificioParaMemoria(
    edificio({
      unidades: [
        mono({ unidad: "2A", piso: 2, metrosCubiertos: 33, metrosSemicubiertos: 4, valorCents: 13_200_000 }),
        mono({ unidad: "5A", piso: 5, metrosCubiertos: 33, metrosSemicubiertos: 4, valorCents: 14_200_000 }),
        mono({ unidad: "6B", piso: 6, metrosCubiertos: 28, valorCents: 10_600_000, estado: "vendido" }),
        mono({ unidad: "6C", piso: 6, metrosCubiertos: 28, valorCents: 10_500_000 }),
        unidad({ unidad: "3A", piso: 3 }),
      ],
    })
  );

  it("da mínimo y máximo de cada tipología, solo con lo que se puede ofrecer", () => {
    expect(texto).toContain("Rangos por tipología");
    expect(texto).toContain("- 1 ambiente: 3 disponibles · de USD 105.000 a USD 142.000 · de 28 a 37 m² totales");
    expect(texto).toContain("- 2 ambientes: 1 disponible · precio USD 150.000 · 55 m² totales");
    // La vendida no entra ni en el rango ni en la lista.
    expect(texto).not.toContain("106.000");
    expect(texto).not.toContain("Unidad 6B");
  });

  it("el rango va antes del listado de unidades", () => {
    expect(texto.indexOf("Rangos por tipología")).toBeLessThan(texto.indexOf("Unidad 2A"));
  });
});
