import { describe, expect, it } from "vitest";
import { departamentoSchema, edificioSchema, oportunidadSchema, tareaSchema } from "@/server/ventas";
import { metrosTotales, resolverInteres } from "@/lib/ventas";

describe("metros de un departamento", () => {
  it("suma solo las superficies cargadas y redondea a dos decimales", () => {
    expect(
      metrosTotales({ cubiertos: 48.5, semicubiertos: 6.25, descubiertos: 4.1 })
    ).toBe(58.85);
    expect(metrosTotales({ cubiertos: 40, semicubiertos: null, descubiertos: null })).toBe(40);
    expect(metrosTotales({ cubiertos: null, semicubiertos: null, descubiertos: null })).toBeNull();
  });
});

describe("el body de ventas", () => {
  it("acepta un departamento con metros y sin valor", () => {
    const parsed = departamentoSchema.safeParse({
      unidad: "3B",
      metrosCubiertos: 48.5,
      metrosSemicubiertos: null,
      metrosDescubiertos: 4,
      valorCents: null,
      tipologia: "2_ambientes",
    });
    expect(parsed.success).toBe(true);
  });

  it("rechaza una unidad vacía; el origen se valida contra Configuración → Orígenes", () => {
    expect(edificioSchema.safeParse({ nombre: "  " }).success).toBe(false);
    // 0035 — Los orígenes ya no son una lista fija: el body acepta texto y
    // `valoresOportunidad` exige que exista en la base al guardar.
    expect(oportunidadSchema.safeParse({ nombre: "García", origen: "Properati" }).success).toBe(true);
    expect(oportunidadSchema.safeParse({ nombre: "García", origen: "x".repeat(61) }).success).toBe(false);
    expect(tareaSchema.safeParse({ titulo: "Llamar", tipo: "llamada", fecha: null }).success).toBe(true);
  });
});

describe("interés de una oportunidad", () => {
  it("un departamento arrastra el edificio al que pertenece", () => {
    expect(
      resolverInteres({
        edificioId: null,
        departamento: { id: "dpt_1", edificioId: "edi_1" },
      })
    ).toEqual({ ok: true, edificioId: "edi_1", departamentoId: "dpt_1" });
  });

  it("rechaza una unidad de otro edificio", () => {
    const res = resolverInteres({
      edificioId: "edi_otro",
      departamento: { id: "dpt_1", edificioId: "edi_1" },
    });
    expect(res.ok).toBe(false);
  });

  it("permite interesarse solo en el edificio", () => {
    expect(resolverInteres({ edificioId: "edi_1", departamento: null })).toEqual({
      ok: true,
      edificioId: "edi_1",
      departamentoId: null,
    });
  });
});
