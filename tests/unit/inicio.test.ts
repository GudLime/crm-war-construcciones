import { describe, expect, it } from "vitest";
import {
  duracion,
  fechaLarga,
  hace,
  LINKS_INICIO,
  linksPara,
  motivoDeDerivacion,
  porcentaje,
  quedan,
  saludo,
  tendencia,
} from "@/lib/inicio";
import { resumenDelHandoff } from "@/server/bot/handoff";
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

describe("motivo de una derivación", () => {
  it("traduce el código y elige el color", () => {
    expect(motivoDeDerivacion("cliente", null)).toEqual({ texto: "Quiere hablar con una persona", tono: "rojo" });
    expect(motivoDeDerivacion("modelo", null).tono).toBe("ambar");
    expect(motivoDeDerivacion(null, null)).toEqual({ texto: "Necesita una persona", tono: "ambar" });
  });

  it("si el agente dejó un resumen, va ese texto; hablar de reservar va en color de marca", () => {
    expect(motivoDeDerivacion("modelo", "Quiere reservar la 3B")).toEqual({ texto: "Quiere reservar la 3B", tono: "marca" });
    expect(motivoDeDerivacion("cliente", "Pide hablar con Sebastián").tono).toBe("rojo");
  });
});

describe("resumen del handoff", () => {
  it("guarda el resumen o un motivo libre; un código conocido solo no deja texto", () => {
    expect(resumenDelHandoff("  Quiere señar  ", "cliente")).toBe("Quiere señar");
    expect(resumenDelHandoff(undefined, "quiere ver la unidad")).toBe("quiere ver la unidad");
    expect(resumenDelHandoff(undefined, "cliente")).toBeNull();
    expect(resumenDelHandoff(undefined, undefined)).toBeNull();
  });
});

describe("ventana de 24 h", () => {
  it("dice cuánto queda", () => {
    const ahora = new Date("2026-11-12T15:00:00Z");
    expect(quedan("2026-11-12T18:20:00Z", ahora)).toBe("quedan 3 h 20 min");
    expect(quedan("2026-11-12T15:45:00Z", ahora)).toBe("quedan 45 min");
    expect(quedan("2026-11-12T14:00:00Z", ahora)).toBe("quedan 0 min");
  });
});

describe("Tu semana y Ver como", () => {
  it("la flecha es buena o mala según el número", () => {
    expect(tendencia(5, 3, true)).toEqual({ sentido: "sube", bueno: true });
    expect(tendencia(5, 3, false)).toEqual({ sentido: "sube", bueno: false });
    expect(tendencia(2, 3, false)).toEqual({ sentido: "baja", bueno: true });
    expect(tendencia(3, 3, true)).toEqual({ sentido: "igual", bueno: null });
    expect(tendencia(null, 3, true)).toEqual({ sentido: "igual", bueno: null });
  });

  it("porcentaje y duración", () => {
    expect(porcentaje(3, 4)).toBe(75);
    expect(porcentaje(0, 0)).toBeNull();
    expect(duracion(null)).toBe("—");
    expect(duracion(600)).toBe("10 min");
    expect(duracion(3 * 3600)).toBe("3 h");
    expect(duracion(2 * 86400)).toBe("2 días");
  });

  it("los links de otra persona llevan su id", () => {
    expect(linksPara(null)).toBe(LINKS_INICIO);
    expect(linksPara("usr_gloria").nuevas).toBe("/oportunidades?responsable=usr_gloria&sinPrimerContacto=1");
    expect(linksPara("usr_gloria").visitas).toBe(LINKS_INICIO.visitas);
  });
});
