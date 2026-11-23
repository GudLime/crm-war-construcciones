import { describe, expect, it } from "vitest";
import {
  datosFechasSchema,
  parametrosResultados,
  rangoDeAtajo,
  rangoDePestana,
  textoRango,
} from "@/lib/resultados";

describe("Resultados — pestañas de fechas de fábrica (relativas a hoy)", () => {
  const hoy = "2026-11-12";
  it("cada atajo", () => {
    expect(rangoDeAtajo("7d", hoy)).toEqual({ desde: "2026-11-06", hasta: hoy });
    expect(rangoDeAtajo("30d", hoy)).toEqual({ desde: "2026-10-14", hasta: hoy });
    expect(rangoDeAtajo("mes", hoy)).toEqual({ desde: "2026-11-01", hasta: hoy });
    expect(rangoDeAtajo("mes-pasado", hoy)).toEqual({ desde: "2026-10-01", hasta: "2026-10-31" });
    expect(rangoDeAtajo("90d", hoy)).toEqual({ desde: "2026-08-15", hasta: hoy });
    expect(rangoDeAtajo("anio", hoy)).toEqual({ desde: "2026-01-01", hasta: hoy });
    expect(rangoDeAtajo("mes-pasado", "2026-01-15")).toEqual({ desde: "2025-12-01", hasta: "2025-12-31" });
  });

  it("el texto del rango", () => {
    expect(textoRango({ desde: "2026-10-14", hasta: "2026-11-12" })).toBe("14/10/2026 – 12/11/2026");
    expect(textoRango({ desde: "2026-11-12", hasta: "2026-11-12" })).toBe("12/11/2026");
  });

  it("una pestaña propia guarda fechas fijas o un atajo", () => {
    expect(datosFechasSchema.safeParse({ desde: "2026-11-01", hasta: "2026-11-10" }).success).toBe(true);
    expect(datosFechasSchema.safeParse({ desde: "2026-11-10", hasta: "2026-11-01" }).success).toBe(false);
    expect(datosFechasSchema.safeParse({ atajo: "7d" }).success).toBe(true);
    expect(rangoDePestana({ datos: { desde: "2026-11-01", hasta: "2026-11-10" } }, "2026-11-20")).toEqual({
      desde: "2026-11-01",
      hasta: "2026-11-10",
    });
    expect(rangoDePestana({ datos: { atajo: "mes" } }, "2026-11-20")).toEqual({ desde: "2026-11-01", hasta: "2026-11-20" });
  });

  it("los parámetros comunes de /api/analytics", () => {
    const p = parametrosResultados({ desde: "2026-11-01", hasta: "2026-11-10" }, ["edi_1", "edi_2"], {
      origen: ["Meta Ads"],
      responsable: [],
      operacion: ["venta"],
    });
    expect(p.toString()).toBe("desde=2026-11-01&hasta=2026-11-10&edificioIds=edi_1%2Cedi_2&origen=Meta+Ads&operacion=venta");
  });
});
