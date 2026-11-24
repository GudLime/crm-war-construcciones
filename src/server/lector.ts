import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { chatJson } from "@/lib/ai";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { ESTADOS_ABIERTOS } from "@/lib/ventas";
import { aplicarFichaDelCerebro, CLAVES_FICHA_WAR } from "@/server/oportunidades";

/**
 * v4 — El LECTOR: cuando no lee el agente (apagado, o la IA en pausa en esa
 * conversación), el CRM lee el chat por su cuenta y arma la oportunidad. No
 * contesta NADA: solo clasifica.
 *
 * - Lee por ráfaga: cuando el cliente deja de escribir un rato.
 * - Solo si hace falta: sin oportunidad abierta y sin tipo de contacto, o con
 *   una oportunidad abierta todavía sin interés (ni edificios ni ambientes).
 * - Lo que detecta entra por el MISMO camino que la ficha del agente
 *   (`aplicarFichaDelCerebro`): Venta / Alquiler / Inmobiliaria abren la
 *   oportunidad; Cliente / Proveedor se suman al contacto.
 * - Usa la llave de Ajustes → IA. Sin IA configurada no hace nada. Un hipo
 *   del proveedor no rompe nada: queda para la próxima ráfaga.
 */

const ESPERA_MS = 90_000;
const MENSAJES = 30;

type Estado = { timers: Map<string, ReturnType<typeof setTimeout>> };
const g = globalThis as unknown as { __lector?: Estado };
const estado = (g.__lector ??= { timers: new Map() });

/** Lo pide la ingesta cuando el mensaje no va al agente. Nunca lanza. */
export function programarLector(organizationId: string, conversationId: string): void {
  try {
    const previo = estado.timers.get(conversationId);
    if (previo) clearTimeout(previo);
    const t = setTimeout(() => {
      estado.timers.delete(conversationId);
      void leerConversacion(organizationId, conversationId).catch((err) =>
        console.error("[lector] no se pudo leer la conversación:", err instanceof Error ? err.message : err)
      );
    }, ESPERA_MS);
    t.unref?.();
    estado.timers.set(conversationId, t);
  } catch {
    // nunca frena la ingesta
  }
}

const respuestaSchema = z.object({
  clase: z.string().nullable().optional(),
  edificios: z.array(z.string()).nullable().optional(),
  ambientes: z.array(z.union([z.number(), z.string()])).nullable().optional(),
});

/** Qué clase de contacto, en las palabras que entiende la ficha. */
const CLASES: Record<string, string> = {
  venta: "lead",
  alquiler: "alquiler",
  inmobiliaria: "inmobiliaria",
  cliente: "cliente",
  proveedor: "proveedor",
};

/** ¿Hace falta leer? Sin nada clasificado, o con la oportunidad sin interés. */
async function haceFalta(organizationId: string, contactId: string): Promise<boolean> {
  const db = getDb();
  const [contacto] = await db
    .select({ tipos: schema.contact.tiposContacto })
    .from(schema.contact)
    .where(scoped(schema.contact.organizationId, organizationId, eq(schema.contact.id, contactId)))
    .limit(1);
  if (!contacto) return false;
  const [abierta] = await db
    .select({ id: schema.oportunidad.id, edificioId: schema.oportunidad.edificioId })
    .from(schema.oportunidad)
    .where(
      scoped(
        schema.oportunidad.organizationId,
        organizationId,
        eq(schema.oportunidad.contactId, contactId),
        inArray(schema.oportunidad.estado, [...ESTADOS_ABIERTOS])
      )
    )
    .limit(1);
  if (!abierta) return contacto.tipos.length === 0;
  if (abierta.edificioId) return false;
  const [[edificio], [ambiente]] = await Promise.all([
    db
      .select({ id: schema.oportunidadEdificio.edificioId })
      .from(schema.oportunidadEdificio)
      .where(eq(schema.oportunidadEdificio.oportunidadId, abierta.id))
      .limit(1),
    db
      .select({ n: schema.oportunidadAmbiente.ambientes })
      .from(schema.oportunidadAmbiente)
      .where(eq(schema.oportunidadAmbiente.oportunidadId, abierta.id))
      .limit(1),
  ]);
  return !edificio && !ambiente;
}

export async function leerConversacion(organizationId: string, conversationId: string): Promise<void> {
  const db = getDb();
  const [conv] = await db
    .select({ contactId: schema.conversation.contactId, isTest: schema.conversation.isTest })
    .from(schema.conversation)
    .where(scoped(schema.conversation.organizationId, organizationId, eq(schema.conversation.id, conversationId)))
    .limit(1);
  if (!conv || conv.isTest) return;
  if (!(await haceFalta(organizationId, conv.contactId))) return;

  const filas = await db
    .select({ direction: schema.message.direction, text: schema.message.text })
    .from(schema.message)
    .where(and(eq(schema.message.conversationId, conversationId), isNotNull(schema.message.text)))
    .orderBy(desc(schema.message.createdAt))
    .limit(MENSAJES);
  const chat = filas
    .reverse()
    .filter((m) => m.text?.trim())
    .map((m) => `${m.direction === "in" ? "Cliente" : "Nosotros"}: ${m.text!.trim().slice(0, 600)}`)
    .join("\n");
  if (!chat.includes("Cliente:")) return;

  const edificios = await db
    .select({ nombre: schema.edificio.nombre })
    .from(schema.edificio)
    .where(scoped(schema.edificio.organizationId, organizationId));

  const r = await chatJson(
    respuestaSchema,
    [
      {
        role: "system",
        content: [
          "Leés un chat de WhatsApp de una desarrolladora inmobiliaria y lo clasificás. NO contestás al cliente.",
          'Devolvé SOLO un JSON: {"clase": ..., "edificios": [...], "ambientes": [...]}.',
          "clase (una sola, o null si todavía no está claro):",
          '- "venta": quiere comprar una unidad.',
          '- "alquiler": se contacta explícitamente para alquilar.',
          '- "inmobiliaria": es una inmobiliaria o un corredor que consulta por unidades.',
          '- "cliente": ya compró alguna vez y escribe como propietario.',
          '- "proveedor": ofrece servicios o productos, busca trabajo, manda fichas o currículum.',
          `edificios: los que nombra, tal como figuran en esta lista (o []): ${edificios.map((e) => e.nombre).join(", ") || "(ninguno)"}.`,
          "ambientes: los números de ambientes que busca (monoambiente = 1), o [].",
          "Si no hay evidencia clara, null y listas vacías: mejor sin clasificar que mal clasificado.",
        ].join("\n"),
      },
      { role: "user", content: chat },
    ],
    { organizationId, judge: true, timeoutMs: 30_000 }
  );
  if (!r.ok) {
    if (r.error !== "not_configured") console.warn(`[lector] ${r.error}: ${r.detail}`);
    return;
  }
  const clase = CLASES[(r.data.clase ?? "").trim().toLowerCase()];
  const nombres = (r.data.edificios ?? []).filter((e) => e.trim());
  const ambientes = (r.data.ambientes ?? [])
    .map((a) => Number(a))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 6);
  if (!clase && nombres.length === 0 && ambientes.length === 0) return;

  // El mismo camino que la ficha del agente.
  const ficha: Record<string, unknown> = {};
  if (clase) ficha[CLAVES_FICHA_WAR.tipo] = clase;
  if (nombres.length) ficha[CLAVES_FICHA_WAR.edificios] = nombres.join(", ");
  if (ambientes.length) ficha[CLAVES_FICHA_WAR.tipologias] = ambientes.map((n) => `${n} ambientes`).join(", ");
  await aplicarFichaDelCerebro({ organizationId, contactId: conv.contactId, esPrueba: false, ficha });
  console.log(`[lector] conversación ${conversationId}: ${clase ?? "sin clase"}, ${nombres.length} edificio(s), ${ambientes.length} ambiente(s)`);
}
