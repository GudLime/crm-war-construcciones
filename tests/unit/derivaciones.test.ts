import { describe, expect, it } from "vitest";
import { comentarioDeDerivacion, tareaParaDerivacion } from "@/lib/derivaciones";

describe("tarea de una derivación de la IA (cambios 23/11)", () => {
  it("según el motivo", () => {
    expect(tareaParaDerivacion("cliente", null, "Carolina Méndez")).toMatchObject({ tipo: "mensaje", titulo: "Responder a Carolina", minutos: 15 });
    expect(tareaParaDerivacion("modelo", "Quiere reservar la 3B", "Ana")).toMatchObject({ tipo: "llamada", titulo: "Llamar a Ana" });
    expect(tareaParaDerivacion("modelo", "¿Aceptan perros?", "Ana")).toMatchObject({ tipo: "mensaje", titulo: "Contestar consulta", minutos: 0 });
    expect(tareaParaDerivacion("error", null, null).titulo).toBe("Responder al cliente");
  });
  it("el comentario lleva el último mensaje y el motivo", () => {
    expect(comentarioDeDerivacion("Hola,   quiero  señar", "Mateo", "quiere reservar o comprar")).toBe(
      "«Hola, quiero señar»\n\nderivada por Mateo · quiere reservar o comprar"
    );
    expect(comentarioDeDerivacion(null, "Mateo", "x")).toBe("derivada por Mateo · x");
  });
});
