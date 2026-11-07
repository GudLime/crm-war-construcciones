import { and, eq, gte, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { soloDigitos } from "@/lib/datos-contacto";
import { normalizarTelefono } from "@/lib/telefono";

/**
 * War — Importación de Notion (punto 9 de la checklist). Recibe el archivo que
 * arma `transformar_notion.py` desde los CSV, en lotes de contactos con sus
 * oportunidades, notas y tareas abiertas.
 *
 * - Repetible: cada registro recuerda de qué clave de Notion vino
 *   (`importacion_externa`); lo ya importado no se vuelve a crear.
 * - No pisa: un contacto que ya existe (mismo teléfono, o mismo correo si no
 *   hay teléfono) solo completa lo vacío. Una oportunidad que ya entró por
 *   Make (mismo ID de lead) o que es la misma que ya está en el CRM (mismo
 *   contacto, creada a pocos días) se une, no se duplica.
 * - Sin efectos: no despacha al cerebro, no manda nada a Meta, no avisa por
 *   SSE. Inserta directo en las tablas, con el historial marcado «migracion».
 * - Prueba en seco: con `aplicar: false` hace TODO dentro de una transacción
 *   que se deshace al final, así el informe es exacto.
 */

const FUENTE = "notion";
const DIA = 86_400_000;

const fechaIso = z.string().max(40).nullable().optional();
const notaSchema = z.object({ clave: z.string().max(80), fecha: fechaIso, texto: z.string().min(1).max(8000) });
const tareaSchema = z.object({
  clave: z.string().max(80),
  titulo: z.string().min(1).max(300),
  tipo: z.enum(["llamada", "visita", "mensaje", "reunion", "correo"]),
  estado: z.enum(["realizar", "no_responde"]),
  fecha: fechaIso,
  comentarios: z.string().max(8000).nullable().optional(),
});
const ESTADOS = ["recibido", "en_charlas", "conoce_informacion", "visito", "reservo", "compro", "no_calificado", "perdido"] as const;
const TIPOLOGIAS = ["1_ambiente", "2_ambientes", "3_ambientes", "4_ambientes", "triplex"] as const;
const oportunidadSchema = z.object({
  clave: z.string().max(80),
  nombre: z.string().min(1).max(200),
  estado: z.enum(ESTADOS),
  motivo: z.string().max(120).nullable().optional(),
  origen: z.string().max(80).nullable().optional(),
  tipo: z.enum(["venta", "alquiler", "inmobiliaria"]).nullable().optional(),
  edificios: z.array(z.string().max(120)).max(10).default([]),
  tipologias: z.array(z.enum(TIPOLOGIAS)).max(5).default([]),
  valorUsd: z.number().nonnegative().nullable().optional(),
  leadId: z.string().max(80).nullable().optional(),
  responsable: z.string().max(120).nullable().optional(),
  llegoHasta: z.enum(ESTADOS).nullable().optional(),
  creada: fechaIso,
  editada: fechaIso,
  notas: z.array(notaSchema).max(500).default([]),
  tareas: z.array(tareaSchema).max(200).default([]),
});
const contactoSchema = z.object({
  clave: z.string().max(80),
  alias: z.array(z.string().max(80)).max(50).default([]),
  nombre: z.string().max(200).nullable().optional(),
  telefono: z.string().max(40).nullable().optional(),
  telefonoCrudo: z.string().max(80).nullable().optional(),
  email: z.string().max(254).nullable().optional(),
  tipo: z.enum(["lead", "comprador", "inmobiliaria", "proveedor", "propio"]).nullable().optional(),
  genero: z.enum(["mujer", "hombre"]).nullable().optional(),
  newsletter: z.boolean().default(false),
  dni: z.string().max(40).nullable().optional(),
  cuil: z.string().max(40).nullable().optional(),
  direccion: z.string().max(300).nullable().optional(),
  googleContactId: z.string().max(200).nullable().optional(),
  nacimiento: z.string().max(20).nullable().optional(),
  creado: fechaIso,
  notas: z.array(notaSchema).max(500).default([]),
  oportunidades: z.array(oportunidadSchema).max(200).default([]),
});
const edificioSchema = z.object({
  nombre: z.string().min(1).max(120),
  direccion: z.string().max(300).nullable().optional(),
  estado: z.enum(["en_construccion", "terminado", "en_pozo", "a_construir"]).nullable().optional(),
  enVenta: z.string().max(40).nullable().optional(),
});

export const loteSchema = z.object({
  aplicar: z.boolean(),
  edificios: z.array(edificioSchema).max(100).default([]),
  contactos: z.array(contactoSchema).max(300).default([]),
  oportunidadesSinContacto: z.array(oportunidadSchema).max(300).default([]),
});
export type Lote = z.infer<typeof loteSchema>;
type ContactoIn = z.infer<typeof contactoSchema>;
type OportunidadIn = z.infer<typeof oportunidadSchema>;

export type Informe = {
  contactos: { nuevos: number; unidos: number; yaImportados: number; sinTelefono: number };
  oportunidades: { nuevas: number; yaImportadas: number; unidasPorLead: number; unidasConExistente: number };
  notas: number;
  tareas: number;
  edificiosCreados: string[];
  problemas: string[];
};

export function informeVacio(): Informe {
  return {
    contactos: { nuevos: 0, unidos: 0, yaImportados: 0, sinTelefono: 0 },
    oportunidades: { nuevas: 0, yaImportadas: 0, unidasPorLead: 0, unidasConExistente: 0 },
    notas: 0,
    tareas: 0,
    edificiosCreados: [],
    problemas: [],
  };
}

class Deshacer extends Error {}

/** Para comparar nombres de edificios: sin tildes, mayúsculas, «Av.» ni signos. */
export function planoEdificio(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\b(av|avda|avenida)\b\.?/g, "")
    .replace(/[^a-z0-9]/g, "");
}

const fechaDe = (s: string | null | undefined): Date | null => {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

export async function importarLote(organizationId: string, lote: Lote): Promise<Informe> {
  const informe = informeVacio();
  try {
    await getDb().transaction(async (tx) => {
      const ctx = new Contexto(tx, organizationId, informe);
      await ctx.prepararEdificios(lote.edificios);
      for (const c of lote.contactos) await ctx.contacto(c);
      for (const o of lote.oportunidadesSinContacto) await ctx.oportunidad(o, null, false);
      if (!lote.aplicar) throw new Deshacer();
    });
  } catch (err) {
    if (!(err instanceof Deshacer)) throw err;
  }
  return informe;
}

class Contexto {
  private edificios = new Map<string, string>();
  constructor(
    private tx: Tx,
    private org: string,
    private informe: Informe
  ) {}

  private async yaImportado(clave: string): Promise<string | null> {
    const t = schema.importacionExterna;
    const [f] = await this.tx
      .select({ crmId: t.crmId })
      .from(t)
      .where(and(eq(t.organizationId, this.org), eq(t.fuente, FUENTE), eq(t.clave, clave)))
      .limit(1);
    return f?.crmId ?? null;
  }

  private async recordar(clave: string, tipo: string, crmId: string) {
    await this.tx
      .insert(schema.importacionExterna)
      .values({ organizationId: this.org, fuente: FUENTE, clave, tipo, crmId })
      .onConflictDoNothing();
  }

  async prepararEdificios(lista: z.infer<typeof edificioSchema>[]) {
    const existentes = await this.tx
      .select({ id: schema.edificio.id, nombre: schema.edificio.nombre })
      .from(schema.edificio)
      .where(scoped(schema.edificio.organizationId, this.org));
    for (const e of existentes) this.edificios.set(planoEdificio(e.nombre), e.id);
    for (const e of lista) {
      if (this.edificios.has(planoEdificio(e.nombre))) continue;
      const id = newId("edificio");
      await this.tx.insert(schema.edificio).values({
        id,
        organizationId: this.org,
        nombre: e.nombre,
        direccion: e.direccion ?? null,
        estado: e.estado ?? "terminado",
        enVenta: e.enVenta ?? null,
      });
      this.edificios.set(planoEdificio(e.nombre), id);
      this.informe.edificiosCreados.push(e.nombre);
    }
  }

  private edificio(nombre: string): string | null {
    return this.edificios.get(planoEdificio(nombre)) ?? null;
  }

  async contacto(c: ContactoIn) {
    const claves = [c.clave, ...c.alias];
    let contactId: string | null = null;
    for (const k of claves) contactId ??= await this.yaImportado(k);
    let existia = Boolean(contactId);
    if (contactId) this.informe.contactos.yaImportados++;

    const tel = c.telefono ? normalizarTelefono(c.telefono) : null;
    const telCrudo = !tel?.ok && c.telefonoCrudo ? normalizarTelefono(c.telefonoCrudo) : null;
    const telefono = tel?.ok ? tel.telefono : telCrudo?.ok ? telCrudo.telefono : null;
    if (!telefono && (c.telefono || c.telefonoCrudo)) {
      this.informe.problemas.push(`Teléfono que no se pudo leer: «${c.telefonoCrudo ?? c.telefono}» (${c.nombre ?? c.clave})`);
    }
    const email = c.email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.email) ? c.email.toLowerCase() : null;

    if (!contactId) {
      const ct = schema.contact;
      const cond = telefono
        ? or(eq(ct.waIdentity, telefono), eq(ct.phone, telefono))
        : email
          ? eq(ct.email, email)
          : null;
      if (cond) {
        const [f] = await this.tx.select({ id: ct.id }).from(ct).where(scoped(ct.organizationId, this.org, cond)).limit(1);
        if (f) {
          contactId = f.id;
          existia = true;
          this.informe.contactos.unidos++;
        }
      }
    }

    const nombre = c.nombre?.trim() || (telefono ? `+${telefono}` : email) || "Sin nombre";
    if (!contactId) {
      contactId = newId("contact");
      if (!telefono) this.informe.contactos.sinTelefono++;
      const creado = fechaDe(c.creado) ?? new Date();
      await this.tx.insert(schema.contact).values({
        id: contactId,
        organizationId: this.org,
        channel: "whatsapp",
        // Sin teléfono no hay identidad de WhatsApp: una propia, que nunca recibe mensajes.
        waIdentity: telefono ?? `notion:${c.clave}`,
        phone: telefono,
        name: nombre,
        nameSource: "manual",
        email,
        tipoContacto: c.tipo ?? null,
        // Solo los leads van a la IA (068).
        aiPaused: Boolean(c.tipo && c.tipo !== "lead"),
        createdAt: creado,
        updatedAt: creado,
      });
      this.informe.contactos.nuevos++;
    } else if (existia) {
      // Completa lo vacío, no pisa: el CRM manda.
      const [actual] = await this.tx
        .select({ email: schema.contact.email, tipo: schema.contact.tipoContacto })
        .from(schema.contact)
        .where(eq(schema.contact.id, contactId))
        .limit(1);
      const set: Record<string, unknown> = {};
      if (!actual?.email && email) set.email = email;
      if (!actual?.tipo && c.tipo) set.tipoContacto = c.tipo;
      if (Object.keys(set).length) await this.tx.update(schema.contact).set(set).where(eq(schema.contact.id, contactId));
    }
    for (const k of claves) await this.recordar(k, "contacto", contactId);

    await this.datos(contactId, c);
    for (const n of c.notas) await this.nota(n, contactId, null);
    for (const o of c.oportunidades) await this.oportunidad(o, contactId, existia);
  }

  private async datos(contactId: string, c: ContactoIn) {
    const t = schema.contactoDatos;
    const valores = {
      dni: soloDigitos(c.dni),
      cuil: soloDigitos(c.cuil),
      direccion: c.direccion ?? null,
      genero: c.genero ?? null,
      googleContactId: c.googleContactId ?? null,
      nacimiento: c.nacimiento && /^\d{4}-\d{2}-\d{2}$/.test(c.nacimiento) ? c.nacimiento : null,
    };
    const [actual] = await this.tx.select().from(t).where(eq(t.contactId, contactId)).limit(1);
    if (!actual) {
      if (Object.values(valores).some(Boolean) || c.newsletter) {
        await this.tx.insert(t).values({ contactId, organizationId: this.org, ...valores, newsletter: c.newsletter });
      }
      return;
    }
    const set: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valores)) if (v && !actual[k as keyof typeof actual]) set[k] = v;
    if (c.newsletter && !actual.newsletter) set.newsletter = true;
    if (Object.keys(set).length) await this.tx.update(t).set(set).where(eq(t.contactId, contactId));
  }

  private async nota(n: z.infer<typeof notaSchema>, contactId: string | null, oportunidadId: string | null) {
    if (await this.yaImportado(n.clave)) return;
    const id = newId("conversationNote");
    await this.tx.insert(schema.conversationNote).values({
      id,
      organizationId: this.org,
      contactId,
      oportunidadId,
      texto: n.texto,
      createdAt: fechaDe(n.fecha) ?? new Date(),
    });
    await this.recordar(n.clave, "nota", id);
    this.informe.notas++;
  }

  /** ¿Es la misma oportunidad que ya está en el CRM? Por ID de lead, o mismo contacto creada a ±7 días. */
  private async existente(o: OportunidadIn, contactId: string | null, contactoExistia: boolean): Promise<string | null> {
    if (o.leadId) {
      const l = schema.oportunidadLead;
      const [f] = await this.tx
        .select({ id: l.oportunidadId })
        .from(l)
        .where(and(eq(l.organizationId, this.org), eq(l.leadId, o.leadId)))
        .limit(1);
      if (f) {
        this.informe.oportunidades.unidasPorLead++;
        return f.id;
      }
    }
    const creada = fechaDe(o.creada);
    if (contactId && contactoExistia && creada) {
      const op = schema.oportunidad;
      const ya = await this.tx
        .select({ id: op.id })
        .from(op)
        .where(
          scoped(
            op.organizationId,
            this.org,
            eq(op.contactId, contactId),
            gte(op.createdAt, new Date(creada.getTime() - 7 * DIA)),
            lte(op.createdAt, new Date(creada.getTime() + 7 * DIA)),
            // Que no sea otra importada recién (esas tienen su propia clave).
            sql`not exists (select 1 from importacion_externa ie where ie.organization_id = ${this.org} and ie.crm_id = ${op.id} and ie.fuente = ${FUENTE})`
          )
        )
        .limit(1);
      if (ya[0]) {
        this.informe.oportunidades.unidasConExistente++;
        return ya[0].id;
      }
    }
    return null;
  }

  async oportunidad(o: OportunidadIn, contactId: string | null, contactoExistia: boolean) {
    let id = await this.yaImportado(o.clave);
    if (id) {
      this.informe.oportunidades.yaImportadas++;
    } else {
      id = await this.existente(o, contactId, contactoExistia);
      if (!id) id = await this.crearOportunidad(o, contactId);
      await this.recordar(o.clave, "oportunidad", id);
    }
    for (const n of o.notas) await this.nota(n, contactId, id);
    for (const t of o.tareas) await this.tarea(t, contactId, id);
  }

  private async crearOportunidad(o: OportunidadIn, contactId: string | null): Promise<string> {
    const id = newId("oportunidad");
    const creada = fechaDe(o.creada) ?? new Date();
    const editada = fechaDe(o.editada) ?? creada;
    const cerrada = ["compro", "no_calificado", "perdido"].includes(o.estado);
    const edificioIds = [...new Set(o.edificios.map((n) => this.edificio(n)).filter((x): x is string => Boolean(x)))];
    for (const n of o.edificios) {
      if (!this.edificio(n)) this.informe.problemas.push(`Edificio desconocido «${n}» en «${o.nombre}»`);
    }
    const valorCents = o.valorUsd != null ? Math.round(o.valorUsd * 100) : null;
    await this.tx.insert(schema.oportunidad).values({
      id,
      organizationId: this.org,
      nombre: o.nombre,
      origen: o.origen ?? null,
      contactId,
      edificioId: edificioIds[0] ?? null,
      estado: o.estado,
      tipo: o.tipo ?? null,
      motivoCierre: cerrada ? (o.motivo ?? null) : null,
      valorCents,
      moneda: valorCents == null ? null : "USD",
      ultimaInteraccion: editada,
      estadoDesde: editada,
      cerradaAt: cerrada ? editada : null,
      createdAt: creada,
      updatedAt: editada,
    });
    if (edificioIds.length) {
      await this.tx
        .insert(schema.oportunidadEdificio)
        .values(edificioIds.map((edificioId) => ({ organizationId: this.org, oportunidadId: id, edificioId })))
        .onConflictDoNothing();
    }
    if (o.tipologias.length) {
      await this.tx
        .insert(schema.oportunidadTipologia)
        .values(o.tipologias.map((tipologia) => ({ organizationId: this.org, oportunidadId: id, tipologia })))
        .onConflictDoNothing();
    }
    if (o.leadId) {
      await this.tx
        .insert(schema.oportunidadLead)
        .values({
          id: newId("oportunidadLead"),
          organizationId: this.org,
          oportunidadId: id,
          contactId,
          leadId: o.leadId,
          origen: o.origen ?? "Meta Ads",
          edificioId: edificioIds[0] ?? null,
        })
        .onConflictDoNothing();
    }
    // Historial: creada, hasta dónde llegó (si pasó de Recibido) y el cierre. Sin tiempos (Notion no los guarda).
    const base = {
      organizationId: this.org,
      oportunidadId: id,
      contactId,
      origen: o.origen ?? null,
      edificioId: edificioIds[0] ?? null,
      tipoOportunidad: o.tipo ?? null,
      fuente: "migracion" as const,
      datos: { fuente: "notion", ...(o.responsable ? { responsable: o.responsable } : {}) },
    };
    const eventos: (typeof schema.oportunidadEvento.$inferInsert)[] = [
      { ...base, id: newId("oportunidadEvento"), tipo: "creada", estadoHasta: "recibido", occurredAt: creada },
    ];
    const llego = o.llegoHasta && o.llegoHasta !== "recibido" && o.llegoHasta !== o.estado ? o.llegoHasta : null;
    if (llego) {
      eventos.push({ ...base, id: newId("oportunidadEvento"), tipo: "estado", estadoDesde: "recibido", estadoHasta: llego, occurredAt: creada });
    }
    if (cerrada) {
      eventos.push({
        ...base,
        id: newId("oportunidadEvento"),
        tipo: "cerrada",
        estadoDesde: llego ?? "recibido",
        estadoHasta: o.estado,
        resultado: o.estado === "compro" ? "ganada" : o.estado === "no_calificado" ? "no_calificado" : "perdida",
        motivo: o.motivo ?? null,
        occurredAt: editada,
      });
    } else if (o.estado !== "recibido" && o.estado !== llego) {
      eventos.push({ ...base, id: newId("oportunidadEvento"), tipo: "estado", estadoDesde: llego ?? "recibido", estadoHasta: o.estado, occurredAt: editada });
    }
    await this.tx.insert(schema.oportunidadEvento).values(eventos);
    this.informe.oportunidades.nuevas++;
    return id;
  }

  private async tarea(t: z.infer<typeof tareaSchema>, contactId: string | null, oportunidadId: string) {
    if (await this.yaImportado(t.clave)) return;
    const id = newId("tareaVenta");
    await this.tx.insert(schema.tareaVenta).values({
      id,
      organizationId: this.org,
      titulo: t.titulo,
      tipo: t.tipo,
      estado: t.estado,
      fecha: fechaDe(t.fecha),
      comentarios: t.comentarios ?? null,
      contactId,
      oportunidadId,
    });
    await this.recordar(t.clave, "tarea", id);
    this.informe.tareas++;
  }
}

/** Suma informes de varios lotes. */
export function sumarInformes(a: Informe, b: Informe): Informe {
  return {
    contactos: {
      nuevos: a.contactos.nuevos + b.contactos.nuevos,
      unidos: a.contactos.unidos + b.contactos.unidos,
      yaImportados: a.contactos.yaImportados + b.contactos.yaImportados,
      sinTelefono: a.contactos.sinTelefono + b.contactos.sinTelefono,
    },
    oportunidades: {
      nuevas: a.oportunidades.nuevas + b.oportunidades.nuevas,
      yaImportadas: a.oportunidades.yaImportadas + b.oportunidades.yaImportadas,
      unidasPorLead: a.oportunidades.unidasPorLead + b.oportunidades.unidasPorLead,
      unidasConExistente: a.oportunidades.unidasConExistente + b.oportunidades.unidasConExistente,
    },
    notas: a.notas + b.notas,
    tareas: a.tareas + b.tareas,
    edificiosCreados: [...new Set([...a.edificiosCreados, ...b.edificiosCreados])],
    problemas: [...a.problemas, ...b.problemas],
  };
}

