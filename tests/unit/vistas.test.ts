import { describe, expect, it } from "vitest";
import { cumpleFiltros, difiereDe, filtrosSchema, limpiarFiltros, type FilaFiltrable } from "@/lib/vistas";

/** Rediseño (D5, D7) — vistas guardadas y filtros de Oportunidades (lo puro). */

const fila = (extra: Partial<FilaFiltrable> = {}): FilaFiltrable => ({
  estado: "en_charlas",
  origen: "Meta Ads",
  edificioId: "ed_1",
  edificios: [{ id: "ed_1" }, { id: "ed_2" }],
  tipologiasUnidad: ["2B"],
  paraCerrar: false,
  responsableId: "u_seba",
  ...extra,
});

describe("cumpleFiltros", () => {
  it("sin filtros, todo pasa; las listas vacías no filtran", () => {
    expect(cumpleFiltros(fila(), {}, null)).toBe(true);
    expect(cumpleFiltros(fila(), { estados: [], edificios: [] }, null)).toBe(true);
  });
  it("edificio: alcanza con uno de los de interés", () => {
    expect(cumpleFiltros(fila(), { edificios: ["ed_2"] }, null)).toBe(true);
    expect(cumpleFiltros(fila(), { edificios: ["ed_9"] }, null)).toBe(false);
    expect(cumpleFiltros(fila({ edificios: [] }), { edificios: ["ed_1"] }, null)).toBe(true);
  });
  it("origen, estado, tipología y para cerrar", () => {
    expect(cumpleFiltros(fila(), { origenes: ["Zonaprop"] }, null)).toBe(false);
    expect(cumpleFiltros(fila(), { estados: ["en_charlas", "visito"] }, null)).toBe(true);
    expect(cumpleFiltros(fila(), { tipologias: ["3A"] }, null)).toBe(false);
    expect(cumpleFiltros(fila(), { tipologias: ["2B", "3A"] }, null)).toBe(true);
    expect(cumpleFiltros(fila(), { paraCerrar: true }, null)).toBe(false);
    expect(cumpleFiltros(fila({ paraCerrar: true }), { paraCerrar: true }, null)).toBe(true);
  });
  it("responsable: «yo» es quien mira y «sin» las sin asignar", () => {
    expect(cumpleFiltros(fila(), { responsables: ["yo"] }, "u_seba")).toBe(true);
    expect(cumpleFiltros(fila(), { responsables: ["yo"] }, "u_gloria")).toBe(false);
    expect(cumpleFiltros(fila({ responsableId: null }), { responsables: ["sin"] }, "u_seba")).toBe(true);
    expect(cumpleFiltros(fila(), { responsables: ["sin", "u_seba"] }, null)).toBe(true);
    expect(cumpleFiltros(fila({ responsableId: undefined }), { responsables: ["yo"] }, null)).toBe(false);
  });
});

describe("cambios sin guardar", () => {
  const vista = { filtros: { estados: ["visito", "reservo"] }, orden: null, columnas: ["departamento"], anchos: null };
  it("el orden de los valores y las claves vacías no cuentan", () => {
    expect(
      difiereDe(vista, { filtros: { estados: ["reservo", "visito"], origenes: [] }, orden: null, columnas: ["departamento"], anchos: { nombre: 300 } })
    ).toBe(false);
  });
  it("otro filtro, otro orden u otras columnas, sí", () => {
    expect(difiereDe(vista, { ...vista, filtros: {} })).toBe(true);
    expect(difiereDe(vista, { ...vista, orden: { columna: "valor", dir: "desc" } })).toBe(true);
    expect(difiereDe(vista, { ...vista, columnas: [] })).toBe(true);
  });
  it("limpiar saca lo vacío y ordena", () => {
    expect(limpiarFiltros({ estados: ["b", "a"], origenes: [], paraCerrar: false })).toEqual({ estados: ["a", "b"] });
  });
  it("los filtros no aceptan claves desconocidas", () => {
    expect(filtrosSchema.safeParse({ cualquiera: 1 }).success).toBe(false);
  });
});
