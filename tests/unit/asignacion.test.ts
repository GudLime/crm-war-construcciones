import { describe, expect, it } from "vitest";
import { ASIGNAR_A_IA, asignacionSchema, destinoPorEdificio, esDeMeta } from "@/lib/asignacion";

describe("0051 — asignación automática de leads de Meta", () => {
  it("cuenta como Meta los anuncios de Facebook e Instagram, escritos como vengan", () => {
    expect(esDeMeta("Meta Ads")).toBe(true);
    expect(esDeMeta("META_ADS")).toBe(true);
    expect(esDeMeta("instagram")).toBe(true);
    expect(esDeMeta("Facebook")).toBe(true);
    expect(esDeMeta("Google Ads")).toBe(false);
    expect(esDeMeta("Referido")).toBe(false);
    expect(esDeMeta(null)).toBe(false);
  });

  it("el primer edificio mapeado decide; sin ninguno, queda sin asignar", () => {
    const mapa = { ed_b: "usr_gloria", ed_c: ASIGNAR_A_IA };
    expect(destinoPorEdificio(mapa, ["ed_a", "ed_c", "ed_b"])).toBe(ASIGNAR_A_IA);
    expect(destinoPorEdificio(mapa, ["ed_b"])).toBe("usr_gloria");
    expect(destinoPorEdificio(mapa, ["ed_a"])).toBeNull();
    expect(destinoPorEdificio(mapa, [])).toBeNull();
  });

  it("el ajuste viene apagado si no se manda el mapa", () => {
    expect(asignacionSchema.parse({ activa: false })).toEqual({ activa: false, porEdificio: {} });
  });
});
