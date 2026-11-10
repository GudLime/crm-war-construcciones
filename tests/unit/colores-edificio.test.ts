import { describe, expect, it } from "vitest";
import { COLORES_EDIFICIO, siguienteColor, tonoDeEdificio, VALORES_COLOR_EDIFICIO } from "@/lib/colores-edificio";

/** Rediseño (D1) — el color de cada edificio. */
describe("colores de edificio", () => {
  it("seis colores, ninguno verde", () => {
    expect(VALORES_COLOR_EDIFICIO).toHaveLength(6);
    expect(VALORES_COLOR_EDIFICIO.some((c) => /verde|lima/.test(c))).toBe(false);
  });

  it("un edificio nuevo recibe el color menos usado, en el orden de la paleta", () => {
    expect(siguienteColor([])).toBe("violeta");
    expect(siguienteColor(["violeta"])).toBe("naranja");
    expect(siguienteColor(["violeta", "naranja", "azul", "rosa", "cian", "ambar", "violeta"])).toBe("naranja");
    expect(siguienteColor([null, "desconocido"])).toBe("violeta");
  });

  it("sin color o con uno que no existe, un gris neutro", () => {
    expect(tonoDeEdificio(null).punto).toBe("#94a3b8");
    expect(tonoDeEdificio("otro").punto).toBe("#94a3b8");
    expect(tonoDeEdificio("azul")).toBe(COLORES_EDIFICIO.azul);
  });
});
