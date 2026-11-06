import { describe, expect, it } from "vitest";
import {
  agruparRafagas,
  armarTimeline,
  ultimosMensajes,
  type MensajeCorto,
} from "@/lib/oportunidad-detalle";

/** War — El timeline de la oportunidad (lo puro). */

const m = (id: string, at: string, direction: "in" | "out", texto = id): MensajeCorto => ({
  id,
  direction,
  texto,
  tipo: "text",
  origen: direction === "out" ? "ai" : "operator",
  status: "read",
  createdAt: at,
});

describe("WhatsApp por ráfagas, no mensaje por mensaje", () => {
  const msgs = [
    m("1", "2026-11-01T10:00:00.000Z", "in"),
    m("2", "2026-11-01T10:01:00.000Z", "out"),
    m("3", "2026-11-01T10:20:00.000Z", "in"),
    m("4", "2026-11-02T09:00:00.000Z", "out", "¿Seguís interesado?"),
  ];

  it("menos de 30 min entre mensajes: la misma ráfaga", () => {
    const r = agruparRafagas(msgs);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ recibidos: 2, enviados: 1 });
    expect(r[1]).toMatchObject({ recibidos: 0, enviados: 1 });
  });

  it("en el timeline, una línea por ráfaga con el último mensaje", () => {
    const t = armarTimeline({ eventos: [], mensajes: msgs, reuniones: [], tareas: [], notas: [] });
    expect(t.map((i) => i.titulo)).toEqual([
      "Conversación por WhatsApp · 1 enviado",
      "Conversación por WhatsApp · 2 recibidos, 1 enviado",
    ]);
    expect(t[0]!.detalle).toBe("Mateo: ¿Seguís interesado?");
  });

  it("los últimos mensajes: los últimos 4, en orden de lectura", () => {
    const seis = [...msgs, m("5", "2026-11-02T09:05:00.000Z", "in"), m("6", "2026-11-02T09:06:00.000Z", "out")];
    expect(ultimosMensajes(seis).map((x) => x.id)).toEqual(["3", "4", "5", "6"]);
  });
});

describe("el timeline junta todo, lo más nuevo arriba", () => {
  it("eventos, reuniones, tareas y notas", () => {
    const t = armarTimeline({
      eventos: [
        {
          id: "e1",
          tipo: "creada",
          estadoDesde: null,
          estadoHasta: "recibido",
          motivo: null,
          fuente: "make",
          actorNombre: null,
          datos: null,
          occurredAt: "2026-11-01T09:00:00.000Z",
        },
        {
          id: "e2",
          tipo: "estado",
          estadoDesde: "recibido",
          estadoHasta: "en_charlas",
          motivo: null,
          fuente: "ia",
          actorNombre: null,
          datos: null,
          occurredAt: "2026-11-01T11:00:00.000Z",
        },
        {
          id: "e3",
          tipo: "cerrada",
          estadoDesde: "en_charlas",
          estadoHasta: "perdido",
          motivo: "No responde",
          fuente: "sistema",
          actorNombre: null,
          datos: null,
          occurredAt: "2026-11-10T11:00:00.000Z",
        },
      ],
      mensajes: [],
      reuniones: [
        {
          id: "b1",
          scheduledAt: "2026-11-03T15:00:00.000Z",
          durationMinutes: 30,
          status: "no_show",
          source: "ai",
          meetingLink: null,
          createdAt: "2026-11-01T12:00:00.000Z",
        },
      ],
      tareas: [],
      notas: [{ id: "n1", texto: "Quiere cochera", autorNombre: "Sebastián", createdAt: "2026-11-02T10:00:00.000Z" }],
      ahora: new Date("2026-11-11T00:00:00.000Z"),
    });
    expect(t.map((i) => [i.titulo, i.quien])).toEqual([
      ["Se cerró: Perdido", "Automático"],
      ["Reunión no vino", null],
      ["Nota", "Sebastián"],
      [expect.stringMatching(/^Agendó una reunión para el /), "Mateo"],
      ["Recibido → En charlas", "Mateo"],
      ["Se abrió la oportunidad", "Make"],
    ]);
    expect(t[0]!.detalle).toBe("Motivo: No responde");
    expect(t[0]!.tono).toBe("malo");
  });
});
