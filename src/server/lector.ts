import { and, asc, eq, gt, isNotNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { chatJson } from "@/lib/ai";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { esTrivial, etapaQueSube } from "@/lib/lector";
import { edificioDelMensaje, portalDelMensaje } from "@/lib/origen-por-mensaje";
import { etiquetaAmbientes } from "@/lib/ventas";
import { esDeLaEmpresa } from "@/server/de-la-empresa";
import { cambiarEstadoOportunidad } from "@/server/oportunidad-historial";
import {
  abrirOportunidad,
  aplicarFichaDelCerebro,
  CLAVES_FICHA_WAR,
  estadoComercialDelContacto,
  sumarInteres,
} from "@/server/oportunidades";
import { resolverOrigen } from "@/server/origenes";
import { vocabulario } from "@/server/vocabulario";

/**
 * El LECTOR (v4, rehecho en la v7): lee cada ráfaga del chat y arma y avanza
 * la oportunidad. No contesta NADA.
 *
 * - **Por ráfaga y sin perderla:** cada mensaje entrante anota la
 *   conversación como pendiente (`lector_pendiente_desde`); un barrido lee
 *   las que llevan `ESPERA_MS` quietas. Un deploy no borra nada: al arrancar
 *   se leen las que quedaron en el aire.
 * - **Primero reglas, sin créditos:** el primer mensaje de un portal
 *   (Zonaprop, Mercado Libre) da el origen y, si el link trae la dirección,
 *   el edificio. Los mensajes que no aportan («ok», «gracias», un emoji) no
 *   se leen.
 * - **Después, IA barata y corta:** solo lo NUEVO desde la última lectura
 *   (`lector_leido_hasta`) más un resumen de lo que ya se sabe; con el modelo
 *   del juez. Y solo si queda algo por saber: sin nada que clasificar ni etapa
 *   que subir, no hay llamada.
 * - **La etapa solo sube**, y solo hasta «Conoce información» (`etapaQueSube`).
 *   Lo que movió una persona queda como piso. Visitó sale de la cita; Reservó,
 *   Compró y los cierres son de una persona.
 * - Con el agente encendido también lee (el agente no avanza la etapa); la
 *   clasificación solo se pide si le falta a la ficha.
 * - Nunca un contacto de la empresa, nunca el Laboratorio. Sin IA configurada,
 *   solo las reglas. Un hipo del proveedor deja la ráfaga para la próxima.
 */

const ESPERA_MS = 90_000;
const BARRIDO_MS = 30_000;
const MENSAJES = 20;
const POR_BARRIDO = 10;

/** Lo pide la ingesta con cada mensaje entrante real. Nunca lanza. */
export function programarLector(organizationId: string, conversationId: string): void {
  try {
    void Promise.resolve(
      getDb()
        .update(schema.conversation)
        .set({ lectorPendienteDesde: new Date() })
        .where(and(eq(schema.conversation.organizationId, organizationId), eq(schema.conversation.id, conversationId)))
    ).catch(() => undefined);
  } catch {
    // nunca frena la ingesta
  }
}

const g = globalThis as unknown as { __lectorBarrido?: ReturnType<typeof setInterval>; __lectorCorriendo?: boolean };

/** Al arrancar: el barrido de ráfagas pendientes (también las que dejó un deploy). */
export function iniciarLector(): void {
  if (g.__lectorBarrido) return;
  g.__lectorBarrido = setInterval(() => void barrer(), BARRIDO_MS);
  g.__lectorBarrido.unref?.();
}

async function barrer(): Promise<void> {
  if (g.__lectorCorriendo) return;
  g.__lectorCorriendo = true;
  try {
    const limite = new Date(Date.now() - ESPERA_MS);
    const pendientes = await getDb()
      .select({ id: schema.conversation.id, organizationId: schema.conversation.organizationId })
      .from(schema.conversation)
      .where(and(isNotNull(schema.conversation.lectorPendienteDesde), lte(schema.conversation.lectorPendienteDesde, limite)))
      .orderBy(asc(schema.conversation.lectorPendienteDesde))
      .limit(POR_BARRIDO);
    for (const p of pendientes) {
      try {
        await leerConversacion(p.organizationId, p.id);
      } catch (err) {
        console.error("[lector] no se pudo leer la conversación:", err instanceof Error ? err.message : err);
        // Se suelta igual: la próxima ráfaga la vuelve a anotar.
        await soltar(p.id, null);
      }
    }
  } catch (err) {
    console.error("[lector] barrido:", err instanceof Error ? err.message : err);
  } finally {
    g.__lectorCorriendo = false;
  }
}

/** Ya leída: deja de estar pendiente y, si se leyó algo, recuerda hasta dónde. */
async function soltar(conversationId: string, leidoHasta: Date | null): Promise<void> {
  await getDb()
    .update(schema.conversation)
    .set({ lectorPendienteDesde: null, ...(leidoHasta ? { lectorLeidoHasta: leidoHasta } : {}) })
    .where(eq(schema.conversation.id, conversationId));
}

const respuestaSchema = z.object({
  clase: z.string().nullable().optional(),
  edificios: z.array(z.string()).nullable().optional(),
  ambientes: z.array(z.union([z.number(), z.string()])).nullable().optional(),
  etapa: z.string().nullable().optional(),
});

/** Qué clase de contacto, en las palabras que entiende la ficha. */
const CLASES: Record<string, string> = {
  venta: "lead",
  alquiler: "alquiler",
  inmobiliaria: "inmobiliaria",
  cliente: "cliente",
  proveedor: "proveedor",
};

export async function leerConversacion(organizationId: string, conversationId: string): Promise<void> {
  const db = getDb();
  const [conv] = await db
    .select({
      contactId: schema.conversation.contactId,
      isTest: schema.conversation.isTest,
      leidoHasta: schema.conversation.lectorLeidoHasta,
    })
    .from(schema.conversation)
    .where(scoped(schema.conversation.organizationId, organizationId, eq(schema.conversation.id, conversationId)))
    .limit(1);
  if (!conv) return;
  if (conv.isTest || (await esDeLaEmpresa(organizationId, conv.contactId))) return soltar(conversationId, null);

  // Solo lo nuevo desde la última lectura.
  const nuevos = await db
    .select({ direction: schema.message.direction, text: schema.message.text, createdAt: schema.message.createdAt })
    .from(schema.message)
    .where(
      and(
        eq(schema.message.conversationId, conversationId),
        isNotNull(schema.message.text),
        ...(conv.leidoHasta ? [gt(schema.message.createdAt, conv.leidoHasta)] : [])
      )
    )
    .orderBy(asc(schema.message.createdAt))
    .limit(60);
  const recientes = nuevos.slice(-MENSAJES);
  const hasta = nuevos.at(-1)?.createdAt ?? null;
  const entrantes = recientes.filter((m) => m.direction === "in" && m.text?.trim());
  if (!entrantes.length) return soltar(conversationId, hasta);

  const voc = await vocabulario();
  const edificiosCatalogo = await db
    .select({ id: schema.edificio.id, nombre: schema.edificio.nombre, direccion: schema.edificio.direccion })
    .from(schema.edificio)
    // v5 — Solo los que están en venta: por los otros no se abre una oportunidad.
    .where(scoped(schema.edificio.organizationId, organizationId, eq(schema.edificio.enVenta, true)));

  let estado = await estadoComercialDelContacto(organizationId, conv.contactId);
  if (!estado) return soltar(conversationId, hasta);

  // 1) Reglas, sin créditos: el primer mensaje de un portal.
  // Solo si lo leído es el chat entero (una conversación nueva, no un historial largo).
  if (!conv.leidoHasta && nuevos.length < 60 && voc.inmobiliario) {
    const primero = entrantes[0]!.text!;
    const portal = portalDelMensaje(primero);
    if (portal) {
      const edificio = edificioDelMensaje(primero, edificiosCatalogo);
      // Un aviso de un portal por un edificio en venta es una consulta de Venta.
      if (!estado.abierta && edificio && !estado.tiposContacto.length) {
        await abrirOportunidad(organizationId, conv.contactId, { fuente: "sistema" }, "venta").catch(() => null);
      }
      estado = (await estadoComercialDelContacto(organizationId, conv.contactId)) ?? estado;
      const op = estado.abierta;
      if (op) {
        const cambios: Record<string, unknown> = {};
        const [fila] = await db
          .select({ origen: schema.oportunidad.origen })
          .from(schema.oportunidad)
          .where(eq(schema.oportunidad.id, op.id))
          .limit(1);
        const origen = fila?.origen ? null : await resolverOrigen(organizationId, portal);
        if (origen) cambios.origen = origen;
        if (Object.keys(cambios).length) {
          await db.update(schema.oportunidad).set({ ...cambios, updatedAt: new Date() }).where(eq(schema.oportunidad.id, op.id));
        }
        if (edificio && !op.edificios.length) await sumarInteres(organizationId, op.id, [edificio.id], []);
        console.log(`[lector] ${conversationId}: ${portal}${edificio ? ` · ${edificio.nombre}` : ""} (reglas)`);
      }
      estado = (await estadoComercialDelContacto(organizationId, conv.contactId)) ?? estado;
    }
  }

  // 2) ¿Queda algo por saber? Si no, no se gasta una llamada.
  const op = estado.abierta;
  const faltaClase = !op && estado.tiposContacto.length === 0;
  const faltaInteres = voc.inmobiliario && Boolean(op) && !op!.edificios.length && !op!.ambientes.length;
  const puedeSubir = voc.inmobiliario && Boolean(op) && etapaQueSube(op!.estado, "conoce_informacion") !== null;
  const aporta = entrantes.some((m) => !esTrivial(m.text));
  if (!aporta || (!faltaClase && !faltaInteres && !puedeSubir)) return soltar(conversationId, hasta);

  // 3) IA: lo nuevo + un resumen de lo que ya se sabe.
  const chat = recientes
    .filter((m) => m.text?.trim())
    .map((m) => `${m.direction === "in" ? "Cliente" : "Nosotros"}: ${m.text!.trim().slice(0, 400)}`)
    .join("\n");
  const sabido = op
    ? [
        `Oportunidad abierta${op.tipo ? ` de ${op.tipo}` : ""}, etapa actual: ${op.estado}.`,
        op.edificios.length ? `Edificios: ${op.edificios.map((e) => e.nombre).join(", ")}.` : "",
        op.ambientes.length ? `Busca: ${op.ambientes.map(etiquetaAmbientes).join(", ")}.` : "",
      ]
        .filter(Boolean)
        .join(" ")
    : estado.tiposContacto.length
      ? `Contacto ya clasificado como: ${estado.tiposContacto.join(", ")}.`
      : "Todavía no se sabe qué busca.";

  const pide: string[] = [];
  if (faltaClase) {
    pide.push(
      'clase (una sola, o null si todavía no está claro): "venta" (quiere comprar una unidad), "alquiler" (se contacta explícitamente para alquilar), "inmobiliaria" (inmobiliaria o corredor que consulta por unidades), "cliente" (ya compró y escribe como propietario), "proveedor" (ofrece servicios o productos, busca trabajo, manda currículum).'
    );
  }
  if (faltaClase || faltaInteres) {
    pide.push(
      `edificios: los que nombra, tal como figuran en esta lista (o []): ${edificiosCatalogo.map((e) => e.nombre).join(", ") || "(ninguno)"}.`,
      "ambientes: los números de ambientes que busca (monoambiente = 1), o []."
    );
  }
  if (puedeSubir || faltaClase) {
    pide.push(
      'etapa (o null): "en_charlas" si el cliente conversa (responde, pregunta, cuenta lo que busca); "conoce_informacion" si NOSOTROS ya le pasamos información concreta (precios, planos, disponibilidad, financiación). Solo lo que muestran estos mensajes.'
    );
  }

  const r = await chatJson(
    respuestaSchema,
    [
      {
        role: "system",
        content: [
          "Leés mensajes nuevos de un chat de WhatsApp de una desarrolladora inmobiliaria y los clasificás. NO contestás al cliente.",
          'Devolvé SOLO un JSON con: {"clase", "edificios", "ambientes", "etapa"} (lo que no se pide, null).',
          ...pide,
          "Si no hay evidencia clara, null y listas vacías: mejor sin clasificar que mal clasificado.",
          `Lo que ya se sabe: ${sabido}`,
        ].join("\n"),
      },
      { role: "user", content: chat },
    ],
    { organizationId, judge: true, timeoutMs: 30_000 }
  );
  if (!r.ok) {
    if (r.error !== "not_configured") {
      console.warn(`[lector] ${r.error}: ${r.detail}`);
      // Se suelta sin avanzar `leidoHasta`: la próxima ráfaga lo vuelve a leer.
      return soltar(conversationId, null);
    }
    return soltar(conversationId, hasta);
  }

  const clase = faltaClase ? CLASES[(r.data.clase ?? "").trim().toLowerCase()] : undefined;
  const nombres = faltaClase || faltaInteres ? (r.data.edificios ?? []).filter((e) => e.trim()) : [];
  const ambientes =
    faltaClase || faltaInteres
      ? (r.data.ambientes ?? []).map((a) => Number(a)).filter((n) => Number.isInteger(n) && n >= 1 && n <= 6)
      : [];

  // El mismo camino que la ficha del agente.
  if (clase || nombres.length || ambientes.length) {
    const ficha: Record<string, unknown> = {};
    if (clase) ficha[CLAVES_FICHA_WAR.tipo] = clase;
    if (nombres.length) ficha[CLAVES_FICHA_WAR.edificios] = nombres.join(", ");
    if (ambientes.length) ficha[CLAVES_FICHA_WAR.tipologias] = ambientes.map((n) => `${n} ambientes`).join(", ");
    await aplicarFichaDelCerebro({ organizationId, contactId: conv.contactId, esPrueba: false, ficha });
  }

  // La etapa: solo sube.
  let subio: string | null = null;
  if (voc.inmobiliario) {
    const ahora = (await estadoComercialDelContacto(organizationId, conv.contactId))?.abierta;
    const destino = ahora ? etapaQueSube(ahora.estado, r.data.etapa) : null;
    if (ahora && destino) {
      await cambiarEstadoOportunidad({
        organizationId,
        oportunidadId: ahora.id,
        destino,
        actor: { fuente: "ia" },
      });
      subio = destino;
    }
  }
  await soltar(conversationId, hasta);
  console.log(
    `[lector] ${conversationId}: ${clase ?? "sin clase"}, ${nombres.length} edificio(s), ${ambientes.length} ambiente(s)${subio ? `, etapa → ${subio}` : ""}`
  );
}

/** Para pruebas y diagnósticos: cuántas conversaciones esperan al lector. */
export async function pendientesDelLector(): Promise<number> {
  const [f] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.conversation)
    .where(isNotNull(schema.conversation.lectorPendienteDesde));
  return f?.n ?? 0;
}
