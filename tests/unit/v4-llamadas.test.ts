import { describe, expect, it } from "vitest";
import { resumenDeLlamada } from "@/server/inbox/llamadas";

describe("v4 — la llamada en el chat", () => {
  it("una llamada hecha sin respuesta", () => {
    expect(resumenDeLlamada({ direction: "BUSINESS_INITIATED", status: "FAILED" }).texto).toBe("Llamada hecha · Sin respuesta");
  });
  it("una llamada recibida y atendida, con la duración", () => {
    const r = resumenDeLlamada({ direction: "USER_INITIATED", status: "COMPLETED", duration: 185 });
    expect(r).toEqual({ entrante: true, texto: "Llamada recibida · Atendida · 3 min" });
  });
  it("la duración sale del inicio y el fin si no viene", () => {
    expect(resumenDeLlamada({ direction: "USER_INITIATED", start_time: 1700000000, end_time: 1700000045 }).texto).toBe(
      "Llamada recibida · Atendida · 45 s"
    );
  });
});
