import { describe, expect, it } from "vitest";
import { numerosDePagina } from "@/components/ventas/oportunidades-vistas";

/** La lista de oportunidades por páginas: qué botones de página se ven. */
describe("numerosDePagina", () => {
  it("la primera, la última y las vecinas; «…» si hay salto", () => {
    expect(numerosDePagina(1, 1)).toEqual([1]);
    expect(numerosDePagina(1, 3)).toEqual([1, 2, 3]);
    expect(numerosDePagina(5, 10)).toEqual([1, null, 4, 5, 6, null, 10]);
    expect(numerosDePagina(4, 80)).toEqual([1, 2, 3, 4, 5, null, 80]);
  });
});
