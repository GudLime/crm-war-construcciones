import { describe, expect, it } from "vitest";
import { cicloPromedio, conversionTotal, etapasDelEmbudo, tonoDeAvance } from "@/lib/embudo-resultados";

describe("embudo por etapa de Resultados", () => {
  const e = etapasDelEmbudo([
    { estado: "recibido", nombre: "Recibido", llegaron: 86 },
    { estado: "en_charlas", nombre: "En charlas", llegaron: 61 },
    { estado: "conoce_informacion", nombre: "Conoce información", llegaron: 38 },
    { estado: "visito", nombre: "Visitó", llegaron: 12 },
    { estado: "reservo", nombre: "Reservó", llegaron: 4 },
    { estado: "compro", nombre: "Compró", llegaron: 0 },
  ]);

  it("% de la anterior y del total", () => {
    expect(e[0]).toMatchObject({ n: 86, delTotal: 100, deLaAnterior: null, alto: 200 });
    expect(e[2]).toMatchObject({ delTotal: 44, deLaAnterior: 62 });
    expect(e[5]).toMatchObject({ delTotal: 0, deLaAnterior: 0, alto: 16 });
  });

  it("la altura usa raíz cuadrada con un mínimo", () => {
    expect(e[3]!.alto).toBe(Math.round(200 * Math.sqrt(12 / 86)));
    expect(etapasDelEmbudo([{ estado: "recibido", nombre: "R", llegaron: 0 }])[0]).toMatchObject({ delTotal: null, alto: 16 });
  });

  it("colores, conversión y ciclo", () => {
    expect(tonoDeAvance(62)).toBe("verde");
    expect(tonoDeAvance(30)).toBe("ambar");
    expect(tonoDeAvance(10)).toBe("rojo");
    expect(tonoDeAvance(null)).toBeNull();
    expect(conversionTotal(3, 86)).toBe("3,5%");
    expect(cicloPromedio([{ medianaDias: 2 }, { medianaDias: null }, { medianaDias: 29.4 }])).toBe(31);
    expect(cicloPromedio([])).toBeNull();
  });
});
