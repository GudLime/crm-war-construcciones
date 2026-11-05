import { describe, expect, it } from "vitest";
import { formatearTelefono, normalizarTelefono } from "@/lib/telefono";

/**
 * War — Una sola forma de guardar un teléfono: E.164 sin `+`, con el 9 en los
 * celulares argentinos (igual que el `wa_id` de WhatsApp).
 */

const CELU = "5491151191447";

function ok(raw: string) {
  const r = normalizarTelefono(raw);
  return r.ok ? r.telefono : `ERROR:${r.motivo}`;
}

describe("normalizarTelefono — celulares argentinos", () => {
  it.each([
    ["+541151191447", "como llega de los formularios de Meta (sin 9)"],
    ["+5491151191447", "E.164 con 9"],
    ["5491151191447", "wa_id de WhatsApp"],
    ["541151191447", "sin + ni 9"],
    ["+54 9 11 5119-1447", "con espacios y guión"],
    ["+54 (11) 5119-1447", "con paréntesis"],
    ["11 5119-1447", "nacional sin 0 ni 15"],
    ["1151191447", "diez dígitos pegados"],
    ["011 15 5119-1447", "nacional con 0 y 15"],
    ["11 15 5119 1447", "con 15 sin 0"],
    ["0054 9 11 5119 1447", "con 00 internacional"],
  ])("%s (%s) → %s", (raw) => {
    expect(ok(raw)).toBe(CELU);
  });

  it("interior: Córdoba (351) y La Plata (221)", () => {
    expect(ok("0351 15 555-1234")).toBe("5493515551234");
    expect(ok("+54 9 351 555-1234")).toBe("5493515551234");
    expect(ok("0221 15 456-7890")).toBe("5492214567890");
  });

  it("todas las formas del mismo número dan lo mismo", () => {
    const formas = ["+541151191447", "011 15 5119-1447", "5491151191447", "11 5119 1447"];
    expect(new Set(formas.map(ok))).toEqual(new Set([CELU]));
  });
});

describe("normalizarTelefono — otros países", () => {
  it("con + el país sale del número", () => {
    expect(ok("+34 612 345 678")).toBe("34612345678");
    expect(ok("+1 (201) 555-0123")).toBe("12015550123");
  });

  it("México: el 521 de WhatsApp queda como 52, igual que la identidad", () => {
    expect(ok("+52 1 55 1234 5678")).toBe("525512345678");
    expect(ok("5215512345678")).toBe("525512345678");
  });
});

describe("normalizarTelefono — lo que no sirve", () => {
  it("vacío", () => {
    expect(normalizarTelefono("")).toEqual({ ok: false, motivo: "vacio" });
    expect(normalizarTelefono("   ")).toEqual({ ok: false, motivo: "vacio" });
    expect(normalizarTelefono(null)).toEqual({ ok: false, motivo: "vacio" });
  });

  it("incompleto o con un código de área que no existe", () => {
    expect(normalizarTelefono("5119-1447").ok).toBe(false);
    expect(normalizarTelefono("55 1234 5678").ok).toBe(false);
    expect(normalizarTelefono("1234567890123456789").ok).toBe(false);
  });

  it("sin país por defecto exige el código de país", () => {
    expect(normalizarTelefono("11 5119-1447", { paisPorDefecto: null })).toEqual({
      ok: false,
      motivo: "sin_codigo_pais",
    });
    expect(normalizarTelefono("+541151191447", { paisPorDefecto: null })).toEqual({
      ok: true,
      telefono: CELU,
    });
  });
});

describe("formatearTelefono", () => {
  it("muestra el formato internacional legible", () => {
    expect(formatearTelefono(CELU)).toBe("+54 9 11 5119 1447");
  });

  it("sin teléfono lo dice", () => {
    expect(formatearTelefono(null)).toBe("Sin teléfono");
  });
});
