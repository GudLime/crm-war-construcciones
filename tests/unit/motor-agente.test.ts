import { describe, expect, it } from "vitest";
import {
  extraerMarcasFotos,
  MAX_LINEAS_AGENTE,
  renderObjetosParaAgente,
  valorParaAgente,
  type ObjetoParaAgente,
  type RegistroParaAgente,
} from "@/lib/motor/agente";
import { validarConfig } from "@/lib/motor/config";
import type { CampoMeta } from "@/lib/motor/valores";

/** Motor — paso 6: lo que el agente lee de los objetos. */

function campo(c: Partial<CampoMeta> & Pick<CampoMeta, "clave" | "nombre" | "tipo">): CampoMeta {
  return {
    columna: c.clave,
    obligatorio: false,
    opciones: null,
    calculo: null,
    visibleLista: true,
    visibleAgente: true,
    ...c,
  };
}

const edificio: ObjetoParaAgente = {
  clave: "edificio",
  nombre: "Edificio",
  nombrePlural: "Edificios",
  titulo: ["nombre"],
  agente: { filtro: { en_memoria: ["true"] } },
  campos: [
    campo({ clave: "nombre", nombre: "Nombre", tipo: "texto" }),
    campo({ clave: "barrio", nombre: "Barrio", tipo: "texto" }),
    campo({ clave: "en_memoria", nombre: "En memoria", tipo: "booleano", visibleAgente: false }),
  ],
  padres: [],
};

const estado = [
  { valor: "disponible", nombre: "Disponible" },
  { valor: "reservado", nombre: "Reservado" },
  { valor: "vendido", nombre: "Vendido" },
];

const unidad: ObjetoParaAgente = {
  clave: "unidad",
  nombre: "Unidad",
  nombrePlural: "Unidades",
  titulo: ["piso", "tipologia"],
  agente: { filtro: { estado: ["disponible"] }, agruparPor: "ambientes", rangos: ["precio"], indicacion: "Ofrecé solo estas." },
  campos: [
    campo({ clave: "piso", nombre: "Piso", tipo: "numero" }),
    campo({ clave: "tipologia", nombre: "Tipología", tipo: "texto" }),
    campo({ clave: "ambientes", nombre: "Ambientes", tipo: "numero" }),
    campo({ clave: "precio", nombre: "Precio", tipo: "moneda" }),
    campo({ clave: "estado", nombre: "Estado", tipo: "seleccion", opciones: estado }),
    campo({ clave: "notas_internas", nombre: "Notas internas", tipo: "texto", visibleAgente: false }),
  ],
  padres: [{ clave: "edificio_unidades", objeto: "edificio", nombre: "Edificio" }],
};

function u(id: string, titulo: string, edificioId: string, valores: RegistroParaAgente["valores"]): RegistroParaAgente {
  return { id, titulo, valores, padres: { edificio_unidades: edificioId } };
}

const datos = () => ({
  objetos: [edificio, unidad],
  moneda: "USD",
  registros: new Map<string, RegistroParaAgente[]>([
    [
      "edificio",
      [
        { id: "e1", titulo: "Olazábal 2649", valores: { nombre: "Olazábal 2649", barrio: "Belgrano", en_memoria: true }, padres: {} },
        { id: "e2", titulo: "Lavalle 100", valores: { nombre: "Lavalle 100", barrio: "Centro", en_memoria: false }, padres: {} },
      ],
    ],
    [
      "unidad",
      [
        u("u1", "6B", "e1", { piso: 6, tipologia: "B", ambientes: 3, precio: 18000000, estado: "disponible", notas_internas: "dueño apurado" }),
        u("u2", "2A", "e1", { piso: 2, tipologia: "A", ambientes: 3, precio: 15000000, estado: "disponible" }),
        u("u3", "1C", "e1", { piso: 1, tipologia: "C", ambientes: 2, precio: null, estado: "disponible" }),
        u("u4", "3A", "e1", { piso: 3, tipologia: "A", ambientes: 2, precio: 9000000, estado: "reservado" }),
        // Edificio fuera de memoria: su unidad no entra aunque esté disponible.
        u("u5", "6B", "e2", { piso: 6, tipologia: "B", ambientes: 3, precio: 1, estado: "disponible" }),
      ],
    ],
  ]),
});

describe("motor: lo que lee el agente", () => {
  it("formatea cada tipo como lo lee una persona", () => {
    expect(valorParaAgente(unidad.campos[3]!, 18000000, "USD")).toMatch(/180\.000/);
    expect(valorParaAgente(unidad.campos[4]!, "reservado", "USD")).toBe("Reservado");
    expect(valorParaAgente(edificio.campos[2]!, true, "USD")).toBe("sí");
    expect(valorParaAgente(unidad.campos[0]!, null, "USD")).toBeNull();
    expect(valorParaAgente(campo({ clave: "f", nombre: "F", tipo: "imagen" }), "/x.png", "USD")).toBeNull();
  });

  it("líneas que se entienden solas, con el padre y solo las columnas visibles", () => {
    const t = renderObjetosParaAgente(datos());
    expect(t).toContain("- Unidad 6B · Edificio: Olazábal 2649 · Ambientes: 3 · Precio:");
    expect(t).not.toContain("dueño apurado");
    expect(t).not.toContain("En memoria");
    expect(t).toContain("Ofrecé solo estas.");
  });

  it("el filtro deja afuera lo que no se ofrece, lo cuenta, y arrastra a los hijos", () => {
    const t = renderObjetosParaAgente(datos());
    expect(t).not.toContain("Lavalle 100");
    expect(t).not.toContain("Unidad 3A");
    expect(t).toContain("No se ofrecen (solo para tu referencia): 1 reservado.");
    // Un filtro booleano no se cuenta por valor («1 no»): se dice en palabras.
    expect(t).toContain("Además hay 1 edificio que no se ofrece.");
    // La unidad de Lavalle no se cuenta como «no se ofrece»: ni existe para el agente.
    expect(t.match(/Unidad 6B/g)).toHaveLength(1);
  });

  it("resume por grupo con rangos y ordena de menor a mayor", () => {
    const t = renderObjetosParaAgente(datos());
    // Con el padre listado, el resumen va por edificio: un rango no mezcla edificios.
    expect(t).toMatch(/- Olazábal 2649 · Ambientes 3: 2; precio de .*150\.000.* a .*180\.000/);
    expect(t).toMatch(/- Olazábal 2649 · Ambientes 2: 1; 1 sin precio/);
    // Ambientes en orden numérico.
    expect(t.indexOf("Ambientes 2:")).toBeLessThan(t.indexOf("Ambientes 3:"));
    expect(t.indexOf("Unidad 2A")).toBeLessThan(t.indexOf("Unidad 6B"));
  });

  it("sin objetos visibles no agrega nada; sin registros lo dice", () => {
    expect(renderObjetosParaAgente({ objetos: [], registros: new Map(), moneda: "USD" })).toBe("");
    const t = renderObjetosParaAgente({ objetos: [edificio], registros: new Map([["edificio", []]]), moneda: "USD" });
    expect(t).toContain("No hay edificios para ofrecer");
  });

  it("recorta los objetos enormes y lo avisa", () => {
    const muchos = Array.from({ length: MAX_LINEAS_AGENTE + 5 }, (_, i) => ({
      id: `e${i}`,
      titulo: `Torre ${i}`,
      valores: { nombre: `Torre ${i}`, en_memoria: true },
      padres: {},
    }));
    const t = renderObjetosParaAgente({ objetos: [edificio], registros: new Map([["edificio", muchos]]), moneda: "USD" });
    expect(t).toContain("(y 5 más que no entran acá");
  });

  it("la configuración valida el bloque del agente", () => {
    const base = {
      version: 1,
      cliente: "X",
      objetos: [
        {
          clave: "unidad",
          nombre: "Unidad",
          nombrePlural: "Unidades",
          titulo: ["nombre"],
          campos: [
            { clave: "nombre", nombre: "Nombre", tipo: "texto" },
            { clave: "precio", nombre: "Precio", tipo: "moneda" },
          ],
          agente: { filtro: { estado: ["x"] }, agruparPor: "nada", rangos: ["nombre"] },
        },
      ],
    };
    const r = validarConfig(base);
    expect(r.ok).toBe(false);
    const errores = r.ok ? [] : r.errores.join("\n");
    expect(errores).toContain("filtra por «estado»");
    expect(errores).toContain("agrupa por «nada»");
    expect(errores).toContain("«nombre» no es numérico");
  });
});

describe("motor: resumen por padre", () => {
  it("dos edificios con unidades de 2 ambientes: un rango por edificio", () => {
    const d = datos();
    d.registros.get("edificio")![1]!.valores.en_memoria = true;
    const t = renderObjetosParaAgente(d);
    expect(t).toMatch(/- Lavalle 100 · Ambientes 3: 1; precio /);
    expect(t).toMatch(/- Olazábal 2649 · Ambientes 3: 2; precio de /);
    // Las líneas también van agrupadas por edificio.
    expect(t.indexOf("Edificio: Lavalle 100 ·")).toBeLessThan(t.indexOf("Unidad 2A"));
  });
});

describe("fotos y video", () => {
  const conFotos: ObjetoParaAgente = {
    ...edificio,
    agente: null,
    campos: [
      ...edificio.campos,
      campo({ clave: "fotos", nombre: "Fotos", tipo: "galeria" }),
      campo({ clave: "plano", nombre: "Plano", tipo: "documento" }),
    ],
  };
  it("pone el código en la línea del registro con fotos y explica cómo usarlo", () => {
    const t = renderObjetosParaAgente({
      objetos: [conFotos],
      moneda: "USD",
      registros: new Map<string, RegistroParaAgente[]>([
        [
          "edificio",
          [
            { id: "e1", titulo: "Olazábal 2649", valores: { nombre: "Olazábal 2649", fotos: ["arc_aaaaaaaa"] }, padres: {} },
            { id: "e2", titulo: "Lavalle 100", valores: { nombre: "Lavalle 100", fotos: [], plano: "arc_bbbbbbbb" }, padres: {} },
          ],
        ],
      ]),
    });
    expect(t).toContain("- Edificio Olazábal 2649 · Fotos y video: [fotos:e1]");
    expect(t.split("\n").find((l) => l.includes("Olazábal"))).toContain("[fotos:e1]");
    expect(t.split("\n").find((l) => l.includes("Lavalle"))).not.toContain("[fotos:");
    expect(t).not.toContain("arc_");
    expect(t).toContain("escribí el código tal cual");
  });
  it("sin fotos visibles, no hay indicación", () => {
    const t = renderObjetosParaAgente(datos());
    expect(t).not.toContain("[fotos:");
    expect(t).not.toContain("escribí el código tal cual");
  });
  it("los archivos no se leen como valor", () => {
    expect(valorParaAgente(campo({ clave: "f", nombre: "F", tipo: "galeria" }), ["arc_x"], "USD")).toBeNull();
  });
});

describe("extraerMarcasFotos", () => {
  it("saca los códigos del texto y devuelve los ids, sin repetir y con tope", () => {
    expect(extraerMarcasFotos("Te paso las fotos [fotos:reg_abc123] del 6B.")).toEqual({
      texto: "Te paso las fotos del 6B.",
      ids: ["reg_abc123"],
    });
    expect(extraerMarcasFotos("Acá van [fotos:a1b2] [fotos:a1b2] [fotos:c3d4] [fotos:e5f6] [fotos:g7h8]").ids).toEqual([
      "a1b2",
      "c3d4",
      "e5f6",
    ]);
    expect(extraerMarcasFotos("[fotos:reg_abc123]")).toEqual({ texto: "", ids: ["reg_abc123"] });
  });
  it("un texto sin códigos no cambia", () => {
    const t = "Hola!\n\nEl 6B tiene  3 ambientes.";
    expect(extraerMarcasFotos(t)).toEqual({ texto: t, ids: [] });
  });
});
