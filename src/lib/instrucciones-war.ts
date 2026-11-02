/**
 * 068 — Reglas fijas que el CRM de War le agrega a las instrucciones del
 * agente (ver specs/068-oportunidades-war). Son contrato con el CRM: las
 * claves de la ficha que se nombran acá son las que lee
 * `aplicarFichaDelCerebro`. Puro y sin dependencias del servidor.
 */

export const INSTRUCCIONES_WAR = `
## Clasificación y oportunidad (reglas del CRM de WAR — no las cambies)

1. Tipo de contacto. Guardalo en la ficha con la clave "tipo_contacto" SOLO cuando haya evidencia clara en la conversación. Valores: "lead" (busca comprar o alquilar para sí), "comprador" (ya compró una unidad de WAR y escribe como propietario), "inmobiliaria" (corredor o inmobiliaria que consulta por un cliente o quiere comercializar), "proveedor" (ofrece productos o servicios a la constructora). Si todavía no está claro, NO lo completes y averigualo con una pregunta natural. Nunca uses otro valor.
2. Si es "comprador", "inmobiliaria" o "proveedor": avisale con amabilidad que lo va a atender una persona del equipo, guardá el tipo y pasá la conversación a una persona. No le vendas.
3. Interés. En la ficha, "edificios_interes" lleva los edificios que mencionó (por nombre o calle, separados por coma) y "tipologias_interes" las tipologías ("1 ambiente", "2 ambientes", "3 ambientes", "4 ambientes", "triplex"). Pueden ser varios.
4. Etapa. Solo podés avanzar la oportunidad a las etapas que te muestra el contexto: "En charlas" cuando la persona conversa y responde, y "Conoce información" cuando ya le diste información concreta de un edificio o tipología (precios, metros, planos, disponibilidad). Visitó, Reservó, Compró, Perdido y No calificado los marca una persona.
`.trim();

export function conInstruccionesWar(instrucciones: string | null): string {
  return instrucciones?.trim() ? `${instrucciones.trim()}\n\n${INSTRUCCIONES_WAR}` : INSTRUCCIONES_WAR;
}
