import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assetImagenOrigen,
  CLAVES_ICONO,
  iconoDeOrigen,
  normalizarNombreOrigen,
  ORIGENES_POR_DEFECTO,
  planoOrigen,
  urlImagenOrigen,
} from "@/lib/origenes";
import { ordenSchema, origenSchema } from "@/server/origenes";

/** War 0035 — Orígenes configurables (Configuración → Orígenes). */

describe("catálogo de íconos", () => {
  it("las claves no se repiten", () => {
    expect(new Set(CLAVES_ICONO).size).toBe(CLAVES_ICONO.length);
  });

  it("cada origen por defecto usa un ícono que existe", () => {
    for (const o of ORIGENES_POR_DEFECTO) expect(CLAVES_ICONO).toContain(o.icono);
  });

  it("una clave desconocida cae en la etiqueta, no rompe", () => {
    expect(iconoDeOrigen("no-existe")).toBe(iconoDeOrigen("tag"));
    expect(iconoDeOrigen(null)).toBe(iconoDeOrigen("tag"));
  });

  it("los por defecto no chocan entre sí al compararlos como Make", () => {
    const planos = ORIGENES_POR_DEFECTO.map((o) => planoOrigen(o.nombre));
    expect(new Set(planos).size).toBe(planos.length);
  });
});

describe("la migración 0035 siembra lo mismo que la app", () => {
  const sql = readFileSync(path.join(process.cwd(), "drizzle", "0035_origenes.sql"), "utf8");
  it("mismos nombres, íconos y orden", () => {
    ORIGENES_POR_DEFECTO.forEach((o, i) => {
      expect(sql).toContain(`('${o.nombre}', '${o.icono}', ${i})`);
    });
  });
  it("es re-ejecutable", () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS "origen_oportunidad"/);
    expect(sql).toMatch(/ON CONFLICT DO NOTHING/);
  });
  it("guarda el tipo y la versión de la imagen propia", () => {
    expect(sql).toContain('"imagen_mime" text');
    expect(sql).toContain('"imagen_version" bigint');
  });
});

describe("validación", () => {
  it("normaliza espacios del nombre", () => {
    expect(normalizarNombreOrigen("  Pro   perati ")).toBe("Pro perati");
    const r = origenSchema.safeParse({ nombre: "  Properati  ", icono: "globe" });
    expect(r.success && r.data.nombre).toBe("Properati");
  });

  it("rechaza nombre vacío, solo símbolos o ícono inventado", () => {
    expect(origenSchema.safeParse({ nombre: "   ", icono: "globe" }).success).toBe(false);
    expect(origenSchema.safeParse({ nombre: "---", icono: "globe" }).success).toBe(false);
    expect(origenSchema.safeParse({ nombre: "Properati", icono: "cohete" }).success).toBe(false);
    expect(origenSchema.safeParse({ nombre: "x".repeat(61), icono: "globe" }).success).toBe(false);
  });

  it("el orden pide al menos un id", () => {
    expect(ordenSchema.safeParse({ ids: [] }).success).toBe(false);
    expect(ordenSchema.safeParse({ ids: ["ori_1"] }).success).toBe(true);
  });
});

describe("imagen propia", () => {
  it("un archivo por origen y una URL que cambia con cada subida", () => {
    expect(assetImagenOrigen("ori_abc")).toBe("origen-ori_abc");
    expect(urlImagenOrigen("ori_abc", 1)).not.toBe(urlImagenOrigen("ori_abc", 2));
    expect(urlImagenOrigen("ori_abc", 5)).toBe("/api/origenes/ori_abc/imagen?v=5");
  });
});
