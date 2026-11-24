import { describe, expect, it } from "vitest";
import { estadosDeTipo, etiquetaDeEstado, estadoValidoParaTipo } from "@/lib/ventas";
import { instanteAntesDelCierre } from "@/lib/sugerencias";

describe("v3 — estados por tipo", () => {
  it("cada tipo nombra sus estados", () => {
    expect(estadosDeTipo("llamada").map((e) => e.label)).toEqual(["Pendiente", "Atendió", "No atendió"]);
    expect(estadosDeTipo("mensaje").map((e) => e.label)).toEqual(["Pendiente", "Programado", "Enviado"]);
    expect(estadosDeTipo("correo").map((e) => e.value)).toEqual(["realizar", "programado", "listo"]);
    expect(estadosDeTipo("tarea").map((e) => e.label)).toEqual(["Pendiente", "Hecha"]);
  });
  it("el mismo valor guardado se llama distinto según el tipo", () => {
    expect(etiquetaDeEstado("llamada", "listo")).toBe("Atendió");
    expect(etiquetaDeEstado("mensaje", "listo")).toBe("Enviado");
    expect(etiquetaDeEstado("tarea", "listo")).toBe("Hecha");
  });
  it("una tarea no se programa", () => {
    expect(estadoValidoParaTipo("tarea", "programado")).toBe(false);
    expect(estadoValidoParaTipo("mensaje", "programado")).toBe(true);
  });
});

describe("v3 — vencimiento antes del cierre de la ventana", () => {
  const ahora = "2026-11-24T12:00:00.000Z";
  it("cuenta hacia atrás desde las 24 h del último mensaje del cliente", () => {
    expect(instanteAntesDelCierre("cierre-1h", "2026-11-24T10:00:00.000Z", ahora)).toBe("2026-11-25T09:00:00.000Z");
  });
  it("sin mensaje del cliente o con el momento ya pasado, no hay vencimiento", () => {
    expect(instanteAntesDelCierre("cierre-1h", null, ahora)).toBeNull();
    expect(instanteAntesDelCierre("cierre-4h", "2026-11-23T14:00:00.000Z", ahora)).toBeNull();
  });
  it("otro vencimiento no es de este tipo", () => {
    expect(instanteAntesDelCierre("hoy", "2026-11-24T10:00:00.000Z", ahora)).toBeUndefined();
  });
});
