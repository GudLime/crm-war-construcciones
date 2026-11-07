import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { planoEdificio } from "@/server/importar-notion";

/** War — Importación de Notion (punto 9 de la checklist). */

describe("War: importar Notion", () => {
  it("reconoce el mismo edificio escrito distinto", () => {
    expect(planoEdificio("Av. Independencia 4154")).toBe(planoEdificio("Independencia 4154"));
    expect(planoEdificio("OLAZÁBAL 2649")).toBe(planoEdificio("Olazábal 2649"));
  });
});

const URL_DB = process.env.MOTOR_TEST_DATABASE_URL;

describe.skipIf(!URL_DB)("War: importar Notion en Postgres", () => {
  const org = `org_notion_${Date.now()}`;
  let imp: typeof import("@/server/importar-notion");
  let db: typeof import("@/lib/db");
  const sufijo = String(Date.now()).slice(-6);

  const lote = (aplicar: boolean) => ({
    aplicar,
    edificios: [
      { nombre: "Olazábal 2649", estado: "en_construccion" as const, enVenta: "Si" },
      { nombre: "Gallo 716", estado: "en_construccion" as const },
    ],
    contactos: [
      {
        clave: `ct-${sufijo}-1`,
        alias: [`ct-${sufijo}-9`],
        nombre: "Ana Prueba",
        telefono: `+54911${sufijo}01`,
        email: "ana@prueba.com",
        tipo: "lead" as const,
        genero: "mujer" as const,
        newsletter: true,
        creado: "2026-02-20T12:00:00-03:00",
        notas: [],
        oportunidades: [
          {
            clave: `op-${sufijo}-a`,
            nombre: "Ana Prueba",
            estado: "perdido" as const,
            motivo: "No responde",
            origen: "Meta Ads",
            tipo: "venta" as const,
            edificios: ["OLAZABAL 2649"],
            tipologias: ["2_ambientes" as const],
            leadId: `lead-${sufijo}`,
            llegoHasta: "conoce_informacion" as const,
            creada: "2026-02-20T12:00:00-03:00",
            editada: "2026-03-01T15:00:00-03:00",
            notas: [{ clave: `no-${sufijo}-1`, fecha: "2026-02-21T12:00:00-03:00", texto: "[Notion] Llamada\nNo atendió" }],
            tareas: [],
          },
          {
            clave: `op-${sufijo}-b`,
            nombre: "Ana Prueba 2",
            estado: "visito" as const,
            edificios: ["Gallo 716", "Edificio Fantasma"],
            tipologias: [],
            creada: "2026-03-05T12:00:00-03:00",
            editada: "2026-03-06T12:00:00-03:00",
            notas: [],
            tareas: [
              { clave: `ta-${sufijo}-1`, titulo: "Follow up", tipo: "llamada" as const, estado: "realizar" as const, fecha: "2026-03-10T12:00:00-03:00" },
            ],
          },
        ],
      },
      {
        clave: `ct-${sufijo}-2`,
        alias: [],
        nombre: "Sin Teléfono",
        newsletter: false,
        notas: [],
        oportunidades: [],
      },
    ],
    oportunidadesSinContacto: [],
  });

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_DB;
    process.env.APP_BASE_URL ??= "http://localhost:3000";
    process.env.BETTER_AUTH_SECRET ??= "secreto-de-prueba-0123456789";
    process.env.ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
    process.env.META_WEBHOOK_VERIFY_TOKEN ??= "verifica123";
    db = await import("@/lib/db");
    imp = await import("@/server/importar-notion");
    const d = db.getDb();
    await d.insert(db.schema.organization).values({ id: org, name: "Constructora" });
    await d.insert(db.schema.edificio).values({ id: `edi_${sufijo}`, organizationId: org, nombre: "Olazábal 2649", estado: "en_construccion" });
  });

  afterAll(async () => {
    if (!db) return;
    const { sql } = await import("drizzle-orm");
    await db.getDb().execute(sql`DELETE FROM organization WHERE id = ${org}`);
  });

  const cuenta = async (tabla: string) => {
    const { sql } = await import("drizzle-orm");
    const [f] = (await db.getDb().execute(sql`SELECT count(*)::int AS n FROM ${sql.identifier(tabla)} WHERE organization_id = ${org}`)) as unknown as {
      n: number;
    }[];
    return f?.n ?? 0;
  };

  it("la prueba no guarda nada pero informa exacto", async () => {
    const r = await imp.importarLote(org, imp.loteSchema.parse(lote(false)));
    expect(r.contactos).toMatchObject({ nuevos: 2, sinTelefono: 1 });
    expect(r.oportunidades.nuevas).toBe(2);
    expect(r.notas).toBe(1);
    expect(r.tareas).toBe(1);
    expect(r.edificiosCreados).toEqual(["Gallo 716"]);
    expect(r.problemas.join()).toContain("Edificio Fantasma");
    expect(await cuenta("contact")).toBe(0);
    expect(await cuenta("oportunidad")).toBe(0);
  });

  it("importa con historial, edificios, tipologías, lead, notas y tareas; repetir no duplica", async () => {
    const r = await imp.importarLote(org, imp.loteSchema.parse(lote(true)));
    expect(r.oportunidades.nuevas).toBe(2);
    expect(await cuenta("contact")).toBe(2);
    expect(await cuenta("oportunidad")).toBe(2);
    expect(await cuenta("oportunidad_edificio")).toBe(2);
    expect(await cuenta("oportunidad_tipologia")).toBe(1);
    expect(await cuenta("oportunidad_lead")).toBe(1);
    expect(await cuenta("conversation_note")).toBe(1);
    expect(await cuenta("tarea_venta")).toBe(1);
    expect(await cuenta("contacto_datos")).toBe(1);
    // creada + llegó a Conoce información + cerrada; creada + visitó
    expect(await cuenta("oportunidad_evento")).toBe(5);

    const otra = await imp.importarLote(org, imp.loteSchema.parse(lote(true)));
    expect(otra.contactos.yaImportados).toBe(2);
    expect(otra.oportunidades).toMatchObject({ nuevas: 0, yaImportadas: 2 });
    expect(otra.notas + otra.tareas).toBe(0);
    expect(await cuenta("oportunidad")).toBe(2);
  });

  it("une con lo que ya estaba en el CRM: contacto por teléfono y oportunidad por ID de lead", async () => {
    const { sql } = await import("drizzle-orm");
    const d = db.getDb();
    const tel = `54911${sufijo}77`;
    await d.execute(sql`INSERT INTO contact (id, organization_id, wa_identity, phone, name) VALUES (${`ct_x_${sufijo}`}, ${org}, ${tel}, ${tel}, 'Ya estaba')`);
    await d.execute(sql`INSERT INTO oportunidad (id, organization_id, nombre, estado, contact_id) VALUES (${`opt_x_${sufijo}`}, ${org}, 'Del CRM', 'en_charlas', ${`ct_x_${sufijo}`})`);
    await d.execute(
      sql`INSERT INTO oportunidad_lead (id, organization_id, oportunidad_id, lead_id, origen) VALUES (${`olead_x_${sufijo}`}, ${org}, ${`opt_x_${sufijo}`}, ${`lead-x-${sufijo}`}, 'Meta Ads')`
    );
    const r = await imp.importarLote(
      org,
      imp.loteSchema.parse({
        aplicar: true,
        contactos: [
          {
            clave: `ct-${sufijo}-3`,
            nombre: "Nombre de Notion",
            telefono: `+${tel}`,
            email: "nuevo@correo.com",
            oportunidades: [
              { clave: `op-${sufijo}-x`, nombre: "Igual", estado: "recibido", leadId: `lead-x-${sufijo}`, creada: "2026-01-01T12:00:00-03:00" },
            ],
          },
        ],
      })
    );
    expect(r.contactos.unidos).toBe(1);
    expect(r.oportunidades.unidasPorLead).toBe(1);
    const [c] = (await d.execute(sql`SELECT name, email FROM contact WHERE id = ${`ct_x_${sufijo}`}`)) as unknown as { name: string; email: string }[];
    expect(c).toEqual({ name: "Ya estaba", email: "nuevo@correo.com" });
    const [o] = (await d.execute(sql`SELECT estado FROM oportunidad WHERE id = ${`opt_x_${sufijo}`}`)) as unknown as { estado: string }[];
    expect(o?.estado).toBe("en_charlas");
  });
});
