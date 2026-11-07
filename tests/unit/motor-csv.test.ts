import { describe, expect, it } from "vitest";
import { generarCsv, leerCsv, reconocerColumnas, valorDeCelda } from "@/lib/motor/csv";
import type { CampoDto, ObjetoDto } from "@/lib/motor/dto";

/** Motor — paso 4: CSV de cualquier objeto (puro). */

function campo(parcial: Partial<CampoDto> & Pick<CampoDto, "clave" | "nombre" | "tipo">): CampoDto {
  return {
    obligatorio: false,
    editable: parcial.tipo !== "calculado",
    opciones: null,
    visibleLista: true,
    visibleAgente: true,
    ...parcial,
  };
}

const UNIDAD: ObjetoDto = {
  clave: "unidad",
  nombre: "Unidad",
  nombrePlural: "Unidades",
  icono: "home",
  titulo: ["piso", "tipologia"],
  visibleAgente: false,
  campos: [
    campo({ clave: "piso", nombre: "Piso", tipo: "numero" }),
    campo({ clave: "tipologia", nombre: "Tipología", tipo: "texto" }),
    campo({ clave: "valor", nombre: "Valor", tipo: "moneda" }),
    campo({
      clave: "estado",
      nombre: "Estado",
      tipo: "seleccion",
      opciones: [
        { valor: "disponible", nombre: "Disponible" },
        { valor: "vendido", nombre: "Vendido" },
      ],
    }),
    campo({ clave: "m2_totales", nombre: "m² totales", tipo: "calculado" }),
  ],
  padres: [{ clave: "edificio_unidades", objeto: "edificio", nombre: "Edificio", obligatoria: true }],
  hijos: [],
};

describe("columnas", () => {
  it("reconoce campos por nombre o clave, sin acentos ni mayúsculas, y el padre por su nombre", () => {
    const { columnas, noReconocidas } = reconocerColumnas(UNIDAD, ["EDIFICIO", "piso", "Tipologia", "VALOR", "Cochera"]);
    expect(columnas.map((c) => (c.tipo === "campo" ? c.clave : `padre:${c.relacion}`))).toEqual([
      "padre:edificio_unidades",
      "piso",
      "tipologia",
      "valor",
    ]);
    expect(noReconocidas).toEqual(["Cochera"]);
  });

  it("un calculado exportado vuelve sin avisar ni cargarse", () => {
    expect(reconocerColumnas(UNIDAD, ["Piso", "m² totales"]).noReconocidas).toEqual([]);
  });
});

describe("leer", () => {
  it("lee las filas, saltea las vacías y deja afuera las celdas vacías", () => {
    const l = leerCsv(UNIDAD, "Edificio;Piso;Tipología;Valor\nOlazábal 2649;6;B;120.000\n;;;\nOlazábal 2649;1;11;\n");
    expect(l.errores).toEqual([]);
    expect(l.filas).toEqual([
      { fila: 2, valores: { piso: "6", tipologia: "B", valor: "120.000" }, padres: { edificio_unidades: "Olazábal 2649" } },
      { fila: 4, valores: { piso: "1", tipologia: "11" }, padres: { edificio_unidades: "Olazábal 2649" } },
    ]);
  });

  it("sin ningún campo reconocido, error", () => {
    expect(leerCsv(UNIDAD, "Nombre,Teléfono\nAna,1\n").errores[0]?.mensaje).toMatch(/ningún campo/);
  });
});

describe("moneda", () => {
  it("se escribe en unidades y viaja en centavos; «-» es sin precio", () => {
    const valor = UNIDAD.campos[2]!;
    expect(valorDeCelda(valor, "120.000")).toBe(12000000);
    expect(valorDeCelda(valor, "1500,50")).toBe(150050);
    expect(valorDeCelda(valor, "-")).toBeNull();
    expect(valorDeCelda(UNIDAD.campos[0]!, "6")).toBe("6");
  });
});

describe("exportar", () => {
  it("genera las mismas columnas que lee el importador (ida y vuelta)", () => {
    const csv = generarCsv(
      UNIDAD,
      [
        {
          id: "reg_1",
          titulo: "6B",
          valores: { piso: 6, tipologia: "B", valor: 12000000, estado: "vendido", m2_totales: 80 },
          padres: { edificio_unidades: "reg_e" },
          creadoEn: null,
        },
      ],
      { edificio_unidades: { reg_e: "Olazábal 2649" } }
    );
    expect(csv.replace("﻿", "")).toBe("Edificio,Piso,Tipología,Valor,Estado\nOlazábal 2649,6,B,120000,Vendido\n");
    const vuelta = leerCsv(UNIDAD, csv);
    expect(vuelta.noReconocidas).toEqual([]);
    expect(vuelta.filas[0]?.valores).toEqual({ piso: "6", tipologia: "B", valor: "120000", estado: "Vendido" });
  });
});
