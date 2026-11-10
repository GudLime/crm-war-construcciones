import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { leerOpciones, Select } from "@/components/ui/select";

/**
 * El desplegable del CRM (`components/ui/select.tsx`).
 *
 * Reemplazó al `<select>` nativo, que se abría con el menú de fábrica del
 * sistema (en Mac, la lista gris) y no seguía el diseño ni el tema oscuro.
 * Si esto se puso rojo porque apareció un `<select>`: usá `<Select>`, que se
 * escribe igual (mismos `<option>`/`<optgroup>`, `onValueChange` en vez de
 * `onChange`).
 */

const SRC = path.resolve(import.meta.dirname, "..", "..", "src");
const UNICO = path.join(SRC, "components", "ui", "select.tsx");

function archivos(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...archivos(full));
    else if (/\.tsx$/.test(entry)) out.push(full);
  }
  return out;
}

const h = createElement;

describe("no vuelve el desplegable nativo", () => {
  it("ningún componente usa <select>", () => {
    const conNativo = archivos(SRC)
      .filter((f) => f !== UNICO)
      .filter((f) => /<select[\s>]/.test(readFileSync(f, "utf8")))
      .map((f) => path.relative(SRC, f));
    expect(conNativo).toEqual([]);
  });
});

describe("lee las opciones como un <select>", () => {
  it("option con value y texto armado con varias piezas", () => {
    const ops = leerOpciones([
      h("option", { key: "a", value: "" }, "Sin clasificar"),
      h("option", { key: "b", value: "lead" }, "Lead ", "(", "venta", ")"),
    ]);
    expect(ops).toEqual([
      { value: "", label: "Sin clasificar", disabled: false, grupo: null },
      { value: "lead", label: "Lead (venta)", disabled: false, grupo: null },
    ]);
  });

  it("números como valor, opciones deshabilitadas y sin value (usa el texto)", () => {
    const ops = leerOpciones([
      h("option", { key: 1, value: 30 }, "30 min"),
      h("option", { key: 2, disabled: true }, "Otra"),
    ]);
    expect(ops.map((o) => [o.value, o.disabled])).toEqual([
      ["30", false],
      ["Otra", true],
    ]);
  });

  it("optgroup, fragmentos y condicionales", () => {
    const ops = leerOpciones([
      h(
        "optgroup",
        { key: "g", label: "América" },
        h("option", { value: "ARS" }, "ARS"),
        h("option", { value: "USD" }, "USD")
      ),
      h(Fragment, { key: "f" }, h("option", { value: "EUR" }, "EUR")),
      false,
      null,
    ]);
    expect(ops.map((o) => [o.value, o.grupo])).toEqual([
      ["ARS", "América"],
      ["USD", "América"],
      ["EUR", null],
    ]);
  });
});

describe("el botón", () => {
  function dibujar(value: string, placeholder?: string): string {
    return renderToStaticMarkup(
      h(Select, {
        value,
        onValueChange: () => {},
        id: "x",
        ...(placeholder ? { placeholder } : {}),
        children: [
          h("option", { key: "a", value: "a" }, "Alfa"),
          h("option", { key: "b", value: "b" }, "Beta"),
        ],
      })
    );
  }

  it("es un combobox cerrado que muestra la opción elegida", () => {
    const html = dibujar("b");
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-haspopup="listbox"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('type="button"');
    expect(html).toContain(">Beta<");
    expect(html).not.toContain("<select");
  });

  it("si el valor no es ninguna opción, muestra el texto de ayuda", () => {
    expect(dibujar("zzz", "Elegí un edificio")).toContain(">Elegí un edificio<");
  });

  it("varias: muestra las elegidas como etiquetas, o el texto de ayuda", () => {
    const multiple = (values: string[]) =>
      renderToStaticMarkup(
        h(Select, {
          multiple: true,
          values,
          onValuesChange: () => undefined,
          placeholder: "Elegir…",
          "aria-label": "Tipologías",
          children: [
            h("option", { key: "a", value: "a" }, "Alfa"),
            h("option", { key: "b", value: "b" }, "Beta"),
            h("option", { key: "c", value: "c" }, "Gama"),
          ],
        })
      );
    const html = multiple(["a", "c"]);
    expect(html).toContain(">Alfa<");
    expect(html).toContain(">Gama<");
    expect(html).not.toContain(">Beta<");
    expect(multiple([])).toContain(">Elegir…<");
  });
});
