import { describe, expect, it } from "vitest";
import { COLOR_ETAPA, colorDeEtapa, varsDeEtapa } from "@/lib/colores-etapa";
import { VALORES_ESTADO_OPORTUNIDAD } from "@/lib/ventas";

describe("color por etapa", () => {
  it("cada etapa del núcleo tiene su color", () => {
    for (const e of VALORES_ESTADO_OPORTUNIDAD) expect(COLOR_ETAPA[e]).toBeDefined();
    expect(colorDeEtapa("recibido").solido).toBe("#16a34a");
    expect(colorDeEtapa("en_charlas").sobreSolido).toBe("#0c4a6e");
  });
  it("una etapa propia de un cliente cae en el gris", () => {
    expect(colorDeEtapa("mesa_lista")).toEqual(colorDeEtapa("perdido"));
    expect(colorDeEtapa(null).solido).toBe("#64748b");
  });
  it("las variables CSS", () => {
    expect(varsDeEtapa("visito")).toMatchObject({ "--et-solido": "#dc2626", "--et-lavado": "#fef6f6" });
  });
});
