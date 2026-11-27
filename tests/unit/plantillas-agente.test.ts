import { describe, expect, it } from "vitest";
import { extraerMarcaPlantilla, textoConPlantilla, textoPlantillasParaAgente } from "@/lib/plantillas-agente";

describe("v7 — plantillas del agente", () => {
  it("saca el código y devuelve el atajo", () => {
    expect(extraerMarcaPlantilla("¡Genial! Te paso la info [plantilla:olazabal] .")).toEqual({
      texto: "¡Genial! Te paso la info.",
      atajo: "olazabal",
    });
    expect(extraerMarcaPlantilla("[plantilla:/Precios]").atajo).toBe("precios");
  });

  it("sin código no cambia nada", () => {
    expect(extraerMarcaPlantilla("Hola, ¿cómo estás?")).toEqual({ texto: "Hola, ¿cómo estás?", atajo: null });
  });

  it("junta el texto del agente con el de la plantilla", () => {
    expect(textoConPlantilla("", "Texto armado")).toBe("Texto armado");
    expect(textoConPlantilla("Mirá:", "Texto armado")).toBe("Mirá:\n\nTexto armado");
  });

  it("lista las plantillas para el agente, o nada", () => {
    expect(textoPlantillasParaAgente([])).toBe("");
    const t = textoPlantillasParaAgente([{ id: "qr_1", atajo: "precios", texto: "Los precios son…", adjuntos: [] }]);
    expect(t).toContain("[plantilla:precios]: Los precios son…");
  });
});
