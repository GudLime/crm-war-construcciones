import { describe, expect, it } from "vitest";
import { filtrosContactos, paginasVisibles, rangoMostrado } from "@/lib/contactos-lista";

describe("lista de contactos paginada", () => {
  it("lee los filtros e ignora lo inválido", () => {
    const f = filtrosContactos(new URLSearchParams("pagina=3&tipo=comprador&fuente=x&agente=sin&archivados=solo&orden=creado:desc"));
    expect(f).toMatchObject({ pagina: 3, porPagina: 50, tipo: "comprador", fuente: null, agente: "sin", archivados: true, orden: "creado", dir: "desc" });
    expect(filtrosContactos(new URLSearchParams("pagina=-2"))).toMatchObject({ pagina: 1, orden: "nombre", dir: "asc", archivados: false });
  });
  it("el texto del pie y las páginas", () => {
    expect(rangoMostrado(1, 50, 1284)).toBe("Mostrando 1–50 de 1.284 contactos");
    expect(rangoMostrado(26, 50, 1284)).toBe("Mostrando 1.251–1.284 de 1.284 contactos");
    expect(paginasVisibles(5, 26)).toEqual([1, "…", 4, 5, 6, "…", 26]);
    expect(paginasVisibles(2, 4)).toEqual([1, 2, 3, 4]);
  });
});
