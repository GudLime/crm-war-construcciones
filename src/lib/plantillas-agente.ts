import type { RespuestaRapida } from "@/lib/respuestas-rapidas";

/**
 * v7 — Plantillas que el agente puede mandar armadas: las respuestas rápidas
 * marcadas con «La puede usar el agente». El agente las ve en su
 * conocimiento con un código [plantilla:atajo]; si lo escribe, el CRM saca el
 * código y manda el texto de la plantilla (con {nombre} resuelto) y después
 * sus fotos y videos. Mismo patrón que [fotos:…]: el cerebro no necesita una
 * herramienta nueva.
 *
 * PURO: se prueba solo (tests/unit/plantillas-agente.test.ts).
 */

const PATRON = /\[plantilla:\s*\/?([a-z0-9_-]{1,32})\s*\]/giu;

/** Saca el código del texto. Una plantilla por mensaje: la primera. */
export function extraerMarcaPlantilla(texto: string): { texto: string; atajo: string | null } {
  let atajo: string | null = null;
  for (const m of texto.matchAll(PATRON)) {
    atajo ??= m[1]!.toLowerCase();
  }
  if (!atajo) return { texto, atajo: null };
  const limpio = texto
    .replace(PATRON, "")
    .replace(/[ \t]+([.,;:!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { texto: limpio, atajo };
}

/** El texto final: lo que escribió el agente (si algo) y después la plantilla. */
export function textoConPlantilla(textoAgente: string, textoPlantilla: string): string {
  return [textoAgente.trim(), textoPlantilla.trim()].filter(Boolean).join("\n\n");
}

/** La sección del conocimiento del agente con sus plantillas. Vacía si no hay. */
export function textoPlantillasParaAgente(plantillas: readonly RespuestaRapida[]): string {
  if (!plantillas.length) return "";
  const lineas = plantillas.map((p) => {
    const adj = p.adjuntos?.length ? ` (sale con ${p.adjuntos.length} foto(s)/video(s))` : "";
    const vista = p.texto.replace(/\s+/g, " ").trim().slice(0, 280);
    return `- [plantilla:${p.atajo}]${adj}: ${vista}`;
  });
  return [
    "## Plantillas de respuesta",
    "Mensajes ya armados por el equipo. Cuando uno sirve tal cual para lo que pide la persona, escribí su código (por ejemplo [plantilla:" +
      plantillas[0]!.atajo +
      "]) en tu mensaje, una sola vez: el sistema lo saca y manda el texto completo de la plantilla, con sus fotos o videos. Podés sumar una frase tuya antes. No copies el texto a mano ni inventes códigos que no están en esta lista.",
    ...lineas,
  ].join("\n");
}
