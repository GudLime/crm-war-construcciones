import { describe, expect, it } from "vitest";
import {
  conInstruccionesReservas,
  instanteDeReserva,
  localDeInstante,
  nombreParaReserva,
  personasDeFicha,
} from "@/lib/reservas-bot";

const BA = "America/Argentina/Buenos_Aires";

describe("reservar desde el cerebro (071)", () => {
  it("fecha y hora del restaurante ↔ startUtc", () => {
    expect(instanteDeReserva("2026-12-04", "20:00", BA)).toBe("2026-12-04T23:00:00.000Z");
    expect(localDeInstante("2026-12-04T23:00:00.000Z", BA)).toEqual({ fecha: "2026-12-04", hora: "20:00" });
    // Cruza la medianoche UTC: sigue siendo el mismo día en Buenos Aires.
    expect(instanteDeReserva("2026-12-31", "22:30", BA)).toBe("2027-01-01T01:30:00.000Z");
    expect(localDeInstante("2027-01-01T01:30:00Z", BA)).toEqual({ fecha: "2026-12-31", hora: "22:30" });
    // Medianoche se escribe 00:00, nunca 24:00.
    expect(localDeInstante("2026-12-05T03:00:00Z", BA)).toEqual({ fecha: "2026-12-05", hora: "00:00" });
  });

  it("ida y vuelta en una zona con horario de verano", () => {
    const zona = "Europe/Madrid";
    for (const [fecha, hora] of [
      ["2026-07-10", "21:00"],
      ["2026-12-10", "21:00"],
    ] as const) {
      const utc = instanteDeReserva(fecha, hora, zona)!;
      expect(localDeInstante(utc, zona)).toEqual({ fecha, hora });
    }
    expect(instanteDeReserva("2026-07-10", "21:00", zona)).toBe("2026-07-10T19:00:00.000Z");
  });

  it("entradas inválidas", () => {
    expect(instanteDeReserva("2026-13-40", "20:00", BA)).toBeNull();
    expect(instanteDeReserva("2026-12-04", "8pm", BA)).toBeNull();
    expect(localDeInstante("mañana", BA)).toBeNull();
  });

  it("personas desde la ficha", () => {
    expect(personasDeFicha({ personas: 4 })).toBe(4);
    expect(personasDeFicha({ personas: "4 personas" })).toBe(4);
    expect(personasDeFicha({ personas: "somos 3" })).toBe(3);
    expect(personasDeFicha({ notas: "cumple, vienen 8 personas" })).toBe(8);
    expect(personasDeFicha({ personas: 0 })).toBeNull();
    expect(personasDeFicha({ notas: "mesa afuera" })).toBeNull();
    expect(personasDeFicha({})).toBeNull();
    expect(personasDeFicha(null)).toBeNull();
  });

  it("nombre: el de la ficha, si no el del contacto", () => {
    expect(nombreParaReserva({ nombre: " Ana " }, "Ana López")).toBe("Ana");
    expect(nombreParaReserva({}, "Ana López")).toBe("Ana López");
    expect(nombreParaReserva(null, null)).toBe("Sin nombre");
  });

  it("las reglas se suman al final de las instrucciones", () => {
    expect(conInstruccionesReservas("Sos Juli.")).toMatch(/^Sos Juli\.\n\n## Reservas/);
    expect(conInstruccionesReservas(null)).toMatch(/^## Reservas/);
    expect(conInstruccionesReservas(null)).toContain('"personas"');
  });
});
