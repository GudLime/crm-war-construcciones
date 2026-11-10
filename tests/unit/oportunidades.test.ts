import { describe, expect, it } from "vitest";
import {
  estaAbierta,
  normalizarTipoContacto,
  normalizarTipologias,
  resolverEdificiosPorNombre,
  resolverEstadoOportunidad,
  siguientesParaLaIA,
  tipoExcluyeDeVenta,
} from "@/lib/ventas";
import { INSTRUCCIONES_OPORTUNIDADES, conInstruccionesOportunidades } from "@/lib/instrucciones-oportunidades";

/**
 * 068 — Oportunidades de War. Las reglas de negocio se prueban como tabla y
 * sin base: qué es abierto, hasta dónde mueve la IA, y cómo se lee lo que el
 * cerebro escribe en la ficha.
 */

describe("abiertas y cerradas", () => {
  it("cerradas: compró, perdido y no calificado; el resto sigue abierta", () => {
    expect(estaAbierta("recibido")).toBe(true);
    expect(estaAbierta("reservo")).toBe(true);
    expect(estaAbierta("compro")).toBe(false);
    expect(estaAbierta("perdido")).toBe(false);
    expect(estaAbierta("no_calificado")).toBe(false);
  });

  it("0034 permite varias abiertas por contacto (una por edificio)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const sql = fs.readFileSync(
      path.join(process.cwd(), "drizzle", "0034_leads_telefonos.sql"),
      "utf8"
    );
    expect(sql).toContain('DROP INDEX IF EXISTS "oportunidad_una_abierta_uq"');
  });
});

describe("la IA mueve solo hacia adelante y hasta Conoce información", () => {
  it.each([
    ["recibido", ["en_charlas", "conoce_informacion"]],
    ["en_charlas", ["conoce_informacion"]],
    ["conoce_informacion", []],
    ["visito", []],
    ["compro", []],
  ] as const)("desde %s → %j", (actual, esperado) => {
    expect(siguientesParaLaIA(actual)).toEqual(esperado);
  });

  it("entiende la etapa por clave o por etiqueta, con o sin acentos", () => {
    expect(resolverEstadoOportunidad("en_charlas")).toBe("en_charlas");
    expect(resolverEstadoOportunidad("En charlas")).toBe("en_charlas");
    expect(resolverEstadoOportunidad("Conoce información")).toBe("conoce_informacion");
    expect(resolverEstadoOportunidad("conoce informacion")).toBe("conoce_informacion");
    expect(resolverEstadoOportunidad("Visitó")).toBe("visito");
    expect(resolverEstadoOportunidad("cualquier cosa")).toBeNull();
  });
});

describe("tipo de contacto", () => {
  it("solo el lead entra a la venta", () => {
    expect(tipoExcluyeDeVenta(null)).toBe(false);
    expect(tipoExcluyeDeVenta("lead")).toBe(false);
    for (const t of ["comprador", "inmobiliaria", "proveedor", "propio"] as const) {
      expect(tipoExcluyeDeVenta(t)).toBe(true);
    }
  });

  it.each([
    ["lead", "lead"],
    ["Lead", "lead"],
    ["prospecto", "lead"],
    ["Inmobiliaria", "inmobiliaria"],
    ["inmobiliarias", "inmobiliaria"],
    ["Proveedor", "proveedor"],
    ["proveedores", "proveedor"],
    ["comprador", "comprador"],
    ["Propio de WAR", "propio"],
    ["", null],
    ["no sé todavía", null],
    [42, null],
  ] as const)("%j → %j", (raw, esperado) => {
    expect(normalizarTipoContacto(raw)).toBe(esperado);
  });
});

describe("tipologías desde texto libre", () => {
  it.each([
    ["2 ambientes", ["2_ambientes"]],
    ["monoambiente, 2 amb", ["1_ambiente", "2_ambientes"]],
    ["tres ambientes o triplex", ["3_ambientes", "triplex"]],
    ["Tríplex", ["triplex"]],
    ["4 ambientes y 2 ambientes", ["2_ambientes", "4_ambientes"]],
    ["algo grande", []],
  ] as const)("%j → %j", (raw, esperado) => {
    expect(normalizarTipologias(raw)).toEqual(esperado);
  });
});

describe("edificios por nombre o calle", () => {
  const edificios = [
    { id: "edi_1", nombre: "Lavalle", direccion: "Lavalle 3086, Almagro" },
    { id: "edi_2", nombre: "Gallo", direccion: "Gallo 716, Almagro" },
    { id: "edi_3", nombre: "Olazábal", direccion: "Olazábal 2649, Belgrano" },
    { id: "edi_4", nombre: "Urquiza", direccion: "Urquiza 1872, Vicente López" },
  ];

  it("varios, sin acentos y por calle con número", () => {
    const ids = resolverEdificiosPorNombre("olazabal, Gallo 716", edificios).map((e) => e.id);
    expect(ids.sort()).toEqual(["edi_2", "edi_3"]);
  });

  it("por barrio de la dirección", () => {
    const ids = resolverEdificiosPorNombre("Vicente López", edificios).map((e) => e.id);
    expect(ids).toEqual(["edi_4"]);
  });

  it("lo que no reconoce no suma nada", () => {
    expect(resolverEdificiosPorNombre("Palermo", edificios)).toEqual([]);
    expect(resolverEdificiosPorNombre(null, edificios)).toEqual([]);
  });
});

describe("instrucciones fijas para el agente", () => {
  it("se suman después de las del negocio, sin pisarlas", () => {
    const out = conInstruccionesOportunidades("Sos Mateo.");
    expect(out.startsWith("Sos Mateo.")).toBe(true);
    expect(out).toContain("tipo_contacto");
    expect(out).toContain("edificios_interes");
    expect(out).toContain("tipologias_interes");
  });

  it("sin instrucciones del negocio, van solas", () => {
    expect(conInstruccionesOportunidades(null)).toBe(INSTRUCCIONES_OPORTUNIDADES);
    expect(conInstruccionesOportunidades("   ")).toBe(INSTRUCCIONES_OPORTUNIDADES);
  });
});

describe("ambientes y tipologías de interés (0047)", () => {
  it("«N ambientes» → N y triplex cuenta como 4", async () => {
    const { ambientesDeTipologia } = await import("@/lib/ventas");
    expect(["1_ambiente", "2_ambientes", "4_ambientes", "triplex", "otra"].map(ambientesDeTipologia)).toEqual([1, 2, 4, 4, null]);
  });
  it("las unidades tipo van en orden natural y sin repetir", async () => {
    const { ordenarTipologiasUnidad } = await import("@/lib/ventas");
    expect(ordenarTipologiasUnidad(["10A", "2B", "1A", "2B", "2a"])).toEqual(["1A", "2a", "2B", "10A"]);
  });
});
