import { describe, expect, it } from "vitest";
import { calendarVisible, sinConfirmar } from "@/lib/time/calendar";

/** 0069 — Las citas sin confirmar no se ven en el calendario salvo que se prendan. */
describe("citas sin confirmar en el calendario", () => {
  const citas = [
    { id: "confirmada", kind: "session", status: "agendada", isTest: false, confirmadaAt: "2026-11-26T12:00:00Z" },
    { id: "sin", kind: "session", status: "agendada", isTest: false, confirmadaAt: null },
    { id: "vino", kind: "session", status: "realizada", isTest: false, confirmadaAt: null },
    { id: "bloqueo", kind: "block", status: "agendada", isTest: false, confirmadaAt: null },
  ];
  const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

  it("reconoce las sin confirmar", () => {
    expect(citas.filter(sinConfirmar).map((c) => c.id)).toEqual(["sin"]);
  });

  it("apagado las oculta; prendido o sin el dato, se ven todas", () => {
    const base = { showCancelled: false, showTests: false };
    expect(ids(calendarVisible(citas, { ...base, showSinConfirmar: false }))).toEqual(["confirmada", "vino", "bloqueo"]);
    expect(calendarVisible(citas, { ...base, showSinConfirmar: true })).toHaveLength(4);
    expect(calendarVisible(citas, base)).toHaveLength(4);
  });
});
