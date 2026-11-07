import { describe, expect, it } from "vitest";
import {
  calcularEstadisticas,
  MAX_VALORES_DIMENSION,
  SIN_VALOR,
  type Dimension,
  type MovimientoParaEstadisticas,
  type OportunidadParaEstadisticas,
} from "@/lib/estadisticas-oportunidades";
import { validarConfig } from "@/lib/motor/config";

/** Motor — paso 7: estadísticas de oportunidades con «Ver por» y filtros. */

const period = { from: "2026-10-01", to: "2026-10-31" } as never;
const bloques = ["embudo", "tiempos", "motivos", "origenes"] as const;

const op = (id: string, estado: OportunidadParaEstadisticas["estado"], extra: Partial<OportunidadParaEstadisticas> = {}) => ({
  id,
  estado,
  origen: "Meta Ads",
  tipo: "venta",
  motivo: null,
  ...extra,
});

const ops: OportunidadParaEstadisticas[] = [
  op("a", "compro"),
  op("b", "perdido", { motivo: "Presupuesto insuficiente", origen: "Zonaprop" }),
  op("c", "visito"),
  op("d", "recibido", { origen: null }),
  op("e", "no_calificado", { motivo: null }),
];

const movs: MovimientoParaEstadisticas[] = [
  { oportunidadId: "a", estadoDesde: "recibido", estadoHasta: "en_charlas", segundos: 86_400 },
  { oportunidadId: "a", estadoDesde: "en_charlas", estadoHasta: "visito", segundos: 3 * 86_400 },
  { oportunidadId: "a", estadoDesde: "visito", estadoHasta: "compro", segundos: 86_400 },
  // b llegó a Conoce información antes de perderse.
  { oportunidadId: "b", estadoDesde: "recibido", estadoHasta: "conoce_informacion", segundos: 2 * 86_400 },
  { oportunidadId: "b", estadoDesde: "conoce_informacion", estadoHasta: "perdido", segundos: 86_400 },
  { oportunidadId: "c", estadoDesde: "recibido", estadoHasta: "visito", segundos: 4 * 86_400 },
];

const edificio: Dimension = {
  clave: "rel",
  nombre: "Edificio",
  valores: new Map([
    ["a", [{ clave: "e1", nombre: "Olazábal" }]],
    ["b", [{ clave: "e1", nombre: "Olazábal" }, { clave: "e2", nombre: "Gallo" }]],
    ["c", [{ clave: "e2", nombre: "Gallo" }]],
  ]),
};

const calcular = (verPor: string | null = null, filtros: Record<string, string[]> = {}, dims: Dimension[] = [edificio]) =>
  calcularEstadisticas({ period, bloques: [...bloques], oportunidades: ops, movimientos: movs, dimensiones: dims, verPor, filtros });

describe("estadísticas de oportunidades", () => {
  it("embudo de cohorte: cuenta hasta el paso más lejano, también de las perdidas", () => {
    const { total } = calcular();
    const llegaron = Object.fromEntries(total.embudo.map((e) => [e.estado, e.llegaron]));
    expect(llegaron).toEqual({ recibido: 5, en_charlas: 3, conoce_informacion: 3, visito: 2, reservo: 1, compro: 1 });
    expect(total.conversion).toMatchObject({ value: 20, sample: 5, reliable: false });
    expect(total).toMatchObject({ entraron: 5, compraron: 1, perdidas: 1, noCalificadas: 1, abiertas: 2 });
  });

  it("tiempos por etapa en días, con mediana", () => {
    const recibido = calcular().total.tiempos.find((t) => t.estado === "recibido");
    expect(recibido).toMatchObject({ casos: 3, medianaDias: 2, promedioDias: 2.3 });
    expect(calcular().total.tiempos.map((t) => t.estado)).not.toContain("compro");
  });

  it("motivos y orígenes", () => {
    const { total } = calcular();
    expect(total.motivos).toEqual([
      { motivo: "No calificado (sin motivo)", n: 1 },
      { motivo: "Presupuesto insuficiente", n: 1 },
    ]);
    expect(total.origenes[0]).toMatchObject({ origen: "Meta Ads", entraron: 3, compraron: 1 });
    expect(total.origenes.map((o) => o.origen)).toContain("Sin origen");
  });

  it("Ver por: una oportunidad con dos valores suma en los dos grupos, y lo avisa", () => {
    const r = calcular("rel");
    expect(r.verPor).toBe("rel");
    expect(r.multiple).toBe(true);
    expect(r.grupos.map((g) => [g.nombre, g.entraron])).toEqual([
      ["Gallo", 2],
      ["Olazábal", 2],
      ["Sin edificio", 2],
    ]);
    expect(r.grupos.at(-1)?.clave).toBe(SIN_VALOR);
  });

  it("filtros: deja solo lo elegido, incluido «sin valor»", () => {
    expect(calcular(null, { rel: ["e2"] }).total.entraron).toBe(2);
    expect(calcular(null, { rel: [SIN_VALOR] }).total.entraron).toBe(2);
    // Un filtro de una dimensión que no existe se ignora.
    const r = calcular(null, { nada: ["x"] });
    expect(r.total.entraron).toBe(5);
    expect(r.filtros).toEqual({});
  });

  it("un Ver por desconocido se ignora y las opciones traen conteos", () => {
    const r = calcular("nada");
    expect(r.verPor).toBeNull();
    expect(r.opciones[0]?.valores.map((v) => [v.nombre, v.n])).toEqual([
      ["Gallo", 2],
      ["Olazábal", 2],
      ["Sin edificio", 2],
    ]);
  });

  it("campos de texto o número con demasiados valores no se ofrecen", () => {
    const muchos: Dimension = {
      clave: "m2",
      nombre: "Metros",
      pocosValores: true,
      valores: new Map(Array.from({ length: MAX_VALORES_DIMENSION + 1 }, (_, i) => [`x${i}`, [{ clave: String(i), nombre: String(i) }]])),
    };
    const otras = Array.from({ length: MAX_VALORES_DIMENSION + 1 }, (_, i) => op(`x${i}`, "recibido"));
    const r = calcularEstadisticas({ period, bloques: [...bloques], oportunidades: otras, movimientos: [], dimensiones: [muchos], verPor: "m2", filtros: {} });
    expect(r.opciones).toEqual([]);
    expect(r.verPor).toBeNull();
  });

  it("sin oportunidades: vacío pero con la forma completa", () => {
    const r = calcularEstadisticas({ period, bloques: [...bloques], oportunidades: [], movimientos: [], dimensiones: [], verPor: null, filtros: {} });
    expect(r.empty).toBe(true);
    expect(r.total.embudo).toHaveLength(6);
    expect(r.total.conversion.value).toBeNull();
  });

  it("la configuración valida el tablero", () => {
    const base = {
      version: 1,
      cliente: "X",
      objetos: [{ clave: "unidad", nombre: "Unidad", nombrePlural: "Unidades", titulo: ["nombre"], campos: [{ clave: "nombre", nombre: "Nombre", tipo: "texto" }] }],
      relaciones: [
        { clave: "op_unidades", desde: "oportunidad", hacia: "unidad", tipo: "muchos_a_muchos", nombreDesde: "Unidades", nombreHacia: "Oportunidades" },
      ],
    };
    expect(validarConfig({ ...base, estadisticas: { verPor: "op_unidades.nombre" } }).ok).toBe(true);
    expect(validarConfig({ ...base, estadisticas: { verPor: "origen", bloques: ["embudo"] } }).ok).toBe(true);
    const mal = validarConfig({ ...base, estadisticas: { verPor: "op_unidades.nada" } });
    expect(mal.ok ? "" : mal.errores.join()).toContain("no es un campo ni un padre");
    expect(validarConfig({ ...base, estadisticas: { verPor: "otra" } }).ok).toBe(false);
    expect(validarConfig({ ...base, estadisticas: { bloques: ["torta"] } }).ok).toBe(false);
  });
});
