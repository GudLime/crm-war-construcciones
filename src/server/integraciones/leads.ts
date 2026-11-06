import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import {
  fuenteDelContacto,
  oportunidadParaElLead,
} from "@/lib/leads";
import { normalizarTelefono } from "@/lib/telefono";
import { ESTADOS_ABIERTOS, resolverEdificiosPorNombre, type EstadoOportunidad } from "@/lib/ventas";
import { findWhatsappContact } from "@/server/inbox/identity";
import { createLeadForContact } from "@/server/inbox/lead-activity";
import { avisarConversaciones, sumarInteres } from "@/server/oportunidades-war";

/**
 * War — Un lead de formulario (Meta vía Make, o un portal) entra al CRM.
 *
 * 1. El lead ID hace la entrada idempotente: si Make reintenta, no se duplica.
 * 2. El teléfono se normaliza (`lib/telefono.ts`) y con él se busca al
 *    contacto con la MISMA regla que usa la ingesta de WhatsApp. Si la
 *    persona ya escribió (o escribe después), es el mismo contacto.
 * 3. Oportunidad: si tiene una abierta del mismo edificio (o una abierta sin
 *    edificio todavía), el lead se suma a esa y vuelve arriba por su última
 *    interacción. Si no, se abre una nueva.
 * 4. El lead ID, la campaña y el formulario quedan en `oportunidad_lead`.
 */

const ABIERTOS = ESTADOS_ABIERTOS as EstadoOportunidad[];

export type LeadEntrante = {
  leadId: string;
  /** Ya canónico: uno de Ajustes → Orígenes. */
  origen: string;
  nombre: string | null;
  telefono: string | null;
  email: string | null;
  /** Id del edificio o su nombre / dirección, como lo mande el escenario. */
  edificio: string | null;
  campaignId?: string | null;
  campaignName?: string | null;
  adsetId?: string | null;
  adsetName?: string | null;
  adId?: string | null;
  adName?: string | null;
  formId?: string | null;
  formName?: string | null;
  plataforma?: string | null;
  recibidoAt?: Date | null;
  respuestas?: Record<string, unknown> | null;
};

export type ResultadoLead = {
  resultado: "nueva" | "sumada" | "duplicado";
  oportunidadId: string;
  contactId: string | null;
  contactoNuevo: boolean;
  /** false: el teléfono no se pudo leer; la oportunidad queda sin contacto. */
  telefonoValido: boolean;
  telefono: string | null;
  edificioId: string | null;
};

export class LeadError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

function esViolacionUnica(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "23505"
  );
}

async function yaRecibido(organizationId: string, leadId: string): Promise<ResultadoLead | null> {
  const [fila] = await getDb()
    .select()
    .from(schema.oportunidadLead)
    .where(
      scoped(
        schema.oportunidadLead.organizationId,
        organizationId,
        eq(schema.oportunidadLead.leadId, leadId)
      )
    )
    .limit(1);
  if (!fila) return null;
  let telefono: string | null = null;
  if (fila.contactId) {
    const [c] = await getDb()
      .select({ phone: schema.contact.phone })
      .from(schema.contact)
      .where(eq(schema.contact.id, fila.contactId))
      .limit(1);
    telefono = c?.phone ?? null;
  }
  return {
    resultado: "duplicado",
    oportunidadId: fila.oportunidadId,
    contactId: fila.contactId,
    contactoNuevo: false,
    telefonoValido: telefono !== null,
    telefono,
    edificioId: fila.edificioId,
  };
}

/** Id exacto o, si no, un único edificio por nombre o dirección. */
async function resolverEdificio(
  organizationId: string,
  raw: string | null
): Promise<string | null> {
  const buscado = raw?.trim();
  if (!buscado) return null;
  const edificios = await getDb()
    .select({
      id: schema.edificio.id,
      nombre: schema.edificio.nombre,
      direccion: schema.edificio.direccion,
    })
    .from(schema.edificio)
    .where(scoped(schema.edificio.organizationId, organizationId));
  const exacto = edificios.find((e) => e.id === buscado);
  if (exacto) return exacto.id;
  const porNombre = resolverEdificiosPorNombre(buscado, edificios);
  if (porNombre.length === 1) return porNombre[0]!.id;
  throw new LeadError(
    422,
    "edificio_desconocido",
    porNombre.length
      ? `«${buscado}» coincide con varios edificios: mandá el id`
      : `No hay ningún edificio que coincida con «${buscado}»`
  );
}

async function contactoDelLead(
  organizationId: string,
  telefono: string,
  lead: LeadEntrante
): Promise<{ id: string; nuevo: boolean }> {
  const db = getDb();
  const identidad = { identity: telefono, phone: telefono, waUserId: null, profileName: null };
  const existente = await findWhatsappContact(organizationId, identidad);
  if (existente) {
    const cambios: Partial<typeof schema.contact.$inferInsert> = {};
    if (!existente.email && lead.email) cambios.email = lead.email.toLowerCase();
    if (!existente.source) cambios.source = fuenteDelContacto(lead.origen);
    // Sin clasificar → Lead: llenó un formulario de venta. Si una persona ya
    // lo clasificó como otra cosa, se respeta.
    if (!existente.tipoContacto) cambios.tipoContacto = "lead";
    // Si el nombre es el teléfono (llegó por WhatsApp sin perfil), el del
    // formulario es mejor.
    if (lead.nombre && /^[+\d\s()-]*$/.test(existente.name)) {
      cambios.name = lead.nombre;
    }
    if (existente.archivedAt) cambios.archivedAt = null;
    if (Object.keys(cambios).length) {
      await db
        .update(schema.contact)
        .set({ ...cambios, updatedAt: new Date() })
        .where(eq(schema.contact.id, existente.id));
    }
    return { id: existente.id, nuevo: false };
  }

  const [creado] = await db
    .insert(schema.contact)
    .values({
      id: newId("contact"),
      organizationId,
      name: lead.nombre ?? `+${telefono}`,
      phone: telefono,
      waIdentity: telefono,
      email: lead.email?.toLowerCase() ?? null,
      source: fuenteDelContacto(lead.origen),
      tipoContacto: "lead",
    })
    .onConflictDoNothing({
      target: [schema.contact.organizationId, schema.contact.channel, schema.contact.waIdentity],
    })
    .returning({ id: schema.contact.id });
  if (!creado) {
    // Carrera con el WhatsApp de la misma persona: ya existe, se usa ese.
    const ganador = await findWhatsappContact(organizationId, identidad);
    if (!ganador) throw new Error("contacto no encontrado tras la carrera");
    return { id: ganador.id, nuevo: false };
  }
  // Sin lead del Pipeline el contacto no se ve en el tablero.
  await createLeadForContact({ organizationId, contactId: creado.id, source: "sistema" });
  return { id: creado.id, nuevo: true };
}

async function abiertasDelContacto(organizationId: string, contactId: string) {
  const db = getDb();
  const ops = await db
    .select({ id: schema.oportunidad.id, edificioId: schema.oportunidad.edificioId })
    .from(schema.oportunidad)
    .where(
      scoped(
        schema.oportunidad.organizationId,
        organizationId,
        eq(schema.oportunidad.contactId, contactId),
        inArray(schema.oportunidad.estado, ABIERTOS)
      )
    )
    .orderBy(desc(schema.oportunidad.ultimaInteraccion));
  if (!ops.length) return [];
  const interes = await db
    .select({
      oportunidadId: schema.oportunidadEdificio.oportunidadId,
      edificioId: schema.oportunidadEdificio.edificioId,
    })
    .from(schema.oportunidadEdificio)
    .where(
      and(
        eq(schema.oportunidadEdificio.organizationId, organizationId),
        inArray(
          schema.oportunidadEdificio.oportunidadId,
          ops.map((o) => o.id)
        )
      )
    );
  return ops.map((o) => {
    const ids = new Set(interes.filter((i) => i.oportunidadId === o.id).map((i) => i.edificioId));
    if (o.edificioId) ids.add(o.edificioId);
    return { id: o.id, edificioIds: [...ids] };
  });
}

export async function recibirLead(
  organizationId: string,
  lead: LeadEntrante
): Promise<ResultadoLead> {
  const previo = await yaRecibido(organizationId, lead.leadId);
  if (previo) return previo;

  const db = getDb();
  const edificioId = await resolverEdificio(organizationId, lead.edificio);
  const tel = normalizarTelefono(lead.telefono);
  const telefono = tel.ok ? tel.telefono : null;
  const ahora = new Date();

  const contacto = telefono ? await contactoDelLead(organizationId, telefono, lead) : null;

  // ¿Se suma a una abierta o se abre una nueva?
  const abiertas = contacto ? await abiertasDelContacto(organizationId, contacto.id) : [];
  const destino = oportunidadParaElLead(abiertas, edificioId);

  let oportunidadId: string;
  if (destino) {
    oportunidadId = destino;
    const [actual] = await db
      .select({ origen: schema.oportunidad.origen, edificioId: schema.oportunidad.edificioId })
      .from(schema.oportunidad)
      .where(eq(schema.oportunidad.id, destino))
      .limit(1);
    await db
      .update(schema.oportunidad)
      .set({
        ultimaInteraccion: ahora,
        updatedAt: ahora,
        ...(actual && !actual.origen ? { origen: lead.origen } : {}),
        ...(actual && !actual.edificioId && edificioId ? { edificioId } : {}),
      })
      .where(eq(schema.oportunidad.id, destino));
  } else {
    let nombre = lead.nombre ?? (telefono ? `+${telefono}` : "Lead sin nombre");
    if (!telefono && lead.telefono?.trim()) {
      nombre = `${nombre} (revisar teléfono: ${lead.telefono.trim()})`.slice(0, 200);
    }
    const [nueva] = await db
      .insert(schema.oportunidad)
      .values({
        id: newId("oportunidad"),
        organizationId,
        nombre,
        origen: lead.origen,
        contactId: contacto?.id ?? null,
        edificioId,
        estado: "recibido",
        ultimaInteraccion: ahora,
      })
      .returning({ id: schema.oportunidad.id });
    oportunidadId = nueva!.id;
  }
  if (edificioId) await sumarInteres(organizationId, oportunidadId, [edificioId], []);

  try {
    await db.insert(schema.oportunidadLead).values({
      id: newId("oportunidadLead"),
      organizationId,
      oportunidadId,
      contactId: contacto?.id ?? null,
      leadId: lead.leadId,
      origen: lead.origen,
      edificioId,
      telefonoCrudo: lead.telefono?.trim() || null,
      campaignId: lead.campaignId ?? null,
      campaignName: lead.campaignName ?? null,
      adsetId: lead.adsetId ?? null,
      adsetName: lead.adsetName ?? null,
      adId: lead.adId ?? null,
      adName: lead.adName ?? null,
      formId: lead.formId ?? null,
      formName: lead.formName ?? null,
      plataforma: lead.plataforma ?? null,
      respuestas: lead.respuestas ?? null,
      recibidoAt: lead.recibidoAt ?? ahora,
    });
  } catch (err) {
    // Dos reintentos de Make a la vez: el segundo devuelve lo del primero y
    // borra la oportunidad que acababa de abrir, para no dejar una gemela.
    if (esViolacionUnica(err)) {
      const ganador = await yaRecibido(organizationId, lead.leadId);
      if (ganador) {
        if (!destino && ganador.oportunidadId !== oportunidadId) {
          await db.delete(schema.oportunidad).where(eq(schema.oportunidad.id, oportunidadId));
        }
        return ganador;
      }
    }
    throw err;
  }

  if (contacto) await avisarConversaciones(organizationId, contacto.id);

  return {
    resultado: destino ? "sumada" : "nueva",
    oportunidadId,
    contactId: contacto?.id ?? null,
    contactoNuevo: contacto?.nuevo ?? false,
    telefonoValido: telefono !== null,
    telefono,
    edificioId,
  };
}
