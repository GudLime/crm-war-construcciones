import { describe, expect, it } from "vitest";
import {
  aNumero,
  armarTitulo,
  calcularSuma,
  convertir,
  mismoValor,
  normalizar,
  type CampoMeta,
} from "@/lib/motor/valores";

/** Motor — paso 2: conversión de valores, título y cálculos (puro). */

function campo(parcial: Partial<CampoMeta> & Pick<CampoMeta, "tipo">): CampoMeta {
  return {
    clave: "c",
    nombre: "Campo",
    columna: "c",
    obligatorio: false,
    opciones: null,
    calculo: null,
    visibleLista: true,
    visibleAgente: true,
    ...parcial,
  };
}

const ESTADO = campo({
  tipo: "seleccion",
  nombre: "Estado",
  opciones: [
    { valor: "disponible", nombre: "Disponible" },
    { valor: "consultar", nombre: "Consultar disponibilidad" },
    { valor: "vendido", nombre: "Vendido" },
  ],
});

describe("normalizar", () => {
  it("ignora mayúsculas, acentos y espacios de más", () => {
    expect(normalizar("  Olazábal   2649 ")).toBe(normalizar("olazabal 2649"));
  });
});

describe("aNumero", () => {
  it("entiende el formato argentino y el internacional", () => {
    expect(aNumero("1.234,5")).toBe(1234.5);
    expect(aNumero("1234.5")).toBe(1234.5);
    expect(aNumero("1234,5")).toBe(1234.5);
    expect(aNumero("1,234.5")).toBe(1234.5);
    expect(aNumero("$ 120000")).toBe(120000);
    expect(aNumero("6")).toBe(6);
  });
  it("solo puntos de a tres cifras son miles; si no, decimal", () => {
    expect(aNumero("120.000")).toBe(120000);
    expect(aNumero("1.250.000")).toBe(1250000);
    expect(aNumero("6.5")).toBe(6.5);
    expect(aNumero("80.25")).toBe(80.25);
  });
  it("devuelve null si no es un número", () => {
    expect(aNumero("seis")).toBeNull();
    expect(aNumero("")).toBeNull();
    expect(aNumero(null)).toBeNull();
  });
});

describe("convertir", () => {
  it("texto: recorta espacios", () => {
    expect(convertir(campo({ tipo: "texto" }), "  B ")).toEqual({ ok: true, valor: "B" });
  });

  it("vacío: null, salvo que sea obligatorio", () => {
    expect(convertir(campo({ tipo: "texto" }), "")).toEqual({ ok: true, valor: null });
    expect(convertir(campo({ tipo: "texto", obligatorio: true }), " ").ok).toBe(false);
  });

  it("moneda: centavos enteros", () => {
    expect(convertir(campo({ tipo: "moneda" }), "12000000")).toEqual({ ok: true, valor: 12000000 });
    expect(convertir(campo({ tipo: "moneda" }), "120,5").ok).toBe(false);
  });

  it("booleano: sí / no en varias formas", () => {
    expect(convertir(campo({ tipo: "booleano" }), "Sí")).toEqual({ ok: true, valor: true });
    expect(convertir(campo({ tipo: "booleano" }), "0")).toEqual({ ok: true, valor: false });
    expect(convertir(campo({ tipo: "booleano" }), "quizás").ok).toBe(false);
  });

  it("selección: acepta el valor o el nombre de la opción", () => {
    expect(convertir(ESTADO, "vendido")).toEqual({ ok: true, valor: "vendido" });
    expect(convertir(ESTADO, "consultar disponibilidad")).toEqual({ ok: true, valor: "consultar" });
    expect(convertir(ESTADO, "Reservado").ok).toBe(false);
  });

  it("selección múltiple: lista o texto separado por comas", () => {
    const amenities = campo({
      tipo: "seleccion_multiple",
      opciones: [
        { valor: "pileta", nombre: "Pileta" },
        { valor: "sum", nombre: "SUM" },
      ],
    });
    expect(convertir(amenities, "Pileta, SUM")).toEqual({ ok: true, valor: ["pileta", "sum"] });
    expect(convertir(amenities, ["sum", "sum"])).toEqual({ ok: true, valor: ["sum"] });
    expect(convertir(amenities, "gimnasio").ok).toBe(false);
  });

  it("fecha", () => {
    const r = convertir(campo({ tipo: "fecha" }), "2027-03-01");
    expect(r.ok && r.valor instanceof Date).toBe(true);
    expect(convertir(campo({ tipo: "fecha" }), "pronto").ok).toBe(false);
  });

  it("no escribe campos calculados", () => {
    expect(convertir(campo({ tipo: "calculado", columna: null }), 1).ok).toBe(false);
  });
});

describe("título", () => {
  it("pega los campos: piso 6 + B = «6B», piso 1 + 11 = «111»", () => {
    expect(armarTitulo(["piso", "tipologia"], { piso: 6, tipologia: "B" })).toBe("6B");
    expect(armarTitulo(["piso", "tipologia"], { piso: 1, tipologia: "11" })).toBe("111");
  });
  it("un campo vacío no rompe", () => {
    expect(armarTitulo(["piso", "tipologia"], { piso: null, tipologia: "B" })).toBe("B");
  });
});

describe("cálculos", () => {
  it("suma: ignora los vacíos; null si no hay ninguno", () => {
    expect(calcularSuma(["a", "b", "c"], { a: 50, b: "10,5", c: null })).toBe(60.5);
    expect(calcularSuma(["a"], { a: null })).toBeNull();
  });
});

describe("mismoValor (historial)", () => {
  it("compara por contenido", () => {
    expect(mismoValor(6, "6")).toBe(true);
    expect(mismoValor(null, undefined)).toBe(true);
    expect(mismoValor(["a"], ["a"])).toBe(true);
    expect(mismoValor(new Date("2027-01-01"), new Date("2027-01-01"))).toBe(true);
    expect(mismoValor("B", "C")).toBe(false);
  });
});
