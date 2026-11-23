import { describe, expect, it } from "vitest";
import { enPosicion, leerPrefTabla, moverColumna, ordenarFilas } from "@/lib/tabla";

describe("tablas configurables (v2, punto 5)", () => {
  const cols = [{ clave: "a" }, { clave: "b" }, { clave: "c" }, { clave: "d" }];
  it("posiciones: las elegidas y las nuevas al final", () => {
    expect(enPosicion(cols, ["c", "a", "x"]).map((c) => c.clave)).toEqual(["c", "a", "b", "d"]);
    expect(enPosicion(cols, []).map((c) => c.clave)).toEqual(["a", "b", "c", "d"]);
  });
  it("mover una columna sobre otra", () => {
    expect(moverColumna(["a", "b", "c", "d"], "a", "c")).toEqual(["b", "c", "a", "d"]);
    expect(moverColumna(["a", "b", "c", "d"], "d", "b")).toEqual(["a", "d", "b", "c"]);
    expect(moverColumna(["a", "b"], "a", "a")).toEqual(["a", "b"]);
  });
  it("ordena con los vacíos al final", () => {
    const filas = [{ n: "Beta" }, { n: "" }, { n: "alfa" }, { n: "Gamma" }];
    const v = (f: { n: string }) => f.n;
    expect(ordenarFilas(filas, { columna: "n", dir: "asc" }, v).map((f) => f.n)).toEqual(["alfa", "Beta", "Gamma", ""]);
    expect(ordenarFilas(filas, { columna: "n", dir: "desc" }, v).map((f) => f.n)).toEqual(["Gamma", "Beta", "alfa", ""]);
  });
  it("lee preferencias tolerando basura", () => {
    expect(leerPrefTabla({ ocultas: ["a", 3], orden: { columna: "b", dir: "x" }, anchos: { a: 10, b: 200 }, posiciones: "no" })).toEqual({
      ocultas: ["a"],
      orden: null,
      anchos: { b: 200 },
      posiciones: [],
    });
  });
});
