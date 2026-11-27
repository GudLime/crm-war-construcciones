import { describe, expect, it } from "vitest";
import { edificioDelMensaje, portalDelMensaje } from "@/lib/origen-por-mensaje";

const ML =
  "Hola, tengo algunas preguntas sobre tu publicación en Mercado Libre: https://departamento.mercadolibre.com.ar/MLA-1466630720-olazabal-2649-belgrano-war-construcciones-_JM";
const ZP1 =
  "¡Hola! Quiero que me contacten por este emprendimiento que vi en  Zonaprop. https://www.zonaprop.com.ar/propiedades/emprendimiento/ememvein-belgrano-1-2-3-y-4-ambientes-olazabal-2649-50759859.html";
const ZP2 =
  "¡Hola! Quiero que se comuniquen conmigo por esta propiedad que vi en Zonaprop. https://www.zonaprop.com.ar/propiedades/clasificado/alclapin-3-ambientes-con-cochera-78-m-sup2--a-estrenar-con-60644796.html";

const EDIFICIOS = [
  { id: "ed_1", nombre: "Olazábal", direccion: "Olazábal 2649" },
  { id: "ed_2", nombre: "Conesa", direccion: "Conesa 1240" },
];

describe("v7 — origen por el primer mensaje", () => {
  it("reconoce Mercado Libre y Zonaprop por el texto o el link", () => {
    expect(portalDelMensaje(ML)).toBe("Mercado Libre");
    expect(portalDelMensaje(ZP1)).toBe("Zonaprop");
    expect(portalDelMensaje(ZP2)).toBe("Zonaprop");
    expect(portalDelMensaje("vi el aviso en zona prop")).toBe("Zonaprop");
    expect(portalDelMensaje("https://www.zonaprop.com.ar/x.html")).toBe("Zonaprop");
  });

  it("un mensaje común no tiene portal", () => {
    expect(portalDelMensaje("Hola, quería info del 2 ambientes")).toBeNull();
    expect(portalDelMensaje(null)).toBeNull();
  });

  it("saca el edificio del link cuando trae su nombre o dirección", () => {
    expect(edificioDelMensaje(ML, EDIFICIOS)?.id).toBe("ed_1");
    expect(edificioDelMensaje(ZP1, EDIFICIOS)?.id).toBe("ed_1");
    expect(edificioDelMensaje(ZP2, EDIFICIOS)).toBeNull();
  });

  it("si nombra dos edificios no elige ninguno", () => {
    expect(edificioDelMensaje("me interesan Olazábal y Conesa", EDIFICIOS)).toBeNull();
  });
});
