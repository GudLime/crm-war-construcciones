import { describe, expect, it } from "vitest";
import { fuenteDelContacto, nombreDelLead, oportunidadParaElLead } from "@/lib/leads";
import { ORIGENES_POR_DEFECTO, origenCanonico as canonico } from "@/lib/origenes";

const NOMBRES = ORIGENES_POR_DEFECTO.map((o) => o.nombre);
const origenCanonico = (raw: string | null) => canonico(raw, NOMBRES);

/** War — Reglas de los leads de formularios (Make). */

describe("origen", () => {
  it("acepta el origen escrito de cualquier forma", () => {
    expect(origenCanonico("Meta Ads")).toBe("Meta Ads");
    expect(origenCanonico("meta_ads")).toBe("Meta Ads");
    expect(origenCanonico("  META ADS ")).toBe("Meta Ads");
    expect(origenCanonico("zonaprop")).toBe("Zonaprop");
    expect(origenCanonico("Página web")).toBe("Página Web");
  });

  it("lo que no está en la lista no se inventa", () => {
    expect(origenCanonico("Telegram")).toBeNull();
    expect(origenCanonico("")).toBeNull();
    expect(origenCanonico(null)).toBeNull();
  });

  it("vale lo que esté configurado, aunque sea nuevo", () => {
    expect(canonico("properati", [...NOMBRES, "Properati"])).toBe("Properati");
    expect(canonico("Meta Ads", ["Zonaprop"])).toBeNull();
  });

  it("un origen de anuncio marca al contacto como llegado por anuncio", () => {
    expect(fuenteDelContacto("Meta Ads")).toBe("anuncio");
    expect(fuenteDelContacto("Referido")).toBe("referido");
    expect(fuenteDelContacto("Zonaprop")).toBe("otro");
    expect(fuenteDelContacto("Un origen nuevo")).toBe("otro");
  });
});

describe("¿a qué oportunidad se suma el lead?", () => {
  const urquiza = { id: "op_urq", edificioIds: ["edi_urq"] };
  const lavalle = { id: "op_lav", edificioIds: ["edi_lav"] };
  const sinEdificio = { id: "op_wa", edificioIds: [] };

  it("sin abiertas: se abre una nueva", () => {
    expect(oportunidadParaElLead([], "edi_urq")).toBeNull();
    expect(oportunidadParaElLead([], null)).toBeNull();
  });

  it("abierta del mismo edificio: se suma a esa", () => {
    expect(oportunidadParaElLead([lavalle, urquiza], "edi_urq")).toBe("op_urq");
  });

  it("abierta de OTRO edificio: se abre una nueva", () => {
    expect(oportunidadParaElLead([lavalle], "edi_urq")).toBeNull();
  });

  it("el WhatsApp llegó antes que el formulario: se completa esa", () => {
    expect(oportunidadParaElLead([sinEdificio], "edi_urq")).toBe("op_wa");
    expect(oportunidadParaElLead([lavalle, sinEdificio], "edi_urq")).toBe("op_wa");
  });

  it("el mismo edificio gana sobre una sin edificio", () => {
    expect(oportunidadParaElLead([sinEdificio, urquiza], "edi_urq")).toBe("op_urq");
  });

  it("lead sin edificio: a la abierta más reciente", () => {
    expect(oportunidadParaElLead([lavalle, urquiza], null)).toBe("op_lav");
  });
});

describe("nombre del lead", () => {
  it("nombre completo, o nombre + apellido", () => {
    expect(nombreDelLead({ nombreCompleto: "  Ana   Pérez " })).toBe("Ana Pérez");
    expect(nombreDelLead({ nombre: "Ana", apellido: "Pérez" })).toBe("Ana Pérez");
    expect(nombreDelLead({ nombre: "Ana", apellido: null })).toBe("Ana");
    expect(nombreDelLead({})).toBeNull();
  });
});
