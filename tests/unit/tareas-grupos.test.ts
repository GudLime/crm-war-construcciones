import { describe, expect, it } from "vitest";
import { agruparTareas, fechaPropuesta, grupoDe } from "@/lib/tareas-grupos";

/** Rediseño (PR 6) — tareas agrupadas por fecha, en la zona del negocio. */

// Martes 10/11/2026, 15:30 en Buenos Aires (18:30 UTC).
const ahora = new Date("2026-11-10T18:30:00.000Z");
const t = (id: string, fecha: string | null, estado = "realizar") => ({ id, fecha, estado });

describe("grupoDe", () => {
  it("cada fecha a su grupo; la semana llega hasta el domingo", () => {
    expect(grupoDe(t("a", null), ahora)).toBe("sin_fecha");
    expect(grupoDe(t("a", "2026-11-09T22:00:00.000Z"), ahora)).toBe("vencidas"); // lunes 19:00
    expect(grupoDe(t("a", "2026-11-11T02:00:00.000Z"), ahora)).toBe("hoy"); // martes 23:00 local
    expect(grupoDe(t("a", "2026-11-11T13:00:00.000Z"), ahora)).toBe("manana");
    expect(grupoDe(t("a", "2026-11-15T13:00:00.000Z"), ahora)).toBe("semana"); // domingo
    expect(grupoDe(t("a", "2026-11-16T13:00:00.000Z"), ahora)).toBe("despues"); // lunes que viene
  });
  it("las hechas o sin respuesta van a Anteriores, tengan la fecha que tengan", () => {
    expect(grupoDe(t("a", "2026-11-20T13:00:00.000Z", "listo"), ahora)).toBe("anteriores");
    expect(grupoDe(t("a", null, "no_responde"), ahora)).toBe("anteriores");
  });
});

describe("agruparTareas", () => {
  it("sin grupos vacíos, Sin fecha arriba, por hora; Anteriores al revés y plegado", () => {
    const g = agruparTareas(
      [
        t("tarde", "2026-11-10T21:00:00.000Z"),
        t("temprano", "2026-11-10T19:00:00.000Z"),
        t("sin", null),
        t("vieja", "2026-10-01T13:00:00.000Z", "listo"),
        t("nueva", "2026-11-09T13:00:00.000Z", "listo"),
      ],
      ahora
    );
    expect(g.map((x) => x.clave)).toEqual(["sin_fecha", "hoy", "anteriores"]);
    expect(g[1]!.tareas.map((x) => x.id)).toEqual(["temprano", "tarde"]);
    expect(g[2]!.tareas.map((x) => x.id)).toEqual(["nueva", "vieja"]);
    expect(g[2]!.plegado).toBe(true);
  });
});

describe("fechaPropuesta", () => {
  it("«+» propone una fecha del grupo", () => {
    expect(fechaPropuesta("hoy", ahora)).toBe("2026-11-10T16:00");
    expect(fechaPropuesta("manana", ahora)).toBe("2026-11-11T10:00");
    expect(fechaPropuesta("semana", ahora)).toBe("2026-11-12T10:00");
    expect(fechaPropuesta("despues", ahora)).toBe("2026-11-16T10:00");
    expect(fechaPropuesta("vencidas", ahora)).toBeNull();
  });
});
