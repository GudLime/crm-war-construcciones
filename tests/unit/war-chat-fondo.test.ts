import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * El fondo del hilo es una customización War: vive en war-theme.css
 * y solo lee --accent-tint (lo inyecta accentCssVariables). No reescribe
 * globals.css ni los tokens --accent*.
 */
describe("fondo del chat desde el acento (War)", () => {
  const css = readFileSync("src/app/war-theme.css", "utf8");

  it("el hilo es un lavado sólido de --accent-tint, sin el mosaico", () => {
    const regla = css.match(/\.thread-bg\s*\{([^}]*)\}/);
    expect(regla, "falta la regla .thread-bg").not.toBeNull();
    const cuerpo = regla?.[1] ?? "";
    expect(cuerpo).toContain("background-color: var(--accent-tint)");
    expect(cuerpo).toContain("background-image: none");
  });

  it("no redefine los tokens de acento: los sigue inyectando la marca", () => {
    const sinComentarios = css.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(sinComentarios).not.toMatch(/--accent\s*:/);
    expect(sinComentarios).not.toMatch(/--accent-tint\s*:/);
    expect(sinComentarios).not.toMatch(/--accent-soft\s*:/);
  });
});
