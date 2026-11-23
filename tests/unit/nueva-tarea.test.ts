import { describe, expect, it } from "vitest";
import { tituloPorDefecto } from "@/lib/tareas-por-tipo";
import { TIPOS_TAREA, etiqueta } from "@/lib/ventas";

describe("tareas por tipo en la oportunidad", () => {
  it("el título por defecto sale del tipo", () => {
    expect(tituloPorDefecto("mensaje", "visita", "Lucía Gómez", null)).toBe("Escribirle a Lucía");
    expect(tituloPorDefecto("llamada", "visita", "Lucía Gómez", null)).toBe("Llamar a Lucía");
    expect(tituloPorDefecto("reunion", "visita", "Lucía", "Lavalle")).toBe("Visita a Lavalle");
    expect(tituloPorDefecto("reunion", "reunion", "Lucía", "Lavalle")).toBe("Reunión en la oficina");
    expect(tituloPorDefecto("correo", "visita", null, null)).toBe("Mandarle el plan de pagos");
    expect(tituloPorDefecto("tarea", "visita", null, null)).toBe("Seguimiento");
    expect(tituloPorDefecto("llamada", "visita", null, null)).toBe("Llamar");
  });

  it("WhatsApp y Mail son etiquetas nuevas de los valores de siempre, y suma Tarea", () => {
    expect(etiqueta(TIPOS_TAREA, "mensaje")).toBe("WhatsApp");
    expect(etiqueta(TIPOS_TAREA, "correo")).toBe("Mail");
    expect(TIPOS_TAREA.map((t) => t.value)).toContain("tarea");
  });
});
