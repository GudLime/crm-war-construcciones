import { describe, expect, it } from "vitest";
import { cargaDe, iniciales, sugerir, textoEspera, tonoEspera, vendedoresDeLaMesa } from "@/lib/asignaciones";

describe("cargaDe", () => {
  it("normal, alta desde 65% y saturada desde 85%", () => {
    expect(cargaDe(10)).toEqual({ pct: 33, nivel: "normal" });
    expect(cargaDe(20)).toEqual({ pct: 67, nivel: "alta" });
    expect(cargaDe(26)).toEqual({ pct: 87, nivel: "saturada" });
  });
});

describe("vendedoresDeLaMesa", () => {
  const miembros = [
    { userId: "a", nombre: "Sebastián", role: "owner" },
    { userId: "b", nombre: "Lucía", role: "member" },
    { userId: "c", nombre: "Martín", role: "member" },
  ];
  it("sin ajuste: reciben los de rol vendedor, por nombre, con tecla", () => {
    const v = vendedoresDeLaMesa(miembros, []);
    expect(v.map((x) => [x.userId, x.recibe, x.tecla])).toEqual([
      ["b", true, 1],
      ["c", true, 2],
      ["a", false, null],
    ]);
  });
  it("lo guardado manda en el orden y en quién recibe", () => {
    const v = vendedoresDeLaMesa(miembros, [
      { userId: "a", recibe: true },
      { userId: "c", recibe: true },
      { userId: "b", recibe: false },
      { userId: "fantasma", recibe: true },
    ]);
    expect(v.map((x) => [x.userId, x.tecla])).toEqual([
      ["a", 1],
      ["c", 2],
      ["b", null],
    ]);
  });
  it("sin ningún vendedor, reciben todos", () => {
    const v = vendedoresDeLaMesa([{ userId: "a", nombre: "Ana", role: "owner" }], []);
    expect(v[0]?.recibe).toBe(true);
  });
});

describe("sugerir", () => {
  const vendedores = [
    { userId: "lu", nombre: "Lucía", abiertas: 5 },
    { userId: "ma", nombre: "Martín", abiertas: 4 },
    { userId: "se", nombre: "Sebastián", abiertas: 28 },
  ];
  it("primero la regla por edificio", () => {
    const s = sugerir([{ id: "o1", edificioIds: ["urq"] }], vendedores, { urq: "lu" }, () => "Urquiza");
    expect(s.get("o1")).toMatchObject({ userId: "lu", regla: "edificio", porque: "Urquiza → Lucía (regla por edificio)" });
  });
  it("una regla a la IA o a quien no recibe cae a la carga", () => {
    const s = sugerir(
      [
        { id: "o1", edificioIds: ["lav"] },
        { id: "o2", edificioIds: ["x"] },
      ],
      vendedores,
      { lav: "ia", x: "nadie" }
    );
    expect(s.get("o1")?.regla).toBe("carga");
    expect(s.get("o2")?.regla).toBe("carga");
  });
  it("reparte por carga y saltea al saturado", () => {
    const ops = ["a", "b", "c", "d"].map((id) => ({ id, edificioIds: [] }));
    const s = sugerir(ops, vendedores, {});
    expect(ops.map((o) => s.get(o.id)?.userId)).toEqual(["ma", "lu", "ma", "lu"]);
  });
  it("todos saturados: sin sugerencia", () => {
    const s = sugerir([{ id: "a", edificioIds: [] }], [{ userId: "se", nombre: "S", abiertas: 29 }], {});
    expect(s.get("a")).toBeNull();
  });
});

describe("para la pantalla", () => {
  it("espera y su tono", () => {
    expect(textoEspera(0)).toBe("recién");
    expect(textoEspera(12)).toBe("hace 12 min");
    expect(textoEspera(185)).toBe("hace 3 h");
    expect(textoEspera(3000)).toBe("hace 2 d");
    expect(tonoEspera(10)).toBe("normal");
    expect(tonoEspera(45)).toBe("ambar");
    expect(tonoEspera(120)).toBe("rojo");
  });
  it("iniciales", () => {
    expect(iniciales("Carolina Méndez")).toBe("CM");
    expect(iniciales("lucía")).toBe("L");
  });
});
