/**
 * 050 — Notas internas: el DTO y lo puro de intercalarlas en el hilo.
 */

export type NotaDto = {
  id: string;
  /** War — `null` si se escribió desde la oportunidad (sin conversación). */
  conversationId: string | null;
  /** War — La oportunidad que estaba abierta cuando se escribió. */
  oportunidad: { id: string; nombre: string } | null;
  texto: string;
  createdAt: string;
  /** `null` si la cuenta de quien la escribió ya no existe. */
  autor: { id: string; nombre: string } | null;
  /** Calculado para quien pide: el autor o quien configura. */
  puedeBorrar: boolean;
};

export const NOTA_MAX = 4096;

/** Pura: quién puede borrar una nota. */
export function puedeBorrarNota(
  autorId: string | null,
  usuarioId: string,
  configura: boolean
): boolean {
  return configura || (autorId !== null && autorId === usuarioId);
}

/**
 * Pura: reparte las notas entre los mensajes por hora. `antes[i]` son las
 * notas que van justo antes del mensaje `i`; `alFinal`, las posteriores al
 * último mensaje. Con la misma hora, la nota va después del mensaje (se
 * escribió leyéndolo).
 */
export function intercalarNotas<N extends { createdAt: string }>(
  mensajes: readonly { createdAt: string }[],
  notas: readonly N[]
): { antes: N[][]; alFinal: N[] } {
  const ordenadas = [...notas].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const antes: N[][] = mensajes.map(() => []);
  const alFinal: N[] = [];
  let j = 0;
  for (const nota of ordenadas) {
    const t = Date.parse(nota.createdAt);
    while (j < mensajes.length && Date.parse(mensajes[j]!.createdAt) <= t) j++;
    if (j < mensajes.length) antes[j]!.push(nota);
    else alFinal.push(nota);
  }
  return { antes, alFinal };
}
