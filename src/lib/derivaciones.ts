/**
 * Cambios 23/11, punto 6 — La tarea que crea la IA al derivar: tipo, título y
 * vencimiento según el motivo. Lo puro, para probarlo sin base.
 */
export type TareaDeDerivacion = { tipo: "mensaje" | "llamada"; titulo: string; minutos: number; motivo: string };

const COMPRA = /reserv|señ|sen[ae]r|compr|cerrar (la )?operaci/i;

export function tareaParaDerivacion(codigo: string | null, resumen: string | null, nombre: string | null): TareaDeDerivacion {
  const quien = nombre?.trim().split(/\s+/)[0] || null;
  const a = (verbo: string) => (quien ? `${verbo} a ${quien}` : `${verbo} al cliente`);
  const texto = resumen?.trim() ?? "";
  if (COMPRA.test(texto)) return { tipo: "llamada", titulo: a("Llamar"), minutos: 0, motivo: "quiere reservar o comprar" };
  if (codigo === "modelo") return { tipo: "mensaje", titulo: "Contestar consulta", minutos: 0, motivo: texto || "pregunta que el agente no sabe contestar" };
  if (codigo === "cliente") return { tipo: "mensaje", titulo: a("Responder"), minutos: 15, motivo: "pidió hablar con una persona" };
  return { tipo: "mensaje", titulo: a("Responder"), minutos: 15, motivo: texto || "necesita una persona" };
}

export function comentarioDeDerivacion(ultimo: string | null, agente: string, motivo: string): string {
  const linea = ultimo?.replace(/\s+/g, " ").trim().slice(0, 300);
  return [linea ? `«${linea}»` : null, `derivada por ${agente} · ${motivo}`].filter(Boolean).join("\n\n");
}
