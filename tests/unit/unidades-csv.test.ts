import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  claveUnidad,
  compararUnidades,
  decodificarArchivo,
  generarCsvUnidades,
  leerNumero,
  leerUnidadesCsv,
  type UnidadActual,
} from "@/lib/unidades-csv";

/**
 * Lista de precios en CSV. El fixture es una planilla INVENTADA con la misma
 * forma que las listas reales de la constructora tal como salen de Google
 * Sheets (encabezados en dos renglones, columnas calculadas, #VALUE!, estados
 * escritos en VALOR, INVERSOR, terraza, una columna TOILETTE repetida y una
 * nota sin título al final). Los precios reales no van al repo.
 */
const PLANILLA = fs.readFileSync(
  path.join(process.cwd(), "tests", "fixtures", "lista-precios-ejemplo.csv"),
  "utf8"
);

function unidad(lectura: ReturnType<typeof leerUnidadesCsv>, nombre: string) {
  const u = lectura.unidades.find((x) => x.unidad === nombre);
  if (!u) throw new Error(`no está ${nombre}`);
  return u.valores;
}

describe("números de planilla", () => {
  it.each([
    ["273.000", 273000],
    ["60,6", 60.6],
    ["1.234,5", 1234.5],
    ["USD 150.000", 150000],
    ["U$S 99.500", 99500],
    ["37", 37],
    ["", undefined],
    ["-", null],
    ["#VALUE!", null],
  ] as const)("%j → %j", (texto, esperado) => {
    expect(leerNumero(texto)).toBe(esperado);
  });

  it("lo que no es número es NaN", () => {
    expect(leerNumero("consultar")).toBeNaN();
  });
});

describe("una planilla con la forma de las reales", () => {
  const lectura = leerUnidadesCsv(PLANILLA);

  it("lee las 9 unidades, sin errores, y detecta que los precios son en USD", () => {
    expect(lectura.errores).toEqual([]);
    expect(lectura.unidades).toHaveLength(9);
    expect(lectura.monedaDetectada).toBe("USD");
  });

  it("nombra cada unidad con piso + letra", () => {
    const nombres = lectura.unidades.map((u) => u.unidad);
    expect(nombres).toEqual(["1A", "1B", "1C", "2A", "2B", "2C", "3A", "3B", "3C"]);
  });

  it("unidad disponible: precio, metros, ambientes y baños", () => {
    expect(unidad(lectura, "1B")).toEqual({
      piso: 1,
      tipologia: "3_ambientes",
      metrosCubiertos: 70,
      metrosSemicubiertos: 8,
      metrosDescubiertos: 0,
      valorCents: 25_000_000,
      estado: "disponible",
      dormitorios: 2,
      banos: 1,
      toilette: 1,
      enSuite: 0,
    });
  });

  it("decimales con coma", () => {
    const u = unidad(lectura, "1C");
    expect(u.metrosCubiertos).toBe(58.4);
    expect(u.metrosSemicubiertos).toBe(2.5);
    expect(u.valorCents).toBe(19_050_000);
  });

  it("vendida: sin precio", () => {
    const u = unidad(lectura, "1A");
    expect(u.estado).toBe("vendido");
    expect(u.valorCents).toBeNull();
  });

  it("INVERSOR se toma como disponible, con su precio", () => {
    const u = unidad(lectura, "2A");
    expect(u.estado).toBe("disponible");
    expect(u.valorCents).toBe(12_000_000);
  });

  it("'-' en VALOR: sin precio y sin aviso", () => {
    expect(unidad(lectura, "3C").valorCents).toBeNull();
  });

  it("la terraza se suma a los descubiertos", () => {
    expect(unidad(lectura, "3A").metrosDescubiertos).toBe(102); // 7 + 95
    expect(unidad(lectura, "3B").metrosDescubiertos).toBe(100); // 0 + 100
  });

  it("manda Estado, y avisa cuando VALOR dice otra cosa", () => {
    expect(unidad(lectura, "2B").estado).toBe("disponible");
    expect(unidad(lectura, "2C").estado).toBe("vendido");
    expect(lectura.avisos.map((a) => a.unidad)).toEqual(["2B", "2C"]);
    expect(lectura.avisos.every((a) => /VALOR dice/.test(a.mensaje))).toBe(true);
  });

  it("toilette: toma la columna que tiene dato aunque esté repetida", () => {
    expect(unidad(lectura, "1C").toilette).toBe(1);
    expect(unidad(lectura, "1A").toilette).toBe(0);
  });
});

describe("comparar con lo que hay en el CRM", () => {
  const lectura = leerUnidadesCsv(PLANILLA);
  const base = (over: Partial<UnidadActual> & { id: string; unidad: string }): UnidadActual => ({
    piso: null,
    tipologia: null,
    metrosCubiertos: null,
    metrosSemicubiertos: null,
    metrosDescubiertos: null,
    valorCents: null,
    estado: "disponible",
    dormitorios: null,
    banos: null,
    toilette: null,
    enSuite: null,
    ...over,
  });

  it("edificio vacío: todo es nuevo", () => {
    const c = compararUnidades([], lectura);
    expect(c.nuevas).toHaveLength(9);
    expect(c.modificadas).toHaveLength(0);
    expect(c.faltantes).toHaveLength(0);
  });

  it("empareja por unidad, muestra qué cambia y avisa lo que no vino", () => {
    const desdeArchivo = compararUnidades([], lectura).nuevas.find((n) => n.unidad === "1B")!;
    const actuales: UnidadActual[] = [
      base({ id: "dep_1b", unidad: "1°B", ...desdeArchivo.valores, valorCents: 26_000_000 }),
      base({ id: "dep_pb", unidad: "PB Local" }),
    ];
    const c = compararUnidades(actuales, lectura);
    expect(c.nuevas).toHaveLength(8);
    expect(c.modificadas).toHaveLength(1);
    expect(c.modificadas[0]!.id).toBe("dep_1b");
    expect(c.modificadas[0]!.cambios).toEqual([
      { campo: "valorCents", antes: "260.000", despues: "250.000" },
    ]);
    expect(c.faltantes).toEqual(["PB Local"]);
  });

  it("sin cambios cuando todo coincide", () => {
    const nuevas = compararUnidades([], lectura).nuevas;
    const actuales = nuevas.map((n, i) => base({ id: `d${i}`, unidad: n.unidad, ...n.valores }));
    const c = compararUnidades(actuales, lectura);
    expect(c.modificadas).toHaveLength(0);
    expect(c.sinCambios).toHaveLength(9);
  });

  it("avisa si una vendida pasa a disponible", () => {
    const c = compararUnidades([base({ id: "x", unidad: "1B", estado: "vendido" })], lectura);
    expect(c.avisos.some((a) => a.unidad === "1B" && /Vendido a Disponible/.test(a.mensaje))).toBe(true);
  });

  it("una celda vacía no cambia nada", () => {
    const l = leerUnidadesCsv("Unidad,VALOR,Estado\n3B,,\n");
    expect(l.unidades[0]!.valores).toEqual({});
    const c = compararUnidades([base({ id: "x", unidad: "3B", valorCents: 100 })], l);
    expect(c.sinCambios).toEqual(["3B"]);
  });
});

describe("ida y vuelta", () => {
  it("lo que se descarga se vuelve a leer igual", () => {
    const nuevas = compararUnidades([], leerUnidadesCsv(PLANILLA)).nuevas;
    const actuales: UnidadActual[] = nuevas.map((n, i) => ({
      id: `d${i}`,
      unidad: n.unidad,
      piso: n.valores.piso ?? null,
      tipologia: n.valores.tipologia ?? null,
      metrosCubiertos: n.valores.metrosCubiertos ?? null,
      metrosSemicubiertos: n.valores.metrosSemicubiertos ?? null,
      metrosDescubiertos: n.valores.metrosDescubiertos ?? null,
      valorCents: n.valores.valorCents ?? null,
      estado: n.valores.estado ?? "disponible",
      dormitorios: n.valores.dormitorios ?? null,
      banos: n.valores.banos ?? null,
      toilette: n.valores.toilette ?? null,
      enSuite: n.valores.enSuite ?? null,
    }));
    const csv = generarCsvUnidades(actuales);
    const otraVez = compararUnidades(actuales, leerUnidadesCsv(csv));
    expect(otraVez.errores).toEqual([]);
    expect(otraVez.nuevas).toHaveLength(0);
    expect(otraVez.modificadas).toEqual([]);
    expect(otraVez.sinCambios).toHaveLength(9);
  });
});

describe("detalles", () => {
  it("la clave de unidad ignora °, espacios y mayúsculas", () => {
    expect(claveUnidad("1°A")).toBe(claveUnidad("1a"));
    expect(claveUnidad("1 A")).toBe("1A");
  });

  it("sin columna Unidad no importa nada", () => {
    const l = leerUnidadesCsv("Piso,Precio\n1,100\n");
    expect(l.unidades).toEqual([]);
    expect(l.errores[0]!.mensaje).toMatch(/Unidad/);
  });

  it("unidad repetida en el archivo: la segunda es error", () => {
    const l = leerUnidadesCsv("Unidad,VALOR\n3B,100\n3B,200\n");
    expect(l.unidades).toHaveLength(1);
    expect(l.errores).toHaveLength(1);
  });

  it("separador ; (Excel en español) y Windows-1252", () => {
    const texto = "Unidad;Estado;Sup. Cubierta\n3B;Vendido;45,5\n";
    const bytes = new Uint8Array([...texto].map((c) => c.charCodeAt(0))).buffer;
    const l = leerUnidadesCsv(decodificarArchivo(bytes));
    expect(l.unidades[0]!.valores).toEqual({ estado: "vendido", metrosCubiertos: 45.5 });
  });
});
