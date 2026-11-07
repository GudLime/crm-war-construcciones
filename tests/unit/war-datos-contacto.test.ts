import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { formatearCuil, formatearDni, generoDesdeTexto, soloDigitos } from "@/lib/datos-contacto";

/** War — Datos personales del contacto (punto 5 de la checklist de Notion). */

describe("War: datos del contacto", () => {
  it("normaliza y muestra DNI y CUIL", () => {
    expect(soloDigitos("20-12.345.678-9")).toBe("20123456789");
    expect(soloDigitos("  ")).toBeNull();
    expect(formatearCuil("20123456789")).toBe("20-12345678-9");
    expect(formatearDni("12345678")).toBe("12.345.678");
  });

  it("limpia el género de Notion", () => {
    expect(generoDesdeTexto("Mujer")).toBe("mujer");
    expect(generoDesdeTexto("Género: Hombre")).toBe("hombre");
    expect(generoDesdeTexto("Por favor proporciona un nombre…")).toBeNull();
  });
});

const URL_DB = process.env.MOTOR_TEST_DATABASE_URL;

describe.skipIf(!URL_DB)("War: datos del contacto en Postgres", () => {
  const org = `org_datos_${Date.now()}`;
  const [a, b, c] = [`ct_a_${Date.now()}`, `ct_b_${Date.now()}`, `ct_c_${Date.now()}`];
  let dc: typeof import("@/server/datos-contacto");
  let db: typeof import("@/lib/db");

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_DB;
    process.env.APP_BASE_URL ??= "http://localhost:3000";
    process.env.BETTER_AUTH_SECRET ??= "secreto-de-prueba-0123456789";
    process.env.ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
    process.env.META_WEBHOOK_VERIFY_TOKEN ??= "verifica123";
    db = await import("@/lib/db");
    dc = await import("@/server/datos-contacto");
    const d = db.getDb();
    await d.insert(db.schema.organization).values({ id: org, name: "Constructora" });
    await d.insert(db.schema.contact).values(
      [a, b, c].map((id, i) => ({ id, organizationId: org, waIdentity: `54911000000${i}`, phone: `54911000000${i}`, name: `Persona ${i}` }))
    );
  });

  afterAll(async () => {
    if (!db) return;
    const { sql } = await import("drizzle-orm");
    await db.getDb().execute(sql`DELETE FROM organization WHERE id = ${org}`);
  });

  it("guarda, lee y no pisa en modo «solo vacíos»", async () => {
    expect((await dc.leerDatosContacto(org, a)).dni).toBeNull();
    await dc.guardarDatosContacto(org, a, { dni: "12.345.678", cuil: "20-12345678-9", nacimiento: "1980-05-01", newsletter: true });
    let d = await dc.leerDatosContacto(org, a);
    expect(d).toMatchObject({ dni: "12345678", cuil: "20123456789", nacimiento: "1980-05-01", newsletter: true });
    await dc.guardarDatosContacto(org, a, { dni: "99999999", direccion: "Olazábal 2649" }, { soloVacios: true });
    d = await dc.leerDatosContacto(org, a);
    expect(d).toMatchObject({ dni: "12345678", direccion: "Olazábal 2649" });
    await dc.guardarDatosContacto(org, a, { dni: null });
    expect((await dc.leerDatosContacto(org, a)).dni).toBeNull();
  });

  it("parientes: se ven desde los dos lados y no se duplican", async () => {
    await dc.agregarPariente(org, b, a, "esposa");
    await dc.agregarPariente(org, a, b, "esposo");
    expect((await dc.leerDatosContacto(org, a)).parientes).toEqual([
      expect.objectContaining({ contactId: b, relacion: "esposo" }),
    ]);
    expect((await dc.leerDatosContacto(org, b)).parientes.map((p) => p.contactId)).toEqual([a]);
    await expect(dc.agregarPariente(org, a, a)).rejects.toMatchObject({ code: "invalid_body" });
    await dc.quitarPariente(org, b, a);
    expect((await dc.leerDatosContacto(org, a)).parientes).toEqual([]);
    await expect(dc.leerDatosContacto("otra_org", a)).rejects.toMatchObject({ status: 404 });
  });
});
