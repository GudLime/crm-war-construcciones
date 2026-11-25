import { describe, expect, it } from "vitest";
import {
  clavesDePagina,
  estadoDeNotion,
  estadoTareaDeNotion,
  fecha,
  ganaNotion,
  idPlano,
  instante,
  mismaFecha,
  mismoTitulo,
  personas,
  relacion,
  texto,
  tipoContactoDeNotion,
  tipoOportunidadDeNotion,
  tipoTareaDeNotion,
} from "@/lib/notion-sync";

/** War — Sincronización Notion → CRM (backfill del 25/11). */

describe("War: sincronización con Notion", () => {
  it("lee las propiedades de la API", () => {
    expect(texto({ type: "title", title: [{ plain_text: "Juan " }, { plain_text: "Pérez" }] })).toBe("Juan Pérez");
    expect(texto({ type: "status", status: { name: "Conoce información" } })).toBe("Conoce información");
    expect(texto({ type: "select", select: null })).toBeNull();
    expect(texto({ type: "phone_number", phone_number: "+54 9 11 1234-5678" })).toBe("+54 9 11 1234-5678");
    expect(texto(undefined)).toBeNull();
    expect(fecha({ type: "date", date: { start: "2026-11-25T14:50:00.000Z" } })).toBe("2026-11-25T14:50:00.000Z");
    expect(relacion({ type: "relation", relation: [{ id: "4214daa6-7f89-8184-b5dd-fc687a17bfb3" }] })).toEqual([
      "4214daa67f898184b5ddfc687a17bfb3",
    ]);
    expect(personas({ type: "people", people: [{ id: "u1", name: "Gloria" }, { id: "u2" }] })).toEqual([
      { id: "u1", nombre: "Gloria" },
      { id: "u2", nombre: null },
    ]);
  });

  it("las claves de una página, con y sin guiones", () => {
    const id = "4214daa6-7f89-8184-b5dd-fc687a17bfb3";
    expect(idPlano(id)).toBe("4214daa67f898184b5ddfc687a17bfb3");
    expect(clavesDePagina(id)).toEqual(["pagina:4214daa67f898184b5ddfc687a17bfb3", "4214daa67f898184b5ddfc687a17bfb3", id]);
  });

  it("los catálogos de Notion al CRM", () => {
    expect(estadoDeNotion("Conoce información")).toBe("conoce_informacion");
    expect(estadoDeNotion("No calificado")).toBe("no_calificado");
    expect(estadoDeNotion("No responde")).toBe("no_responde");
    expect(estadoDeNotion("Visitó")).toBe("visito");
    expect(estadoDeNotion("Otra cosa")).toBeNull();
    expect(tipoOportunidadDeNotion("Alquiler")).toBe("alquiler");
    expect(tipoTareaDeNotion("Reunión")).toBe("reunion");
    expect(estadoTareaDeNotion("Eliminar")).toBe("eliminar");
    expect(estadoTareaDeNotion("No responde")).toBe("no_responde");
    expect(tipoContactoDeNotion("Proveedor")).toBe("proveedor");
    expect(tipoContactoDeNotion(null)).toBeNull();
  });

  it("gana lo más reciente", () => {
    const antes = new Date("2026-11-20T10:00:00Z");
    const despues = new Date("2026-11-20T11:00:00Z");
    expect(ganaNotion(despues, antes)).toBe(true);
    expect(ganaNotion(antes, despues)).toBe(false);
    expect(ganaNotion(antes, antes)).toBe(false);
    expect(ganaNotion(antes, null)).toBe(true);
    expect(ganaNotion(null, antes)).toBe(false);
  });

  it("reconoce la misma tarea", () => {
    expect(mismoTitulo("4. Visita ", "4. visita")).toBe(true);
    expect(mismoTitulo("Llamar", "Follow up")).toBe(false);
    expect(mismaFecha(new Date("2026-11-20T10:00:00Z"), new Date("2026-11-20T10:00:30Z"))).toBe(true);
    expect(mismaFecha(null, null)).toBe(true);
    expect(mismaFecha(null, new Date())).toBe(false);
  });

  it("un día solo es en la zona del negocio", () => {
    expect(instante("2026-11-20")?.toISOString()).toBe("2026-11-20T15:00:00.000Z");
    expect(instante("nada")).toBeNull();
  });
});
