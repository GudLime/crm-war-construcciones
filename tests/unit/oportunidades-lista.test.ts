import { describe, expect, it } from "vitest";
import { anchoArrastrado, columnasPipeline, COLUMNAS, ordenar, type FilaOrdenable } from "@/lib/oportunidades-lista";
import { CAMINO_OPORTUNIDAD, type EstadoOportunidad } from "@/lib/ventas";

/** Rediseño — la lista de oportunidades: orden, anchos y pipeline (lo puro). */

const f = (
  nombre: string,
  extra: Partial<FilaOrdenable> & { id?: string } = {}
): FilaOrdenable & { id: string } => ({
  id: nombre,
  nombre,
  origen: null,
  edificios: [],
  edificioNombre: null,
  ambientes: [],
  unidades: [],
  unidad: null,
  estado: "recibido" as EstadoOportunidad,
  ultimaInteraccion: "2026-11-01T10:00:00.000Z",
  valorCents: null,
  ...extra,
});

describe("ordenar", () => {
  const filas = [
    f("Bruno", { estado: "visito", valorCents: 500, ambientes: [3], unidades: [{ titulo: "2B" }, { titulo: "10A" }], ultimaInteraccion: "2026-11-05T10:00:00.000Z" }),
    f("ana", { estado: "perdido", valorCents: null, ambientes: [4, 1], unidades: [{ titulo: "1A" }] }),
    f("Carla", { estado: "recibido", valorCents: 100, ultimaInteraccion: "2026-11-09T10:00:00.000Z" }),
  ];

  it("texto A→Z sin importar mayúsculas", () => {
    expect(ordenar(filas, { columna: "nombre", dir: "asc" }).map((x) => x.id)).toEqual(["ana", "Bruno", "Carla"]);
  });
  it("estado en el orden del embudo", () => {
    expect(ordenar(filas, { columna: "estado", dir: "asc" }).map((x) => x.id)).toEqual(["Carla", "Bruno", "ana"]);
  });
  it("valor numérico, los vacíos al final en los dos sentidos", () => {
    expect(ordenar(filas, { columna: "valor", dir: "asc" }).map((x) => x.id)).toEqual(["Carla", "Bruno", "ana"]);
    expect(ordenar(filas, { columna: "valor", dir: "desc" }).map((x) => x.id)).toEqual(["Bruno", "Carla", "ana"]);
  });
  it("ambientes por el menor, unidades por la primera; última interacción por fecha", () => {
    expect(ordenar(filas, { columna: "ambientes", dir: "asc" }).map((x) => x.id)).toEqual(["ana", "Bruno", "Carla"]);
    expect(ordenar(filas, { columna: "unidades", dir: "desc" }).map((x) => x.id)).toEqual(["Bruno", "ana", "Carla"]);
    expect(ordenar(filas, { columna: "ultima", dir: "desc" }).map((x) => x.id)).toEqual(["Carla", "Bruno", "ana"]);
  });
  it("sin orden, como vino; nunca toca el original", () => {
    expect(ordenar(filas, null).map((x) => x.id)).toEqual(["Bruno", "ana", "Carla"]);
    ordenar(filas, { columna: "nombre", dir: "desc" });
    expect(filas[0]!.id).toBe("Bruno");
  });
});

describe("columnas", () => {
  it("Oportunidad es la única fija", () => {
    expect(COLUMNAS.filter((c) => c.fija).map((c) => c.clave)).toEqual(["nombre"]);
  });
  it("el ancho arrastrado no baja de 70 px", () => {
    expect(anchoArrastrado(150, -200)).toBe(70);
    expect(anchoArrastrado(150, 40.4)).toBe(190);
  });
});

describe("pipeline", () => {
  it("una columna por etapa del camino, con contador y suma", () => {
    const cols = columnasPipeline(
      [f("a", { estado: "visito", valorCents: 100 }), f("b", { estado: "visito", valorCents: 50 }), f("c", { estado: "perdido" })],
      CAMINO_OPORTUNIDAD
    );
    expect(cols.map((c) => c.estado)).toEqual([...CAMINO_OPORTUNIDAD]);
    expect(cols.find((c) => c.estado === "visito")).toMatchObject({ total: 150 });
    expect(cols.flatMap((c) => c.items).map((x) => x.id)).not.toContain("c");
  });
});
