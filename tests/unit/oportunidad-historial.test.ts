import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  AJUSTES_VENTAS_POR_DEFECTO,
  ajustesVentasSchema,
  cumpleSilencio,
  intentosTrasUnIntento,
  resultadoDeCierre,
  seReabre,
  textoSinRespuesta,
  VENTANA_TANDA_MS,
  type Silencio,
} from "@/lib/ventas-ajustes";
import { ESTADOS_OPORTUNIDAD } from "@/lib/ventas";

/**
 * War — «Sin respuesta», cierre por silencio y reapertura (reglas puras), y
 * que el historial quede pensado para estadísticas.
 */

const H = 60 * 60 * 1000;
const D = 24 * H;
const t0 = new Date("2026-11-01T12:00:00Z");
const en = (ms: number) => new Date(t0.getTime() + ms);
const nada: Silencio = { intentosSinRespuesta: 0, ultimoIntentoAt: null, ultimaRespuestaAt: null };

describe("intentos: tandas de mensajes nuestros sin respuesta", () => {
  it("el primer mensaje es el primer intento", () => {
    expect(intentosTrasUnIntento(nada, t0)).toBe(1);
  });

  it("dos o tres burbujas de la misma tanda cuentan uno", () => {
    const s = { intentosSinRespuesta: 1, ultimoIntentoAt: t0, ultimaRespuestaAt: null };
    expect(intentosTrasUnIntento(s, en(5 * 60 * 1000))).toBe(1);
    expect(intentosTrasUnIntento(s, en(VENTANA_TANDA_MS - 1))).toBe(1);
  });

  it("pasada la hora, es otro intento", () => {
    const s = { intentosSinRespuesta: 1, ultimoIntentoAt: t0, ultimaRespuestaAt: null };
    expect(intentosTrasUnIntento(s, en(VENTANA_TANDA_MS + 1))).toBe(2);
  });

  it("si respondió después del último intento, se empieza de nuevo", () => {
    const s = { intentosSinRespuesta: 0, ultimoIntentoAt: t0, ultimaRespuestaAt: en(10 * 60 * 1000) };
    expect(intentosTrasUnIntento(s, en(20 * 60 * 1000))).toBe(1);
  });
});

describe("cierre por silencio (3 intentos y 7 días desde el último)", () => {
  const a = AJUSTES_VENTAS_POR_DEFECTO;
  const s = (intentos: number, respuesta: Date | null = null): Silencio => ({
    intentosSinRespuesta: intentos,
    ultimoIntentoAt: t0,
    ultimaRespuestaAt: respuesta,
  });

  it("con 3 intentos y 7 días, sí", () => {
    expect(cumpleSilencio(s(3), a, en(7 * D))).toBe(true);
  });

  it("con 2 intentos, no", () => {
    expect(cumpleSilencio(s(2), a, en(30 * D))).toBe(false);
  });

  it("antes de los 7 días desde el ÚLTIMO intento, no", () => {
    expect(cumpleSilencio(s(3), a, en(7 * D - 1))).toBe(false);
  });

  it("si respondió después del último intento, no", () => {
    expect(cumpleSilencio(s(3, en(H)), a, en(30 * D))).toBe(false);
  });

  it("los valores por defecto son los acordados", () => {
    expect(a).toEqual({
      sinRespuestaIntentos: 3,
      sinRespuestaDias: 7,
      sinRespuestaModo: "cerrar",
      reaperturaDias: 120,
    });
  });

  it("los ajustes se validan", () => {
    expect(ajustesVentasSchema.safeParse(a).success).toBe(true);
    expect(ajustesVentasSchema.safeParse({ ...a, sinRespuestaIntentos: 0 }).success).toBe(false);
    expect(ajustesVentasSchema.safeParse({ ...a, sinRespuestaModo: "otro" }).success).toBe(false);
  });
});

describe("reapertura (120 días)", () => {
  const a = AJUSTES_VENTAS_POR_DEFECTO;

  it("una perdida dentro del plazo se reabre", () => {
    expect(seReabre({ estado: "perdido", cerradaAt: t0 }, a, en(120 * D))).toBe(true);
  });

  it("pasado el plazo, no: se abre otra", () => {
    expect(seReabre({ estado: "perdido", cerradaAt: t0 }, a, en(120 * D + 1))).toBe(false);
  });

  it("No calificado y Compró nunca se reabren", () => {
    expect(seReabre({ estado: "no_calificado", cerradaAt: t0 }, a, en(D))).toBe(false);
    expect(seReabre({ estado: "compro", cerradaAt: t0 }, a, en(D))).toBe(false);
  });
});

describe("la marca y el resultado", () => {
  it("«Sin respuesta · N intentos · hace X días»", () => {
    expect(
      textoSinRespuesta({ intentosSinRespuesta: 3, ultimoIntentoAt: t0, ultimaRespuestaAt: null }, en(4 * D))
    ).toBe("Sin respuesta · 3 intentos · hace 4 días");
    expect(
      textoSinRespuesta({ intentosSinRespuesta: 1, ultimoIntentoAt: t0, ultimaRespuestaAt: null }, en(H))
    ).toBe("Sin respuesta · 1 intento · hoy");
    expect(textoSinRespuesta(nada)).toBeNull();
  });

  it("el resultado de un cierre", () => {
    expect(resultadoDeCierre("compro")).toBe("ganada");
    expect(resultadoDeCierre("perdido")).toBe("perdida");
    expect(resultadoDeCierre("no_calificado")).toBe("no_calificado");
    expect(resultadoDeCierre("visito")).toBeNull();
  });

  it("«No responde» ya no es un estado", () => {
    expect(ESTADOS_OPORTUNIDAD.map((e) => e.value)).not.toContain("no_responde");
  });
});

describe("migración 0036", () => {
  const sql = readFileSync(path.join(process.cwd(), "drizzle", "0036_oportunidad_historial.sql"), "utf8");

  it("pasa las «No responde» a Recibido y crea el historial con su punto de partida", () => {
    expect(sql).toContain(`UPDATE "oportunidad" SET "estado" = 'recibido' WHERE "estado" = 'no_responde'`);
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "oportunidad_evento"');
    expect(sql).toMatch(/'creada', o\."estado"/);
  });

  it("el historial guarda la foto del momento para las estadísticas", () => {
    for (const col of ["occurred_at", "segundos_en_estado_anterior", "origen", "edificio_id", "fuente", "resultado"]) {
      expect(sql).toContain(`"${col}"`);
    }
  });
});
