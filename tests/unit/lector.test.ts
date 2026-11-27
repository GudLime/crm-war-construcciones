import { describe, expect, it } from "vitest";
import { esTrivial, etapaQueSube } from "@/lib/lector";

describe("v7 — lector: la etapa solo sube", () => {
  it("sube de Recibido a En charlas o Conoce información", () => {
    expect(etapaQueSube("recibido", "en_charlas")).toBe("en_charlas");
    expect(etapaQueSube("recibido", "conoce_informacion")).toBe("conoce_informacion");
    expect(etapaQueSube("en_charlas", "conoce_informacion")).toBe("conoce_informacion");
  });

  it("nunca baja ni pisa una etapa más avanzada", () => {
    expect(etapaQueSube("conoce_informacion", "en_charlas")).toBeNull();
    expect(etapaQueSube("visito", "conoce_informacion")).toBeNull();
    expect(etapaQueSube("reservo", "en_charlas")).toBeNull();
  });

  it("no pone etapas que son de una persona, ni toca una cerrada", () => {
    expect(etapaQueSube("recibido", "visito")).toBeNull();
    expect(etapaQueSube("recibido", "compro")).toBeNull();
    expect(etapaQueSube("perdido", "en_charlas")).toBeNull();
    expect(etapaQueSube("recibido", null)).toBeNull();
  });
});

describe("v7 — lector: mensajes que no aportan", () => {
  it("reconoce los triviales", () => {
    for (const t of ["ok", "Gracias!", "👍", "dale gracias", "Jajaja", "Buenas tardes", ""]) expect(esTrivial(t)).toBe(true);
  });
  it("lo demás se lee", () => {
    for (const t of ["Quiero info del 2 ambientes en Olazábal", "¿Cuánto sale?", "Sí, me interesa"]) expect(esTrivial(t)).toBe(false);
  });
});
