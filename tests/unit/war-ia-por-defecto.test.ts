import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * War — Ajustes → Ventas «El agente atiende las conversaciones nuevas».
 * Apagado: la conversación nueva nace sin IA; las que ya existían no cambian.
 */

const URL_DB = process.env.MOTOR_TEST_DATABASE_URL;

describe.skipIf(!URL_DB)("War: el agente en conversaciones nuevas", () => {
  const org = `org_ia_${Date.now()}`;
  let db: typeof import("@/lib/db");
  let ingest: typeof import("@/server/inbox/ingest");
  let hist: typeof import("@/server/oportunidad-historial");

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_DB;
    process.env.APP_BASE_URL ??= "http://localhost:3000";
    process.env.BETTER_AUTH_SECRET ??= "secreto-de-prueba-0123456789";
    process.env.ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
    process.env.META_WEBHOOK_VERIFY_TOKEN ??= "verifica123";
    db = await import("@/lib/db");
    ingest = await import("@/server/inbox/ingest");
    hist = await import("@/server/oportunidad-historial");
    const d = db.getDb();
    await d.insert(db.schema.organization).values({ id: org, name: "Constructora" });
    await d.insert(db.schema.contact).values(
      ["a", "b", "c"].map((x, i) => ({ id: `ct_ia_${x}_${org}`, organizationId: org, waIdentity: `54911500000${i}`, name: x }))
    );
  });

  afterAll(async () => {
    if (!db) return;
    const { sql } = await import("drizzle-orm");
    await db.getDb().execute(sql`DELETE FROM organization WHERE id = ${org}`);
  });

  it("prendido (por defecto): nace con IA; apagado: nace sin IA; lo que ya existía no cambia", async () => {
    const a = await ingest.getOrCreateConversation(org, `ct_ia_a_${org}`);
    expect(a.aiEnabled).toBe(true);

    const actuales = await hist.leerAjustesVentas(org);
    expect(actuales.iaConversacionesNuevas).toBe(true);
    await hist.guardarAjustesVentas(org, { ...actuales, iaConversacionesNuevas: false });
    expect((await hist.leerAjustesVentas(org)).iaConversacionesNuevas).toBe(false);

    const b = await ingest.getOrCreateConversation(org, `ct_ia_b_${org}`);
    expect(b.aiEnabled).toBe(false);
    const a2 = await ingest.getOrCreateConversation(org, `ct_ia_a_${org}`);
    expect(a2.aiEnabled).toBe(true);

    await hist.guardarAjustesVentas(org, { ...actuales, iaConversacionesNuevas: true });
    const c = await ingest.getOrCreateConversation(org, `ct_ia_c_${org}`);
    expect(c.aiEnabled).toBe(true);
  });
});
