import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown, bloquesMarkdown } from "@/components/ui/markdown";

/** Vista previa de las instrucciones en Markdown (sin HTML crudo). */

const INSTRUCCIONES = `# Quién sos
Sos **Mateo**, asesor de ventas.

## Precios
- Primero un *rango* por tipología
- Después el precio exacto
  si lo pide de nuevo

1. Saludar
2. Preguntar presupuesto

> Nunca prometas descuentos.

---

\`\`\`
bloque literal
\`\`\`
Más info en [la web](https://example.com) y \`código\`.`;

describe("bloques", () => {
  it("reconoce títulos, listas, citas, separadores, código y párrafos", () => {
    const tipos = bloquesMarkdown(INSTRUCCIONES).map((b) => b.tipo);
    expect(tipos).toEqual([
      "titulo",
      "parrafo",
      "titulo",
      "lista",
      "lista",
      "cita",
      "separador",
      "codigo",
      "parrafo",
    ]);
  });

  it("un ítem que sigue en la línea de abajo se une al anterior", () => {
    const lista = bloquesMarkdown(INSTRUCCIONES).find((b) => b.tipo === "lista");
    expect(lista).toMatchObject({ ordenada: false, items: ["Primero un *rango* por tipología", "Después el precio exacto si lo pide de nuevo"] });
  });
});

describe("render", () => {
  const html = renderToStaticMarkup(createElement(Markdown, { texto: INSTRUCCIONES }));

  it("negrita, cursiva, código y enlaces", () => {
    expect(html).toContain("<strong>Mateo</strong>");
    expect(html).toContain("<em>rango</em>");
    expect(html).toContain("código</code>");
    expect(html).toContain('href="https://example.com"');
  });

  it("no deja pasar HTML ni enlaces javascript:", () => {
    const malo = renderToStaticMarkup(
      createElement(Markdown, { texto: "<script>alert(1)</script> [clic](javascript:alert(1))" })
    );
    expect(malo).not.toContain("<script>");
    expect(malo).toContain("&lt;script&gt;");
    expect(malo).not.toContain("javascript:");
  });
});
