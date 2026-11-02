import { describe, expect, it } from "vitest";
import { z } from "zod";
import { emailOpcionalValido } from "@/lib/email";

/**
 * War — Correo opcional del contacto.
 *
 * El formulario avisa antes de mandar (`emailOpcionalValido`) y el servidor
 * vuelve a validar con Zod. Las dos puertas tienen que coincidir en lo básico:
 * vacío se acepta (es opcional) y algo sin forma de correo no.
 */
describe("emailOpcionalValido (formulario)", () => {
  it.each([
    ["", true],
    ["   ", true],
    ["ana@obra.com", true],
    ["  ana@obra.com.ar  ", true],
    ["ana@obra", false],
    ["ana obra@x.com", false],
    ["@obra.com", false],
    ["ana@", false],
  ])("%j → %s", (valor, esperado) => {
    expect(emailOpcionalValido(valor)).toBe(esperado);
  });
});

describe("validación del servidor (mismo esquema que /api/contacts)", () => {
  const email = z.string().trim().max(254).email("Correo no válido").optional();

  it("acepta un correo y lo devuelve sin espacios", () => {
    expect(email.parse("  ana@obra.com ")).toBe("ana@obra.com");
  });

  it("acepta que no venga", () => {
    expect(email.parse(undefined)).toBeUndefined();
  });

  it("rechaza algo que no es un correo", () => {
    expect(email.safeParse("ana@obra").success).toBe(false);
  });
});
