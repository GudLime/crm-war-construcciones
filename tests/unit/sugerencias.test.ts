import { describe, expect, it } from "vitest";
import {
  aplicaAlOrigen,
  completarMensaje,
  PLANTILLA_LLAMADA_SIN_ATENDER,
  PLANTILLAS_DE_FABRICA,
  sugerencias,
  vencimiento,
  type ContextoSugerencias,
  type Plantilla,
} from "@/lib/sugerencias";

const plantillas: Plantilla[] = PLANTILLAS_DE_FABRICA.map((p, i) => ({ ...p, id: `tpl_${i}` }));
const id = (nombre: string) => plantillas.find((p) => p.nombre === nombre)!.id;

function ctx(c: Partial<ContextoSugerencias> & { estado?: string }): ContextoSugerencias {
  return {
    hoy: "2026-11-20",
    ahora: "2026-11-20T13:00:00Z",
    oportunidad: { estado: c.estado ?? "recibido", responsableId: "usr_1", primerContactoAt: null, ...c.oportunidad },
    datos: { nombre: "Lucía Gómez", vendedor: "Sebastián Paz", edificio: "Lavalle", unidad: "3B", ...c.datos },
    ultimoEntranteAt: null,
    ultimoSalienteAt: null,
    citas: [],
    plantillasConTareaAbierta: [],
    descartadas: [],
    ...c,
  };
}

describe("tareas sugeridas por situación", () => {
  it("sin primer contacto: WhatsApp para hoy con las variables reemplazadas", () => {
    const s = sugerencias(plantillas, ctx({ estado: "recibido" }));
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ titulo: "Primer contacto por WhatsApp", tipo: "mensaje", vence: "2026-11-20" });
    expect(s[0]!.mensaje).toBe(
      "Hola Lucía, soy Sebastián. Te escribo por tu consulta sobre Lavalle. ¿Cuándo te queda cómodo que hablemos?"
    );
  });

  it("sin responsable no hay primer contacto que sugerir", () => {
    expect(
      sugerencias(plantillas, ctx({ estado: "recibido", oportunidad: { estado: "recibido", responsableId: null, primerContactoAt: null } }))
    ).toEqual([]);
  });

  it("no contesta: según los días de cada plantilla", () => {
    const base = { estado: "en_charlas", ultimoEntranteAt: "2026-11-10T10:00:00Z" };
    const a3 = sugerencias(plantillas, ctx({ ...base, ultimoSalienteAt: "2026-11-17T12:00:00Z" }));
    expect(a3.map((s) => s.titulo)).toEqual(["Llamar"]);
    expect(a3[0]!.porque).toBe("No contesta: le escribimos hace 3 días y no respondió");
    const a5 = sugerencias(plantillas, ctx({ ...base, ultimoSalienteAt: "2026-11-15T12:00:00Z" }));
    expect(a5.map((s) => s.titulo)).toEqual(["Llamar", "Último intento por WhatsApp"]);
    expect(a5[1]!.vence).toBe("2026-11-22");
    // Si el cliente respondió después, no hay nada.
    expect(sugerencias(plantillas, ctx({ estado: "en_charlas", ultimoSalienteAt: "2026-11-15T12:00:00Z", ultimoEntranteAt: "2026-11-16T12:00:00Z" }))).toEqual([]);
  });

  it("conoce sin visita: invitar; con visita futura: confirmar el día antes", () => {
    expect(sugerencias(plantillas, ctx({ estado: "conoce_informacion" })).map((s) => s.titulo)).toEqual(["Invitar a visitar"]);
    const con = sugerencias(
      plantillas,
      ctx({ estado: "conoce_informacion", citas: [{ at: "2026-11-24T14:00:00Z", status: "agendada" }] })
    );
    expect(con.map((s) => s.titulo)).toEqual(["Confirmar visita"]);
    expect(con[0]!.vence).toBe("2026-11-23");
    expect(con[0]!.porque).toBe("Tiene una visita el 24/11 a las 14:00 · se confirma el día anterior");
    expect(con[0]!.mensaje).toContain("el 24/11 a las 14:00");
  });

  it("visitó: follow-up y propuesta; no vino: reprogramar", () => {
    expect(sugerencias(plantillas, ctx({ estado: "visito" })).map((s) => s.titulo)).toEqual([
      "Follow-up post visita",
      "Enviar propuesta o plan de pagos",
    ]);
    expect(
      sugerencias(plantillas, ctx({ estado: "conoce_informacion", citas: [{ at: "2026-11-18T14:00:00Z", status: "no_show" }] })).map(
        (s) => s.titulo
      )
    ).toEqual(["Invitar a visitar", "Reprogramar visita"]);
  });

  it("reservó: boleto en 3 días; compró: referidos está pausada", () => {
    expect(sugerencias(plantillas, ctx({ estado: "reservo" }))).toMatchObject([{ titulo: "Coordinar firma del boleto", vence: "2026-11-23" }]);
    expect(sugerencias(plantillas, ctx({ estado: "compro" }))).toEqual([]);
  });

  it("no vuelve a sugerir con una tarea abierta de esa plantilla, y el descarte vale en su etapa", () => {
    const visito = id("Follow-up post visita");
    expect(sugerencias(plantillas, ctx({ estado: "visito", plantillasConTareaAbierta: [visito] })).map((s) => s.titulo)).toEqual([
      "Enviar propuesta o plan de pagos",
    ]);
    expect(
      sugerencias(plantillas, ctx({ estado: "visito", descartadas: [{ plantillaId: visito, estado: "visito" }] })).map((s) => s.titulo)
    ).toEqual(["Enviar propuesta o plan de pagos"]);
    // Descartada en otra etapa: vuelve a aparecer.
    expect(
      sugerencias(plantillas, ctx({ estado: "visito", descartadas: [{ plantillaId: visito, estado: "conoce_informacion" }] })).map(
        (s) => s.titulo
      )
    ).toContain("Follow-up post visita");
  });

  it("como máximo tres", () => {
    const muchas: Plantilla[] = Array.from({ length: 5 }, (_, i) => ({
      id: `x${i}`,
      nombre: `P${i}`,
      tipo: "tarea",
      situacion: "visito",
      diasSinRespuesta: null,
      vence: "hoy",
      mensaje: null,
      activa: true,
      orden: i,
      origenes: [],
    }));
    expect(sugerencias(muchas, ctx({ estado: "visito" }))).toHaveLength(3);
  });
});

describe("mensaje y vencimiento", () => {
  it("una variable sin dato queda vacía, sin llaves", () => {
    expect(completarMensaje("Hola {nombre}, la unidad {unidad} de {edificio}.", { nombre: "Lucía", edificio: null })).toBe(
      "Hola Lucía, la unidad de."
    );
  });

  it("vencimientos", () => {
    expect(vencimiento("hoy", "2026-11-20", null)).toBe("2026-11-20");
    expect(vencimiento("manana", "2026-11-30", null)).toBe("2026-12-01");
    expect(vencimiento("+7", "2026-11-28", null)).toBe("2026-12-05");
    expect(vencimiento("antes_visita", "2026-11-20", "2026-11-21T14:00:00Z")).toBe("2026-11-20");
    expect(vencimiento("antes_visita", "2026-11-20", null)).toBeNull();
  });
});

describe("0061 — primera llamada", () => {
  const llamar: Plantilla = { ...PLANTILLA_LLAMADA_SIN_ATENDER, id: "tpl_aviso" };
  const conAviso = [...plantillas, llamar];
  const op = { estado: "en_charlas", responsableId: "usr_1", primerContactoAt: "2026-11-19T10:00:00Z" };

  it("llamada sin atender: se sugiere avisar por WhatsApp", () => {
    const s = sugerencias(
      conAviso,
      ctx({ estado: "en_charlas", oportunidad: op, ultimaLlamada: { estado: "no_responde", at: "2026-11-20T12:00:00Z" } })
    );
    expect(s.map((x) => x.titulo)).toContain("Avisar que lo llamamos");
  });

  it("si escribió después de la llamada, o la atendió, no", () => {
    const despues = sugerencias(
      conAviso,
      ctx({
        estado: "en_charlas",
        oportunidad: op,
        ultimaLlamada: { estado: "no_responde", at: "2026-11-20T12:00:00Z" },
        ultimoEntranteAt: "2026-11-20T12:30:00Z",
      })
    );
    expect(despues.map((x) => x.titulo)).not.toContain("Avisar que lo llamamos");
    const atendio = sugerencias(conAviso, ctx({ estado: "en_charlas", oportunidad: op, ultimaLlamada: { estado: "listo", at: "2026-11-20T12:00:00Z" } }));
    expect(atendio.map((x) => x.titulo)).not.toContain("Avisar que lo llamamos");
  });

  it("las «al asignar» nunca se sugieren y el origen filtra", () => {
    const alAsignar: Plantilla = { ...llamar, id: "tpl_aa", nombre: "Primera llamada", tipo: "llamada", situacion: "al_asignar" };
    const soloCartel: Plantilla = { ...plantillas[0]!, id: "tpl_cartel", nombre: "Solo cartel", origenes: ["Cartel"] };
    const base = { estado: "recibido", responsableId: "usr_1", primerContactoAt: null };
    const meta = sugerencias([alAsignar, soloCartel], ctx({ estado: "recibido", oportunidad: { ...base, origen: "Meta Ads" } }));
    expect(meta).toEqual([]);
    const cartel = sugerencias([alAsignar, soloCartel], ctx({ estado: "recibido", oportunidad: { ...base, origen: "cartel" } }));
    expect(cartel.map((x) => x.titulo)).toEqual(["Solo cartel"]);
    expect(aplicaAlOrigen({ origenes: [] }, null)).toBe(true);
    expect(aplicaAlOrigen({ origenes: ["Referido"] }, null)).toBe(false);
  });
});
