import { describe, expect, it } from "vitest";
import { validarConfig } from "@/lib/motor/config";
import { columnasDe } from "@/lib/oportunidades-lista";
import { appNavGroups } from "@/lib/nav";
import {
  VOCABULARIO_POR_DEFECTO,
  etapasDeLaInstancia,
  nombreEstado,
  opcionesEstado,
  problemaDeVocabulario,
  rutaDeEntrada,
  vocabularioDe,
} from "@/lib/vocabulario";
import { CAMINO_OPORTUNIDAD, ESTADOS_ABIERTOS_LISTA, MOTIVOS_CIERRE } from "@/lib/ventas";

/** 071 — El vocabulario de la oportunidad por cliente (Reserva en un restaurante). */

const RESTAURANTE = {
  version: 1,
  cliente: "Restaurante",
  inmobiliario: false,
  oportunidad: {
    nombre: "Reserva",
    nombrePlural: "Reservas",
    grupoMenu: "Restaurante",
    estados: [
      { estado: "recibido", nombre: "Confirmada" },
      { estado: "compro", nombre: "Llegó" },
      { estado: "perdido", nombre: "Cancelada" },
      { estado: "no_calificado", nombre: "No vino" },
    ],
    motivosCierre: ["Canceló la persona", "Canceló el restaurante"],
    cierrePorSinRespuesta: false,
  },
};

function config(datos: unknown) {
  const r = validarConfig(datos);
  if (!r.ok) throw new Error(r.errores.join("\n"));
  return r.config;
}

describe("formato del archivo", () => {
  it("acepta el bloque de un restaurante", () => {
    const c = config(RESTAURANTE);
    expect(c.inmobiliario).toBe(false);
    expect(c.oportunidad?.estados).toHaveLength(4);
  });

  it("sin el bloque, lo inmobiliario sigue prendido (WAR no cambia)", () => {
    const c = config({ version: 1, cliente: "War" });
    expect(c.inmobiliario).toBe(true);
    expect(c.oportunidad).toBeUndefined();
  });

  it("exige «recibido», sin etapas repetidas ni motivos repetidos", () => {
    const r = validarConfig({
      ...RESTAURANTE,
      oportunidad: {
        ...RESTAURANTE.oportunidad,
        estados: [
          { estado: "compro", nombre: "Llegó" },
          { estado: "compro", nombre: "Vino" },
        ],
        motivosCierre: ["A", "A"],
      },
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errores.join("\n")).toMatch(/recibido/);
    expect(r.errores.join("\n")).toMatch(/repetido/);
    expect(r.errores.join("\n")).toMatch(/motivos repetidos/);
  });

  it("rechaza una etapa que no es del núcleo", () => {
    const r = validarConfig({
      ...RESTAURANTE,
      oportunidad: { ...RESTAURANTE.oportunidad, estados: [{ estado: "sentada", nombre: "Sentada" }] },
    });
    expect(r.ok).toBe(false);
  });
});

describe("vocabularioDe", () => {
  it("sin configuración es el de siempre", () => {
    const v = vocabularioDe(null);
    expect(v).toEqual(VOCABULARIO_POR_DEFECTO);
    expect(v.camino).toEqual([...CAMINO_OPORTUNIDAD]);
    expect(v.abiertosLista).toEqual([...ESTADOS_ABIERTOS_LISTA]);
    expect(v.motivos).toEqual([...MOTIVOS_CIERRE]);
    // Los cierres del panel del chat siguen siendo No calificado y Perdido.
    expect(v.cierres.filter((e) => e !== "compro")).toEqual(["no_calificado", "perdido"]);
  });

  it("un restaurante: Reserva, camino Confirmada → Llegó y cierres Cancelada y No vino", () => {
    const v = vocabularioDe(config(RESTAURANTE));
    expect(v.singular).toBe("Reserva");
    expect(v.plural).toBe("Reservas");
    expect(v.grupoMenu).toBe("Restaurante");
    expect(v.camino).toEqual(["recibido", "compro"]);
    expect(v.abiertosLista).toEqual(["recibido"]);
    expect(v.cierres).toEqual(["compro", "perdido", "no_calificado"]);
    expect(v.inmobiliario).toBe(false);
    expect(v.cierrePorSinRespuesta).toBe(false);
    expect(v.etiquetaCerrar).toBe("Cerrar");
    expect(nombreEstado(v, "recibido")).toBe("Confirmada");
    expect(nombreEstado(v, "no_calificado")).toBe("No vino");
  });

  it("una etapa oculta se sigue mostrando con el nombre del núcleo", () => {
    const v = vocabularioDe(config(RESTAURANTE));
    expect(nombreEstado(v, "visito")).toBe("Visitó");
    expect(opcionesEstado(v).find((o) => o.value === "visito")?.label).toBe("Visitó");
    expect(opcionesEstado(v).find((o) => o.value === "compro")?.label).toBe("Llegó");
  });
});

describe("problemaDeVocabulario", () => {
  const v = vocabularioDe(config(RESTAURANTE));

  it("rechaza una etapa o un motivo que la instancia no usa", () => {
    expect(problemaDeVocabulario(v, { estado: "visito" })).toMatch(/no es una etapa de reservas/);
    expect(problemaDeVocabulario(v, { motivoCierre: "Busca más metros" })).toMatch(/no es un motivo/);
  });

  it("acepta lo que la instancia usa y lo que ya tenía guardado", () => {
    expect(problemaDeVocabulario(v, { estado: "perdido", motivoCierre: "Canceló la persona" })).toBeNull();
    expect(
      problemaDeVocabulario(v, { estado: "visito", motivoCierre: "No responde" }, { estado: "visito", motivoCierre: "No responde" })
    ).toBeNull();
  });

  it("con el de siempre, nada cambia", () => {
    expect(problemaDeVocabulario(VOCABULARIO_POR_DEFECTO, { estado: "visito", motivoCierre: "No responde" })).toBeNull();
  });
});

describe("pantallas", () => {
  it("el menú usa el nombre y saca Edificios sin lo inmobiliario", () => {
    const v = vocabularioDe(config(RESTAURANTE));
    const grupos = appNavGroups({ role: "owner", vocabulario: v });
    const ventas = grupos.find((g) => g.title === "Restaurante");
    expect(ventas?.items.map((i) => i.label)).toEqual(["Reservas", "Tareas", "Asignaciones"]);
    const deSiempre = appNavGroups({ role: "owner" }).find((g) => g.title === "Ventas");
    expect(deSiempre?.items.map((i) => i.label)).toEqual(["Edificios", "Oportunidades", "Tareas", "Asignaciones"]);
  });

  it("la lista no tiene columnas inmobiliarias y la primera se llama como la oportunidad", () => {
    const v = vocabularioDe(config(RESTAURANTE));
    const claves = columnasDe(v).map((c) => c.clave);
    expect(claves).not.toContain("interes");
    expect(claves).not.toContain("ambientes");
    expect(columnasDe(v)[0]?.titulo).toBe("Reserva");
    expect(columnasDe(VOCABULARIO_POR_DEFECTO).map((c) => c.clave)).toContain("ambientes");
  });

  it("el embudo de Resultados solo tiene las etapas de la instancia y recalcula el avance", () => {
    const v = vocabularioDe(config(RESTAURANTE));
    const grupo = {
      embudo: CAMINO_OPORTUNIDAD.map((estado, i) => ({ estado, nombre: estado, llegaron: 10 - i, avance: null as number | null })),
      tiempos: CAMINO_OPORTUNIDAD.filter((e) => e !== "compro").map((estado) => ({ estado, nombre: estado })),
    };
    const r = etapasDeLaInstancia(v, grupo, (a, b) => a / b);
    expect(r.embudo.map((e) => e.nombre)).toEqual(["Confirmada", "Llegó"]);
    // Recibido 10 → Compró 5 (los del medio no cuentan).
    expect(r.embudo[0]?.avance).toBe(0.5);
    expect(r.embudo[1]?.avance).toBeNull();
    expect(r.tiempos.map((t) => t.nombre)).toEqual(["Confirmada"]);
  });
});

describe("menú del cliente (071)", () => {
  const conMenu = (menu: unknown) => {
    const r = validarConfig({ ...RESTAURANTE, menu });
    if (!r.ok) throw new Error(r.errores.join("; "));
    return vocabularioDe(r.config);
  };
  const RESTO = {
    trabajo: ["oportunidades", "inbox", "contacts", "results"],
    nombres: { results: "Dashboard" },
    ocultar: ["inicio", "pipeline", "tareas"],
  };

  it("arma Trabajo en ese orden y saca esas pantallas de su grupo", () => {
    const grupos = appNavGroups({ role: "owner", vocabulario: conMenu(RESTO) });
    expect(grupos[0]!.title).toBe("Trabajo");
    expect(grupos[0]!.items.map((i) => i.label)).toEqual(["Reservas", "Bandeja", "Contactos", "Dashboard"]);
    const todo = grupos.flatMap((g) => g.items.map((i) => i.href));
    expect(todo).not.toContain("/inicio");
    expect(todo).not.toContain("/pipeline");
    expect(todo).not.toContain("/tareas");
    // El grupo Restaurante queda vacío y no se muestra; Resultados no se repite.
    expect(grupos.some((g) => g.title === "Restaurante")).toBe(false);
    expect(todo.filter((h) => h === "/results")).toHaveLength(1);
  });

  it("sin Inicio se entra a la primera pantalla de Trabajo", () => {
    expect(rutaDeEntrada(conMenu(RESTO))).toBe("/oportunidades");
    expect(rutaDeEntrada(VOCABULARIO_POR_DEFECTO)).toBe("/inicio");
  });

  it("sin bloque de menú todo queda como siempre", () => {
    const grupos = appNavGroups({ role: "owner", vocabulario: conMenu(undefined) });
    expect(grupos[0]!.items.map((i) => i.href)).toEqual(["/inicio", "/inbox", "/pipeline", "/contacts"]);
    expect(grupos.flatMap((g) => g.items.map((i) => i.href))).toContain("/tareas");
  });

  it("Citas también se puede ocultar (sus citas van al Calendario de Tareas)", () => {
    expect(validarConfig({ ...RESTAURANTE, menu: { ocultar: ["bookings"] } }).ok).toBe(true);
    expect(conMenu({ ocultar: ["bookings"] }).menu.ocultas).toContain("bookings");
  });

  it("rechaza una pantalla que no existe o una que no se puede apagar", () => {
    expect(validarConfig({ ...RESTAURANTE, menu: { trabajo: ["cocina"] } }).ok).toBe(false);
    expect(validarConfig({ ...RESTAURANTE, menu: { ocultar: ["inbox"] } }).ok).toBe(false);
  });
});
