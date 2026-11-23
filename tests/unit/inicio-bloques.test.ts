import { describe, expect, it } from "vitest";
import { seccionesWidget, type ItemWidget } from "@/lib/inicio";
import { validarConfig } from "@/lib/motor/config";
import { vocabularioDe } from "@/lib/vocabulario";

const item = (p: Partial<ItemWidget>): ItemWidget => ({
  clase: "tarea",
  id: Math.random().toString(36),
  at: null,
  dia: null,
  conHora: false,
  tipo: "llamada",
  titulo: "x",
  estado: "realizar",
  vencida: false,
  ia: false,
  contacto: null,
  edificio: null,
  oportunidadId: null,
  conversationId: null,
  comentario: null,
  ubicacion: null,
  minutos: null,
  confirmada: false,
  agendo: null,
  ...p,
});

describe("Inicio por bloques (cambios 23/11)", () => {
  it("el widget: vencidas, sin hora, hoy y los días siguientes, en ese orden", () => {
    const s = seccionesWidget(
      [
        item({ at: "2026-11-24T15:00:00Z", dia: "2026-11-24" }),
        item({ at: "2026-11-23T13:00:00Z", dia: "2026-11-23" }),
        item({ at: null }),
        item({ at: "2026-11-20T13:00:00Z", dia: "2026-11-20", vencida: true }),
        item({ at: "2026-11-23T18:00:00Z", dia: "2026-11-23" }),
      ],
      "2026-11-23"
    );
    expect(s.map((x) => [x.clave, x.items.length])).toEqual([
      ["vencidas", 1],
      ["sin_hora", 1],
      ["hoy", 2],
      ["2026-11-24", 1],
    ]);
  });

  it("los bloques salen de la config del cliente; sin config, el Inicio de siempre", () => {
    expect(vocabularioDe(null).inicio.bloques).toBeNull();
    const r = validarConfig({ version: 1, cliente: "x", inicio: { bloques: ["etapas", "tareas"] } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(vocabularioDe(r.config).inicio.bloques).toEqual(["etapas", "tareas"]);
    expect(validarConfig({ version: 1, cliente: "x", inicio: { bloques: ["cualquiera"] } }).ok).toBe(false);
  });
});
