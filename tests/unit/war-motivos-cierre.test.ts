import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MOTIVOS_POR_DEFECTO, planoMotivo } from "@/lib/motivos-cierre";

/** War — Motivos de cierre configurables (Ajustes → Motivos de cierre). */

describe("War: motivos de cierre por defecto", () => {
  it("son los 27 de Notion, sin repetidos", () => {
    expect(MOTIVOS_POR_DEFECTO).toHaveLength(27);
    expect(new Set(MOTIVOS_POR_DEFECTO.map(planoMotivo)).size).toBe(27);
    for (const m of ["Busca alquiler", "Crédito hipotecario", "Chusma de barrio", "No responde", "Compró"]) {
      expect(MOTIVOS_POR_DEFECTO).toContain(m);
    }
  });

  it("compara sin mayúsculas, tildes ni espacios", () => {
    expect(planoMotivo("Busca de Pozo")).toBe(planoMotivo("busca  de pozo"));
    expect(planoMotivo("Numero incorrecto")).toBe(planoMotivo("Número incorrecto"));
  });
});

const URL_DB = process.env.MOTOR_TEST_DATABASE_URL;

describe.skipIf(!URL_DB)("War: motivos de cierre en Postgres", () => {
  const org = `org_motivos_${Date.now()}`;
  let mc: typeof import("@/server/motivos-cierre");
  let db: typeof import("@/lib/db");

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_DB;
    process.env.APP_BASE_URL ??= "http://localhost:3000";
    process.env.BETTER_AUTH_SECRET ??= "secreto-de-prueba-0123456789";
    process.env.ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
    process.env.META_WEBHOOK_VERIFY_TOKEN ??= "verifica123";
    db = await import("@/lib/db");
    mc = await import("@/server/motivos-cierre");
    await db.getDb().insert(db.schema.organization).values({ id: org, name: "Constructora" });
  });

  afterAll(async () => {
    if (!db) return;
    const { sql } = await import("drizzle-orm");
    await db.getDb().execute(sql`DELETE FROM organization WHERE id = ${org}`);
  });

  it("una organización nueva arranca con los 27, en orden", async () => {
    const lista = await mc.listarMotivos(org);
    expect(lista.map((m) => m.nombre)).toEqual([...MOTIVOS_POR_DEFECTO]);
  });

  it("crear, repetir, renombrar (arrastra a las oportunidades), validar y borrar", async () => {
    const { sql } = await import("drizzle-orm");
    const d = db.getDb();
    const nuevo = await mc.crearMotivo(org, { nombre: "Busca con cochera" });
    expect(nuevo.orden).toBe(27);
    await expect(mc.crearMotivo(org, { nombre: "busca con  COCHERA" })).rejects.toMatchObject({ code: "duplicado" });

    const opId = `op_mot_${Date.now()}`;
    await d.execute(
      sql`INSERT INTO oportunidad (id, organization_id, nombre, estado, motivo_cierre) VALUES (${opId}, ${org}, 'X', 'perdido', 'Busca con cochera')`
    );
    await mc.editarMotivo(org, nuevo.id, { nombre: "Busca cochera" });
    const [op] = (await d.execute(sql`SELECT motivo_cierre FROM oportunidad WHERE id = ${opId}`)) as unknown as {
      motivo_cierre: string;
    }[];
    expect(op?.motivo_cierre).toBe("Busca cochera");
    expect((await mc.listarMotivosConUsos(org)).find((m) => m.id === nuevo.id)?.usos).toBe(1);

    expect(await mc.motivoValido(org, "Busca cochera")).toBe(true);
    expect(await mc.motivoValido(org, "Inventado")).toBe(false);
    expect(await mc.motivoValido(org, null)).toBe(true);

    await mc.borrarMotivo(org, nuevo.id);
    expect(await mc.motivoValido(org, "Busca cochera")).toBe(false);
    // La que lo tenía lo conserva, y puede seguir guardándolo.
    expect(await mc.motivoValido(org, "Busca cochera", "Busca cochera")).toBe(true);
  });

  it("reordenar", async () => {
    const lista = await mc.listarMotivos(org);
    const ultimo = lista.at(-1)!;
    const r = await mc.ordenarMotivos(org, [ultimo.id]);
    expect(r[0]?.id).toBe(ultimo.id);
  });
});
