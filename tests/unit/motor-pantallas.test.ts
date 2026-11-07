import { describe, expect, it } from "vitest";
import { appNavGroups } from "@/lib/nav";
import { padreDeParametro } from "@/server/motor/api";
import { aEntrada, desdeRegistro, valorVisible } from "@/components/motor/campos";
import type { CampoDto } from "@/lib/motor/dto";

/** Motor — paso 3: menú, parámetros y formularios (sin base). */

function campo(parcial: Partial<CampoDto> & Pick<CampoDto, "clave" | "tipo">): CampoDto {
  return {
    nombre: parcial.clave,
    obligatorio: false,
    editable: parcial.tipo !== "calculado",
    opciones: null,
    visibleLista: true,
    visibleAgente: true,
    ...parcial,
  };
}

describe("menú", () => {
  it("cada objeto del cliente entra en Ventas, antes de Oportunidades", () => {
    const grupos = appNavGroups({
      objetos: [
        { clave: "sede", nombrePlural: "Sedes", icono: "building" },
        { clave: "tratamiento", nombrePlural: "Tratamientos", icono: "no-existe" },
      ],
    });
    const ventas = grupos.find((g) => g.title === "Ventas");
    expect(ventas?.items.map((i) => i.href)).toEqual([
      "/edificios",
      "/objetos/sede",
      "/objetos/tratamiento",
      "/oportunidades",
      "/tareas",
    ]);
  });

  it("sin objetos, el menú queda como estaba", () => {
    const ventas = appNavGroups({}).find((g) => g.title === "Ventas");
    expect(ventas?.items.map((i) => i.href)).toEqual(["/edificios", "/oportunidades", "/tareas"]);
  });
});

describe("padre=<relación>:<id>", () => {
  it("separa relación e id", () => {
    expect(padreDeParametro("edificio_unidades:reg_123")).toEqual({ relacion: "edificio_unidades", id: "reg_123" });
    expect(padreDeParametro("reg:con:dos")).toEqual({ relacion: "reg", id: "con:dos" });
  });
  it("ignora valores mal formados", () => {
    expect(padreDeParametro(null)).toBeUndefined();
    expect(padreDeParametro(":x")).toBeUndefined();
    expect(padreDeParametro("x:")).toBeUndefined();
  });
});

describe("formulario", () => {
  const campos = [
    campo({ clave: "nombre", tipo: "texto" }),
    campo({ clave: "precio", tipo: "moneda" }),
    campo({ clave: "activo", tipo: "booleano" }),
    campo({ clave: "entrega", tipo: "fecha" }),
    campo({ clave: "total", tipo: "calculado" }),
  ];

  it("la moneda se escribe en unidades y viaja en centavos", () => {
    const form = desdeRegistro(campos, { nombre: "Limpieza", precio: 1500050, activo: true, entrega: "2027-03-01T00:00:00.000Z", total: 9 });
    expect(form).toEqual({ nombre: "Limpieza", precio: "15000.5", activo: true, entrega: "2027-03-01" });
    expect(aEntrada(campos, { ...form, precio: "15.000,50" })).toEqual({
      nombre: "Limpieza",
      precio: 1500050,
      activo: true,
      entrega: "2027-03-01",
    });
  });

  it("un texto vacío viaja como null; los calculados no viajan", () => {
    expect(aEntrada(campos, { nombre: "  ", total: "3" })).toEqual({ nombre: null });
  });

  it("muestra los valores legibles", () => {
    const estado = campo({
      clave: "estado",
      tipo: "seleccion",
      opciones: [{ valor: "disponible", nombre: "Disponible" }],
    });
    expect(valorVisible(estado, "disponible", "USD")).toBe("Disponible");
    expect(valorVisible(campo({ clave: "a", tipo: "booleano" }), false, "USD")).toBe("No");
    expect(valorVisible(campo({ clave: "a", tipo: "texto" }), null, "USD")).toBe("—");
  });
});
