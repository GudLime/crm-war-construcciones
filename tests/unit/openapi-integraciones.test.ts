import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { leadBodySchema } from "@/lib/leads";
import { ORIGENES_OPORTUNIDAD } from "@/lib/ventas";
import contrato from "../../docs/openapi-integraciones.json";

/**
 * War — El contrato de las integraciones (Make) se valida contra el código:
 * un campo nuevo en el cuerpo, un origen nuevo o un error nuevo sin
 * documentar ponen esto en rojo.
 */

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");

type Doc = {
  paths: Record<string, Record<string, { responses: Record<string, unknown> }>>;
  components: {
    schemas: {
      LeadEntrante: {
        required: string[];
        properties: Record<string, { enum?: string[] }>;
      };
    };
  };
};
const doc = contrato as unknown as Doc;
const lead = doc.components.schemas.LeadEntrante;

function codigos(status: string): string[] {
  const r = doc.paths["/api/integraciones/leads"]!.post!.responses[status] as {
    content: { "application/json": { "x-codigos": string[] } };
  };
  return [...r.content["application/json"]["x-codigos"]].sort();
}

describe("POST /api/integraciones/leads contra el código", () => {
  it("la ruta existe y solo acepta POST", () => {
    const fuente = leer("src/app/api/integraciones/leads/route.ts");
    const metodos = ["GET", "POST", "PUT", "PATCH", "DELETE"].filter((m) =>
      new RegExp(`export (async )?function ${m}\\b`).test(fuente)
    );
    expect(metodos).toEqual(["POST"]);
    expect(Object.keys(doc.paths["/api/integraciones/leads"]!)).toEqual(["post"]);
  });

  it("documenta exactamente los campos del cuerpo", () => {
    expect(Object.keys(lead.properties).sort()).toEqual(Object.keys(leadBodySchema.shape).sort());
    expect([...lead.required].sort()).toEqual(["leadId", "origen"]);
  });

  it("los orígenes son los de las oportunidades", () => {
    expect(lead.properties.origen!.enum).toEqual([...ORIGENES_OPORTUNIDAD]);
  });

  it("los 422 son los que devuelven la ruta y el servidor", () => {
    const fuentes = [
      leer("src/app/api/integraciones/leads/route.ts"),
      leer("src/server/integraciones/leads.ts"),
    ].join("\n");
    const enCodigo = new Set(
      [...fuentes.matchAll(/(?:apiError|LeadError)\(\s*422,\s*"([a-z_]+)"/g)].map((m) => m[1]!)
    );
    enCodigo.add("invalid_body"); // parseBody
    expect(codigos("422")).toEqual([...enCodigo].sort());
  });
});
