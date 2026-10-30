import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 067 — Coexistencia: los webhooks `history`, `smb_app_state_sync` y
 * `account_update`, y la bandera.
 *
 *   - los parsers puros (qué se usa de cada payload, qué se descarta);
 *   - la ingesta del historial: entra como historia (sin despachar, sin no
 *     leídos, sin ventana de 24 h), idempotente, y el avance se guarda;
 *   - los contactos: `add` crea, `remove` no borra nada;
 *   - `PARTNER_REMOVED` deja la conexión para reconectar.
 */

const h = vi.hoisted(() => ({
  inserts: [] as Record<string, unknown>[],
  updates: [] as Record<string, unknown>[],
  /** wa_message_id ya guardados: el ON CONFLICT DO NOTHING de la base. */
  vistos: new Set<string>(),
  contacto: vi.fn(),
  conversacion: vi.fn(),
  credenciales: vi.fn(),
  porWaba: vi.fn(),
  avance: vi.fn(),
  reconectar: vi.fn(),
  publish: vi.fn(),
  despachar: vi.fn(),
}));

vi.mock("@/lib/db", () => {
  const db = {
    insert: () => ({
      values: (v: Record<string, unknown>) => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            const id = String(v.waMessageId);
            if (h.vistos.has(id)) return [];
            h.vistos.add(id);
            h.inserts.push(v);
            return [{ id: v.id }];
          },
        }),
      }),
    }),
    update: () => ({
      set: (v: Record<string, unknown>) => ({
        where: async () => {
          h.updates.push(v);
        },
      }),
    }),
  };
  return { getDb: () => db, schema: new Proxy({}, { get: () => new Proxy({}, { get: (_t, k) => k }) }) };
});
vi.mock("drizzle-orm", async (original) => ({
  ...(await original<typeof import("drizzle-orm")>()),
  eq: () => "eq",
}));
vi.mock("@/lib/db/ids", () => ({ newId: (p: string) => `${p}_${Math.random().toString(36).slice(2, 8)}` }));
vi.mock("@/server/events/bus", () => ({ publish: h.publish }));
vi.mock("@/server/inbox/identity", () => ({ getOrCreateContactByIdentity: h.contacto }));
vi.mock("@/server/inbox/ingest", () => ({ getOrCreateConversation: h.conversacion }));
vi.mock("@/server/dispatch/encolar", () => ({ despacharAlCerebro: h.despachar }));
vi.mock("@/server/whatsapp/credentials", () => ({
  getCredentialsByPhoneNumberId: h.credenciales,
  getCredentialsByWabaId: h.porWaba,
  actualizarAvanceDelHistorial: h.avance,
  markReconnectRequired: h.reconectar,
}));

import {
  contactosDelEstado,
  esDesconexion,
  HISTORIAL_RECHAZADO,
  leerLoteDeHistoria,
  processAccountUpdate,
  processHistoryValue,
  processStateSyncValue,
} from "@/server/whatsapp/coexistencia/ingest";
import { parseCoexistenciaFlag } from "@/server/whatsapp/coexistencia/flag";

const META = { messaging_product: "whatsapp", metadata: { display_phone_number: "5491100000000", phone_number_id: "PNID" } };

const lote = (history: unknown[]) => ({ ...META, history });
const hilo = (id: string, messages: unknown[]) => ({ id, messages });
const entrante = (id: string, ts: number, body = "hola") => ({
  from: "5491155554444",
  id,
  timestamp: String(ts),
  type: "text",
  text: { body },
  history_context: { status: "READ" },
});
const saliente = (id: string, ts: number, status = "DELIVERED") => ({
  from: "5491100000000",
  to: "5491155554444",
  id,
  timestamp: String(ts),
  type: "text",
  text: { body: "te paso el precio" },
  history_context: { status },
});

beforeEach(() => {
  vi.clearAllMocks();
  h.inserts.length = 0;
  h.updates.length = 0;
  h.vistos.clear();
  h.credenciales.mockResolvedValue({ organizationId: "org_1" });
  h.porWaba.mockResolvedValue({ organizationId: "org_1" });
  h.contacto.mockImplementation(async (_org: string, r: { identity: string }) => ({
    contact: { id: `ct_${r.identity}` },
    isNew: true,
  }));
  h.conversacion.mockImplementation(async (_org: string, contactId: string) => ({ id: `cv_${contactId}` }));
});

describe("la bandera", () => {
  it("solo los valores de encendido la encienden", () => {
    expect(parseCoexistenciaFlag("on")).toBe(true);
    expect(parseCoexistenciaFlag(" TRUE ")).toBe(true);
    expect(parseCoexistenciaFlag(undefined)).toBe(false);
    expect(parseCoexistenciaFlag("off")).toBe(false);
  });
});

describe("leerLoteDeHistoria", () => {
  it("separa entrantes y salientes por `to`, normaliza el hilo y mapea el estado", () => {
    const r = leerLoteDeHistoria(
      lote([
        {
          metadata: { phase: 0, chunk_order: 1, progress: 10 },
          threads: [hilo("5491155554444", [entrante("wamid.A", 1_780_000_000), saliente("wamid.B", 1_780_000_100, "READ")])],
        },
      ])
    );
    expect(r.mensajes).toHaveLength(2);
    expect(r.mensajes[0]).toMatchObject({ waMessageId: "wamid.A", direction: "in", text: "hola", status: "delivered" });
    expect(r.mensajes[1]).toMatchObject({ waMessageId: "wamid.B", direction: "out", status: "read" });
    expect(r.mensajes[0]!.waTimestamp.toISOString()).toBe(new Date(1_780_000_000_000).toISOString());
    expect(r.avance).toEqual({ status: "running", progress: 10 });
  });

  it("fase 2 al 100% es `done`; el rechazo del negocio es `declined`", () => {
    expect(leerLoteDeHistoria(lote([{ metadata: { phase: 2, progress: 100 }, threads: [] }])).avance).toEqual({
      status: "done",
      progress: 100,
    });
    expect(
      leerLoteDeHistoria(
        lote([{ errors: [{ code: HISTORIAL_RECHAZADO, title: "History sharing is turned off by the business" }] }])
      ).avance
    ).toEqual({ status: "declined", progress: null });
    expect(leerLoteDeHistoria(lote([{ errors: [{ code: 131000 }] }])).avance).toEqual({ status: "failed", progress: null });
  });

  it("descarta media_placeholder, tipos raros, sin fecha, hilos que no son teléfonos y basura", () => {
    const r = leerLoteDeHistoria(
      lote([
        {
          threads: [
            hilo("5491155554444", [
              { from: "5491155554444", id: "wamid.P", timestamp: "1780000000", type: "media_placeholder" },
              { from: "5491155554444", id: "wamid.R", timestamp: "1780000000", type: "reaction" },
              { from: "5491155554444", id: "wamid.T", type: "text", text: { body: "sin fecha" } },
              { no: "es un mensaje" },
              {
                from: "5491155554444",
                id: "wamid.I",
                timestamp: "1780000000",
                type: "image",
                image: { caption: "la fachada" },
              },
            ]),
            hilo("120363000000000000@g.us-grupo", [entrante("wamid.G", 1_780_000_000)]),
          ],
        },
      ])
    );
    expect(r.mensajes.map((m) => m.waMessageId)).toEqual(["wamid.I"]);
    expect(r.mensajes[0]).toMatchObject({ type: "image", text: "la fachada" });
    expect(leerLoteDeHistoria("no-es-un-objeto")).toEqual({ mensajes: [], avance: null });
  });
});

describe("processHistoryValue", () => {
  it("guarda como historia: sin despachar, sin no leídos ni ventana de 24 h; idempotente", async () => {
    const payload = lote([
      {
        metadata: { phase: 1, chunk_order: 3, progress: 60 },
        threads: [hilo("5491155554444", [entrante("wamid.A", 1_780_000_000), saliente("wamid.B", 1_780_000_100)])],
      },
    ]);
    await processHistoryValue(payload);
    await processHistoryValue(payload); // Meta reintenta el mismo chunk

    expect(h.inserts).toHaveLength(2);
    expect(h.inserts[0]).toMatchObject({ direction: "in", waMessageId: "wamid.A", organizationId: "org_1" });
    expect(h.inserts[0]).not.toHaveProperty("origin");
    expect(h.inserts[1]).toMatchObject({ direction: "out", origin: "manual" });
    for (const u of h.updates) {
      expect(u).not.toHaveProperty("unreadCount");
      expect(u).not.toHaveProperty("lastInboundAt");
      expect(u).not.toHaveProperty("aiEnabled");
      expect(u).toHaveProperty("lastMessageAt");
    }
    expect(h.despachar).not.toHaveBeenCalled();
    // Un aviso por conversación tocada, no por mensaje; el reintento no avisa.
    expect(h.publish).toHaveBeenCalledTimes(1);
    expect(h.avance).toHaveBeenCalledWith("org_1", { status: "running", progress: 60 });
  });

  it("un número desconocido no guarda nada", async () => {
    h.credenciales.mockResolvedValue(null);
    await processHistoryValue(lote([{ threads: [hilo("5491155554444", [entrante("wamid.A", 1_780_000_000)])] }]));
    expect(h.inserts).toHaveLength(0);
    expect(h.avance).not.toHaveBeenCalled();
  });
});

describe("contactos (smb_app_state_sync)", () => {
  const estado = (state_sync: unknown[]) => ({ ...META, state_sync });

  it("`add` crea con nombre; `remove` y otros tipos no hacen nada", async () => {
    const payload = estado([
      { type: "contact", action: "add", contact: { full_name: "Ana Pérez", first_name: "Ana", phone_number: "+54 9 11 5555-4444" } },
      { type: "contact", action: "remove", contact: { phone_number: "5491177778888" } },
      { type: "label", action: "add" },
      { type: "contact", action: "add", contact: { phone_number: "12" } },
    ]);
    expect(contactosDelEstado(payload)).toEqual([{ phone: "5491155554444", name: "Ana Pérez" }]);

    await processStateSyncValue(payload);
    expect(h.contacto).toHaveBeenCalledTimes(1);
    expect(h.contacto).toHaveBeenCalledWith("org_1", {
      identity: "5491155554444",
      phone: "5491155554444",
      waUserId: null,
      profileName: "Ana Pérez",
    });
  });
});

describe("account_update", () => {
  it("PARTNER_REMOVED y ACCOUNT_OFFBOARDED marcan para reconectar; lo demás se ignora", async () => {
    expect(esDesconexion({ event: "PARTNER_REMOVED", disconnection_info: { reason: "ACCOUNT_DISCONNECTED" } })).toBe(true);
    expect(esDesconexion({ event: "ACCOUNT_OFFBOARDED" })).toBe(true);
    expect(esDesconexion({ event: "VERIFIED_ACCOUNT" })).toBe(false);

    await processAccountUpdate("WABA_1", { event: "VERIFIED_ACCOUNT" });
    expect(h.reconectar).not.toHaveBeenCalled();

    await processAccountUpdate("WABA_1", { event: "PARTNER_REMOVED" });
    expect(h.porWaba).toHaveBeenCalledWith("WABA_1");
    expect(h.reconectar).toHaveBeenCalledWith("org_1");
  });
});
