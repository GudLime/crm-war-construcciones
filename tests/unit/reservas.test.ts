import { describe, expect, it } from "vitest";
import {
  asignar,
  diaSemana,
  fechaCorta,
  fechasDeLaAnticipacion,
  formaPara,
  horariosReservables,
  resumenCupo,
  sentar,
  type CupoSector,
  type Ocupacion,
} from "@/lib/reservas";

/** 071 — El cupo de Beba: semidescubierto 1×4 + 1×2; salón 2×4 + 2×2. */
const BEBA: CupoSector[] = [
  { sector: "Salón", capacidad: 4, cantidad: 2, orden: 0 },
  { sector: "Salón", capacidad: 2, cantidad: 2, orden: 0 },
  { sector: "Semidescubierto", capacidad: 4, cantidad: 1, orden: 1 },
  { sector: "Semidescubierto", capacidad: 2, cantidad: 1, orden: 1 },
];

const ocupa = (sector: string, ...caps: number[]): Ocupacion => ({ sector, mesas: caps.map((capacidad) => ({ capacidad })) });

describe("formaPara", () => {
  it("1 o 2 → una de 2; 3 o 4 → una de 4; 5 o 6 → una de 4 y una de 2; 7 → nada", () => {
    expect(formaPara(BEBA, 1)).toEqual([2]);
    expect(formaPara(BEBA, 2)).toEqual([2]);
    expect(formaPara(BEBA, 3)).toEqual([4]);
    expect(formaPara(BEBA, 4)).toEqual([4]);
    expect(formaPara(BEBA, 5)).toEqual([4, 2]);
    expect(formaPara(BEBA, 6)).toEqual([4, 2]);
    expect(formaPara(BEBA, 9)).toBeNull();
    expect(formaPara(BEBA, 0)).toBeNull();
  });
});

describe("asignar", () => {
  it("con todo libre, una de 2 va donde deja más lugar para un grupo grande", () => {
    // Si fuera al semidescubierto, ese sector se queda sin par 4+2.
    expect(asignar(BEBA, [], 2)).toEqual({ sector: "Salón", mesas: [{ capacidad: 2 }] });
  });

  it("sin mesas de 2 libres, una reserva de 2 no usa una de 4", () => {
    const llenas = [ocupa("Salón", 2), ocupa("Salón", 2), ocupa("Semidescubierto", 2)];
    expect(asignar(BEBA, llenas, 2)).toBeNull();
    expect(asignar(BEBA, llenas, 4)).not.toBeNull();
  });

  it("5 o 6 personas juntan una de 4 y una de 2 del MISMO sector", () => {
    // Quedan: Salón 4 libre pero sin 2; Semidescubierto 2 libre pero sin 4.
    const ocupadas = [ocupa("Salón", 4), ocupa("Salón", 2, 2), ocupa("Semidescubierto", 4)];
    expect(asignar(BEBA, ocupadas, 6)).toBeNull();
    expect(asignar(BEBA, [], 6)).toEqual({ sector: "Salón", mesas: [{ capacidad: 4 }, { capacidad: 2 }] });
  });

  it("un horario se llena con exactamente las 6 mesas", () => {
    let ocupadas: Ocupacion[] = [];
    const pedidos = [2, 2, 2, 4, 4, 4];
    for (const p of pedidos) {
      const a = asignar(BEBA, ocupadas, p);
      expect(a).not.toBeNull();
      ocupadas = [...ocupadas, { sector: a!.sector, mesas: a!.mesas }];
    }
    expect(asignar(BEBA, ocupadas, 1)).toBeNull();
    expect(asignar(BEBA, ocupadas, 3)).toBeNull();
    expect(resumenCupo(BEBA, ocupadas)).toEqual([
      { capacidad: 2, libres: 0, total: 3 },
      { capacidad: 4, libres: 0, total: 3 },
    ]);
  });

  it("caben tres grupos de 5 o 6 (dos en el salón y uno afuera) y no un cuarto", () => {
    let ocupadas: Ocupacion[] = [];
    for (let i = 0; i < 3; i++) {
      const a = asignar(BEBA, ocupadas, 6)!;
      expect(a).not.toBeNull();
      ocupadas = [...ocupadas, { sector: a.sector, mesas: a.mesas }];
    }
    expect(ocupadas.filter((o) => o.sector === "Salón")).toHaveLength(2);
    expect(asignar(BEBA, ocupadas, 5)).toBeNull();
  });
});

describe("horariosReservables", () => {
  const horarios = [0, 1, 2, 3, 4, 5, 6].flatMap((d) =>
    ["12:00", "14:00", "20:00"].map((hora) => ({ diaSemana: d, hora, activo: true }))
  );
  const base = { horarios, cierres: [], zona: "America/Argentina/Buenos_Aires", anticipacionDias: 7, minutosAntes: 20 };

  it("hoy: solo los que empiezan en 20 minutos o más", () => {
    // 15:00 UTC = 12:00 en Buenos Aires.
    const ahora = new Date("2026-11-15T15:00:00Z");
    expect(horariosReservables({ ...base, ahora, fecha: "2026-11-15" })).toEqual(["14:00", "20:00"]);
    // 13:41 en Buenos Aires: a las 14:00 faltan 19 minutos.
    expect(horariosReservables({ ...base, ahora: new Date("2026-11-15T16:41:00Z"), fecha: "2026-11-15" })).toEqual(["20:00"]);
    expect(horariosReservables({ ...base, ahora: new Date("2026-11-15T16:40:00Z"), fecha: "2026-11-15" })).toEqual(["14:00", "20:00"]);
  });

  it("respeta la anticipación, los días cerrados y los inactivos", () => {
    const ahora = new Date("2026-11-15T15:00:00Z");
    expect(horariosReservables({ ...base, ahora, fecha: "2026-11-22" })).toHaveLength(3);
    expect(horariosReservables({ ...base, ahora, fecha: "2026-11-23" })).toEqual([]);
    expect(horariosReservables({ ...base, ahora, fecha: "2026-11-14" })).toEqual([]);
    expect(horariosReservables({ ...base, ahora, fecha: "2026-11-16", cierres: ["2026-11-16"] })).toEqual([]);
    const sinDomingoNoche = horarios.map((h) => (h.diaSemana === 0 && h.hora === "20:00" ? { ...h, activo: false } : h));
    expect(diaSemana("2026-11-15")).toBe(0);
    expect(horariosReservables({ ...base, horarios: sinDomingoNoche, ahora, fecha: "2026-11-15" })).toEqual(["14:00"]);
  });

  it("«hoy» es el de Buenos Aires, no el del servidor (23:30 local = 02:30 UTC del día siguiente)", () => {
    const ahora = new Date("2026-11-16T02:30:00Z");
    expect(fechasDeLaAnticipacion(ahora, base.zona, 1)).toEqual(["2026-11-15", "2026-11-16"]);
  });
});

it("fechaCorta", () => {
  expect(fechaCorta("2026-11-15")).toMatch(/dom.*15.*nov/);
});

describe("sentar (vista Mosaico)", () => {
  const cupo = [
    { sector: "Salón", capacidad: 4, cantidad: 2 },
    { sector: "Salón", capacidad: 2, cantidad: 2 },
    { sector: "Semi", capacidad: 4, cantidad: 1 },
    { sector: "Semi", capacidad: 2, cantidad: 1 },
  ];
  const r = (id: string, sector: string, ...caps: number[]) => ({ id, sector, mesas: caps.map((capacidad) => ({ capacidad })) });

  it("dibuja todas las mesas libres, grandes primero, en el orden de los sectores", () => {
    const s = sentar(cupo, [], ["Semi", "Salón"]);
    expect(s.map((x) => x.sector)).toEqual(["Semi", "Salón"]);
    expect(s[1]!.lugares).toEqual([
      { tipo: "libre", capacidad: 4 },
      { tipo: "libre", capacidad: 4 },
      { tipo: "libre", capacidad: 2 },
      { tipo: "libre", capacidad: 2 },
    ]);
    expect(s[1]!.libres).toBe(4);
  });

  it("sienta cada reserva en su mesa y junta las de un grupo", () => {
    const s = sentar(cupo, [r("a", "Salón", 2), r("b", "Salón", 4, 2)], ["Salón", "Semi"]);
    const salon = s[0]!;
    expect(salon.libres).toBe(1);
    expect(salon.lugares.map((l) => (l.tipo === "reserva" ? l.reserva.id : `libre ${l.capacidad}`))).toEqual([
      "b",
      "libre 4",
      "a",
    ]);
    const grupo = salon.lugares[0]!;
    expect(grupo.tipo === "reserva" && grupo.mesas).toEqual([4, 2]);
  });

  it("una reserva sin mesa (cupo achicado) se dibuja como sobrecupo al final", () => {
    const s = sentar(cupo, [r("a", "Semi", 2), r("b", "Semi", 2)], ["Salón", "Semi"]);
    const semi = s.find((x) => x.sector === "Semi")!;
    const ultima = semi.lugares.at(-1)!;
    expect(ultima.tipo === "reserva" && ultima.reserva.id === "b" && ultima.sobrecupo).toBe(true);
    expect(semi.libres).toBe(1);
  });
});
