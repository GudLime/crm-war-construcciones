import { describe, expect, it } from "vitest";
import { fechaLarga, hace, LINKS_INICIO, saludo } from "@/lib/inicio";
import { filtrosDeLaUrl } from "@/lib/vistas";

describe("Inicio del vendedor", () => {
  it("saluda según la hora", () => {
    expect(saludo(8)).toBe("Buen día");
    expect(saludo(12)).toBe("Buenas tardes");
    expect(saludo(19)).toBe("Buenas tardes");
    expect(saludo(20)).toBe("Buenas noches");
  });

  it("escribe la fecha larga", () => {
    expect(fechaLarga("2026-11-12")).toBe("Jueves 12 de noviembre");
    expect(fechaLarga("2026-01-04")).toBe("Domingo 4 de enero");
  });

  it("dice cuánto hace", () => {
    const ahora = new Date("2026-11-12T15:00:00Z");
    expect(hace("2026-11-12T14:48:00Z", ahora)).toBe("12 min");
    expect(hace("2026-11-12T12:00:00Z", ahora)).toBe("3 h");
    expect(hace("2026-11-11T14:00:00Z", ahora)).toBe("1 día");
    expect(hace("2026-11-09T14:00:00Z", ahora)).toBe("3 días");
  });
});

describe("filtros temporales por link (Oportunidades)", () => {
  const de = (href: string) => filtrosDeLaUrl(new URL(href, "http://x").searchParams);

  it("sin parámetros no hay borrador", () => {
    expect(de("/oportunidades")).toBeNull();
  });

  it("«Nuevas para vos»: mías, abiertas y sin primer contacto", () => {
    expect(de(LINKS_INICIO.nuevas)).toEqual({ responsables: ["yo"], sinPrimerContacto: true, situacion: "abiertas" });
  });

  it("«Leads calientes»: mías en Visitó", () => {
    expect(de(LINKS_INICIO.calientes)).toEqual({ responsables: ["yo"], estados: ["visito"], situacion: "abiertas" });
  });

  it("se pueden pedir las cerradas o todas", () => {
    expect(de("/oportunidades?situacion=cerradas")).toEqual({ situacion: "cerradas" });
    expect(de("/oportunidades?responsable=me&situacion=todas")).toEqual({ responsables: ["yo"] });
  });
});
