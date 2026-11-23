import { describe, expect, it } from "vitest";
import { armarVisitas, diaDeSemana, tonoDeCalor, type FilaVisita } from "@/lib/visitas-resultados";

const op = (id: string, estado: string, edificio: string | null = "Lavalle") => ({
  id,
  nombre: `Op ${id}`,
  tipo: "venta",
  estado,
  responsable: "Gloria",
  edificio,
  color: edificio ? "azul" : null,
  unidad: "3B",
  ambientes: [2],
});

const fila = (p: Partial<FilaVisita> & { dia: string }): FilaVisita => ({
  id: Math.random().toString(36).slice(2),
  at: `${p.dia}T14:00:00Z`,
  status: "realizada",
  source: "manual",
  notas: null,
  oportunidad: op("o1", "visito"),
  ...p,
});

describe("Resultados — Visitas", () => {
  const filas: FilaVisita[] = [
    fila({ dia: "2026-11-07", oportunidad: op("o1", "reservo"), notas: "Le gustó la 3B" }), // sábado
    fila({ dia: "2026-11-07", oportunidad: op("o2", "visito", "Urquiza") }),
    fila({ dia: "2026-11-09", status: "no_show", oportunidad: op("o3", "conoce_informacion") }),
    fila({ dia: "2026-11-10", status: "cancelada", source: "ai" }),
    fila({ dia: "2026-11-11", status: "agendada", source: "ai" }),
    fila({ dia: "2026-11-12", oportunidad: op("o4", "perdido") }),
  ];
  const v = armarVisitas(filas, "2026-11-01", "2026-11-12", "Mateo");

  it("los cuatro números", () => {
    expect(v.totales).toEqual({ agendadas: 6, realizadas: 3, noVinieron: 1, canceladas: 1 });
  });

  it("el mapa de calor cuenta las realizadas, en semanas de lunes a domingo", () => {
    expect(v.calor.desde).toBe("2026-10-26"); // el lunes de la semana del 1/11
    expect(v.calor.hasta).toBe("2026-11-15");
    expect(v.calor.dias.find((d) => d.dia === "2026-11-07")!.n).toBe(2);
    expect(v.calor.dias.find((d) => d.dia === "2026-10-30")!.enPeriodo).toBe(false);
    expect(v.calor.porDiaSemana[5]).toBe(2); // sábado
    expect(v.calor.maximo).toBe(2);
  });

  it("serie, edificios, quién agendó y qué pasó después", () => {
    expect(v.serie.find((d) => d.dia === "2026-11-07")).toEqual({ dia: "2026-11-07", agendadas: 2, realizadas: 2 });
    expect(v.serie.find((d) => d.dia === "2026-11-10")!.agendadas).toBe(0); // la cancelada no cuenta
    expect(v.porEdificio).toEqual([
      { nombre: "Lavalle", color: "azul", n: 2 },
      { nombre: "Urquiza", color: "azul", n: 1 },
    ]);
    expect(v.quienAgendo).toEqual({ ia: 1, manual: 4 });
    expect(v.despues).toEqual({ reservo: 1, abierta: 1, perdida: 1, total: 3 });
  });

  it("la tabla, de la más reciente a la más vieja, con el comentario", () => {
    expect(v.tabla.map((t) => t.oportunidad?.id)).toEqual(["o4", "o1", "o2"]);
    expect(v.tabla.find((t) => t.oportunidad?.id === "o1")!.comentario).toBe("Le gustó la 3B");
    expect(v.oportunidadesQueVisitaron).toBe(3);
  });

  it("más de 13 semanas se recorta a las últimas 13", () => {
    const largo = armarVisitas([], "2026-01-01", "2026-11-12", "Mateo");
    expect(largo.calor.recortado).toBe(true);
    expect(largo.calor.dias.length).toBeLessThanOrEqual(14 * 7);
  });

  it("utilidades", () => {
    expect(diaDeSemana("2026-11-09")).toBe(0); // lunes
    expect(diaDeSemana("2026-11-15")).toBe(6); // domingo
    expect(tonoDeCalor(0, 5)).toBe(0);
    expect(tonoDeCalor(1, 5)).toBe(1);
    expect(tonoDeCalor(3, 5)).toBe(2);
    expect(tonoDeCalor(5, 5)).toBe(3);
  });
});
