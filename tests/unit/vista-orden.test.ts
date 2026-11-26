import { describe, expect, it } from "vitest";
import { ordenarVistas } from "@/lib/vistas";

/** v6 — Cada persona ordena sus pestañas arrastrándolas. */
describe("ordenarVistas", () => {
  const vistas = [{ id: "todas" }, { id: "para-cerrar" }, { id: "vg_a" }, { id: "vg_b" }];
  const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

  it("sin orden guardado, como vienen", () => {
    expect(ids(ordenarVistas(vistas, []))).toEqual(["todas", "para-cerrar", "vg_a", "vg_b"]);
  });

  it("primero las ordenadas; las nuevas, al final; un id que ya no existe no molesta", () => {
    expect(ids(ordenarVistas(vistas, ["vg_b", "todas", "vg_borrada"]))).toEqual(["vg_b", "todas", "para-cerrar", "vg_a"]);
  });
});
