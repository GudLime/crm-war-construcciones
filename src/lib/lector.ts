import type { EstadoOportunidad } from "@/lib/ventas";

/**
 * v7 — Lo puro del lector: qué mensajes no vale la pena leer y hasta dónde
 * puede subir la etapa. Se prueba solo (tests/unit/lector.test.ts).
 */

/** Las etapas que la IA puede poner, en orden. Lo demás es de una persona (o de la cita). */
export const ETAPAS_DEL_LECTOR: readonly EstadoOportunidad[] = ["en_charlas", "conoce_informacion"];

/** El orden del embudo abierto, para no bajar nunca. */
const RANGO: Partial<Record<EstadoOportunidad, number>> = {
  recibido: 0,
  en_charlas: 1,
  conoce_informacion: 2,
  visito: 3,
  reservo: 4,
};

/**
 * La etapa a la que sube la oportunidad, o null si no cambia. Solo sube,
 * nunca baja ni pisa una etapa más avanzada (la haya puesto quien la haya
 * puesto), y solo hasta «Conoce información».
 */
export function etapaQueSube(
  actual: EstadoOportunidad,
  sugerida: string | null | undefined
): EstadoOportunidad | null {
  const destino = ETAPAS_DEL_LECTOR.find((e) => e === sugerida);
  if (!destino) return null;
  const a = RANGO[actual];
  const d = RANGO[destino]!;
  if (a === undefined) return null; // cerrada o fuera del embudo
  return d > a ? destino : null;
}

/** Un mensaje que no aporta: «ok», «gracias», un emoji, «👍», «jaja». */
export function esTrivial(texto: string | null | undefined): boolean {
  const t = (texto ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return true; // solo emojis o signos
  return /^(ok(a|ey|is)?|dale|listo|gracias|muchas gracias|mil gracias|genial|perfecto|buenisimo|joya|si|no|(ja)+|(je)+|hola|buen dia|buenas|buenas tardes|buenas noches|chau|saludos|bueno|igualmente)( (gracias|genial|perfecto|dale|ok))*$/.test(t);
}
