import { describe, expect, it } from "vitest";
import { textoHorarioVisitas } from "@/lib/memoria-agente";

describe("v6 — horario de visitas en la memoria del agente", () => {
  it("lista los días con sus franjas, en orden de la semana", () => {
    expect(
      textoHorarioVisitas({
        sat: [{ start: "10:00", end: "13:00" }],
        mon: [
          { start: "10:00", end: "13:00" },
          { start: "15:00", end: "19:00" },
        ],
      })
    ).toBe("lunes 10:00–13:00 y 15:00–19:00; sábado 10:00–13:00");
  });

  it("sin horario propio devuelve null (usa el de la agenda)", () => {
    expect(textoHorarioVisitas(null)).toBeNull();
    expect(textoHorarioVisitas({})).toBeNull();
    expect(textoHorarioVisitas({ tue: [] })).toBeNull();
  });
});
