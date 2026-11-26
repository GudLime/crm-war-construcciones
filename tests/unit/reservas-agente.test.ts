import { describe, expect, it } from "vitest";
import { fechaLarga, resumenDeHorarios, textoDeReservasParaAgente, tramosDeDias } from "@/lib/reservas-agente";

const h = (diaSemana: number, hora: string, activo = true) => ({ diaSemana, hora, activo });

describe("datos del restaurante para el agente (071)", () => {
  it("agrupa los días en tramos, lunes primero", () => {
    expect(tramosDeDias([2, 3, 4])).toBe("martes a jueves");
    expect(tramosDeDias([5, 6])).toBe("viernes y sábado");
    expect(tramosDeDias([1, 3, 5])).toBe("lunes, miércoles y viernes");
    expect(tramosDeDias([6, 0])).toBe("sábado y domingo");
    expect(tramosDeDias([2, 3, 4, 0])).toBe("martes a jueves y domingo");
  });

  it("todos los días iguales", () => {
    const todos = [0, 1, 2, 3, 4, 5, 6].flatMap((d) => [h(d, "12:00"), h(d, "14:00"), h(d, "20:00")]);
    expect(resumenDeHorarios(todos)).toBe("todos los días a las 12:00, 14:00 y 20:00.");
  });

  it("grupos de días distintos y días cerrados; ignora los inactivos", () => {
    const horarios = [
      ...[2, 3, 4, 0].flatMap((d) => [h(d, "14:00"), h(d, "12:00")]),
      ...[5, 6].flatMap((d) => [h(d, "12:00"), h(d, "14:00"), h(d, "20:00")]),
      h(1, "12:00", false),
    ];
    expect(resumenDeHorarios(horarios)).toBe(
      "martes a jueves y domingo a las 12:00 y 14:00; viernes y sábado a las 12:00, 14:00 y 20:00. Lunes cerrado."
    );
    expect(resumenDeHorarios([h(5, "21:00")])).toBe(
      "viernes a la 21:00. Lunes a jueves, sábado y domingo cerrado."
    );
    expect(resumenDeHorarios([])).toBeNull();
  });

  it("fecha larga en castellano", () => {
    expect(fechaLarga("2026-12-24")).toBe("jueves 24 de diciembre de 2026");
  });

  const base = {
    nombre: "Lo de Ana",
    ajustes: {
      direccion: "Gorriti 1234, Palermo",
      enlaceCarta: "https://ejemplo.com/carta",
      maxPersonas: 6,
      anticipacionDias: 30,
      minutosAntes: 60,
      toleranciaMinutos: 15,
    },
    horarios: [0, 1, 2, 3, 4, 5, 6].map((d) => h(d, "20:00")),
    cierres: [
      { fecha: "2026-12-25", motivo: "Navidad" },
      { fecha: "2026-12-24", motivo: null },
      { fecha: "2026-11-01", motivo: "ya pasó" },
      { fecha: "2027-03-01", motivo: "muy lejos" },
    ],
    hoy: "2026-11-25",
  };

  it("arma el bloque completo, una línea que se entiende sola por dato", () => {
    expect(textoDeReservasParaAgente(base)).toBe(
      [
        "### Restaurante Lo de Ana",
        "Dirección del restaurante: Gorriti 1234, Palermo",
        "Reservas del restaurante: todos los días a la 20:00.",
        "Días cerrados del restaurante (próximos): jueves 24 de diciembre de 2026 y viernes 25 de diciembre de 2026 (Navidad)",
        "Tope por reserva: hasta 6 personas. Más personas las atiende alguien del equipo.",
        "Anticipación: se reserva con hasta 30 días y hasta 60 minutos antes del horario.",
        "Tolerancia de llegada: se guarda la mesa 15 minutos después del horario de la reserva.",
        "Carta del restaurante: https://ejemplo.com/carta",
      ].join("\n")
    );
  });

  it("sin dirección, carta, horarios ni cierres esas líneas no van", () => {
    const texto = textoDeReservasParaAgente({
      ...base,
      ajustes: { ...base.ajustes, direccion: " ", enlaceCarta: null, anticipacionDias: 0, minutosAntes: 0, toleranciaMinutos: null },
      horarios: [],
      cierres: [],
    });
    expect(texto).not.toMatch(/Dirección|Carta|Tolerancia|Reservas del restaurante|Días cerrados|sin dato/);
    expect(texto).toContain("Anticipación: se reserva solo para el mismo día, hasta el horario mismo.");
  });
});
