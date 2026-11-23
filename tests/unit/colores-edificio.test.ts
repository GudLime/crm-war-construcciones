import { describe, expect, it } from "vitest";
import {
  colorValido,
  COLORES_EDIFICIO,
  esVerdoso,
  siguienteColor,
  tonoDeEdificio,
  tonoDeHex,
  VALORES_COLOR_EDIFICIO,
} from "@/lib/colores-edificio";

/** Rediseño (D1) — el color de cada edificio. */
describe("colores de edificio", () => {
  it("dieciséis colores, sin verde pleno; los seis de siempre primero", () => {
    expect(VALORES_COLOR_EDIFICIO).toHaveLength(16);
    expect(VALORES_COLOR_EDIFICIO.slice(0, 6)).toEqual(["violeta", "naranja", "azul", "rosa", "cian", "ambar"]);
    expect(VALORES_COLOR_EDIFICIO.some((c) => /verde/.test(c))).toBe(false);
    expect(VALORES_COLOR_EDIFICIO.filter((c) => esVerdoso(COLORES_EDIFICIO[c].punto))).toEqual([]);
  });

  it("un color propio: el punto tal cual, fondo claro y texto oscuro", () => {
    const t = tonoDeEdificio("#2563EB");
    expect(t.punto).toBe("#2563eb");
    expect(t.fondo).toBe(tonoDeHex("#2563eb").fondo);
    expect(parseInt(t.fondo.slice(1, 3), 16)).toBeGreaterThan(200);
    expect(parseInt(t.texto.slice(5, 7), 16)).toBeLessThan(140);
    expect(colorValido("#abcdef")).toBe(true);
    expect(colorValido("azul")).toBe(true);
    expect(colorValido("#abc")).toBe(false);
    expect(colorValido("otro")).toBe(false);
  });

  it("avisa los verdes", () => {
    expect(esVerdoso("#16a34a")).toBe(true);
    expect(esVerdoso("#2563eb")).toBe(false);
    expect(esVerdoso("#94a3b8")).toBe(false);
  });

  it("un edificio nuevo recibe el color menos usado, en el orden de la paleta", () => {
    expect(siguienteColor([])).toBe("violeta");
    expect(siguienteColor(["violeta"])).toBe("naranja");
    expect(siguienteColor(VALORES_COLOR_EDIFICIO)).toBe("violeta");
    expect(siguienteColor([...VALORES_COLOR_EDIFICIO, "violeta"])).toBe("naranja");
    expect(siguienteColor([null, "desconocido"])).toBe("violeta");
  });

  it("sin color o con uno que no existe, un gris neutro", () => {
    expect(tonoDeEdificio(null).punto).toBe("#94a3b8");
    expect(tonoDeEdificio("otro").punto).toBe("#94a3b8");
    expect(tonoDeEdificio("azul")).toBe(COLORES_EDIFICIO.azul);
  });
});
