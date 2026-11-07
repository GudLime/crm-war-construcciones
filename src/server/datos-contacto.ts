import { and, eq, inArray, or } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { soloDigitos, type DatosContactoDto, type ParienteDto } from "@/lib/datos-contacto";

/** War — Datos personales del contacto y sus parientes. */

export class DatosContactoError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? undefined : v || null));

export const datosSchema = z.object({
  dni: textoOpcional(20).refine((v) => !v || /^\d{6,9}$/.test(soloDigitos(v) ?? ""), "El DNI son 6 a 9 números"),
  cuil: textoOpcional(20).refine((v) => !v || (soloDigitos(v) ?? "").length === 11, "El CUIL/CUIT son 11 números"),
  nacimiento: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha no válida")
    .nullable()
    .optional(),
  direccion: textoOpcional(300),
  genero: z.enum(["mujer", "hombre"]).nullable().optional(),
  newsletter: z.boolean().optional(),
  googleContactId: textoOpcional(200),
});

export const parienteSchema = z.object({
  contactId: z.string().min(1).max(40),
  relacion: z.string().trim().max(60).nullable().optional(),
});

async function exigirContacto(organizationId: string, contactId: string) {
  const [c] = await getDb()
    .select({ id: schema.contact.id })
    .from(schema.contact)
    .where(scoped(schema.contact.organizationId, organizationId, eq(schema.contact.id, contactId)))
    .limit(1);
  if (!c) throw new DatosContactoError(404, "not_found", "Contacto no encontrado");
}

export async function leerDatosContacto(organizationId: string, contactId: string): Promise<DatosContactoDto> {
  await exigirContacto(organizationId, contactId);
  const db = getDb();
  const [d] = await db
    .select()
    .from(schema.contactoDatos)
    .where(scoped(schema.contactoDatos.organizationId, organizationId, eq(schema.contactoDatos.contactId, contactId)))
    .limit(1);
  return {
    dni: d?.dni ?? null,
    cuil: d?.cuil ?? null,
    nacimiento: d?.nacimiento ?? null,
    direccion: d?.direccion ?? null,
    genero: d?.genero ?? null,
    newsletter: d?.newsletter ?? false,
    googleContactId: d?.googleContactId ?? null,
    parientes: await parientesDe(organizationId, contactId),
  };
}

async function parientesDe(organizationId: string, contactId: string): Promise<ParienteDto[]> {
  const db = getDb();
  const p = schema.contactoPariente;
  const vinculos = await db
    .select()
    .from(p)
    .where(scoped(p.organizationId, organizationId, or(eq(p.contactA, contactId), eq(p.contactB, contactId))));
  if (!vinculos.length) return [];
  const otros = vinculos.map((v) => (v.contactA === contactId ? v.contactB : v.contactA));
  const contactos = await db
    .select({ id: schema.contact.id, nombre: schema.contact.name, telefono: schema.contact.phone })
    .from(schema.contact)
    .where(scoped(schema.contact.organizationId, organizationId, inArray(schema.contact.id, otros)));
  const porId = new Map(contactos.map((c) => [c.id, c]));
  return vinculos
    .map((v) => {
      const otro = v.contactA === contactId ? v.contactB : v.contactA;
      const c = porId.get(otro);
      return c ? { contactId: otro, nombre: c.nombre, telefono: c.telefono, relacion: v.relacion } : null;
    })
    .filter((x): x is ParienteDto => Boolean(x))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/**
 * Guarda los datos (solo las claves que vienen). `soloVacios`: la importación
 * de Notion completa lo que falta sin pisar lo que alguien ya cargó.
 */
export async function guardarDatosContacto(
  organizationId: string,
  contactId: string,
  datos: z.infer<typeof datosSchema>,
  opciones: { soloVacios?: boolean } = {}
): Promise<void> {
  await exigirContacto(organizationId, contactId);
  const limpio = {
    ...(datos.dni !== undefined ? { dni: soloDigitos(datos.dni) } : {}),
    ...(datos.cuil !== undefined ? { cuil: soloDigitos(datos.cuil) } : {}),
    ...(datos.nacimiento !== undefined ? { nacimiento: datos.nacimiento } : {}),
    ...(datos.direccion !== undefined ? { direccion: datos.direccion } : {}),
    ...(datos.genero !== undefined ? { genero: datos.genero } : {}),
    ...(datos.newsletter !== undefined ? { newsletter: datos.newsletter } : {}),
    ...(datos.googleContactId !== undefined ? { googleContactId: datos.googleContactId } : {}),
  };
  const db = getDb();
  const t = schema.contactoDatos;
  const [actual] = await db.select().from(t).where(eq(t.contactId, contactId)).limit(1);
  if (!actual) {
    await db.insert(t).values({ contactId, organizationId, ...limpio }).onConflictDoNothing();
    return;
  }
  const set: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(limpio)) {
    const previo = actual[k as keyof typeof actual];
    if (opciones.soloVacios && previo !== null && previo !== undefined && previo !== "" && previo !== false) continue;
    set[k] = v;
  }
  if (!Object.keys(set).length) return;
  await db
    .update(t)
    .set({ ...set, updatedAt: new Date() })
    .where(and(eq(t.contactId, contactId), eq(t.organizationId, organizationId)));
}

export async function agregarPariente(
  organizationId: string,
  contactId: string,
  otroId: string,
  relacion: string | null = null
): Promise<void> {
  if (contactId === otroId) throw new DatosContactoError(422, "invalid_body", "Un contacto no puede ser su propio pariente");
  await exigirContacto(organizationId, contactId);
  await exigirContacto(organizationId, otroId);
  const [a, b] = contactId < otroId ? [contactId, otroId] : [otroId, contactId];
  await getDb()
    .insert(schema.contactoPariente)
    .values({ organizationId, contactA: a, contactB: b, relacion: relacion || null })
    .onConflictDoUpdate({
      target: [schema.contactoPariente.contactA, schema.contactoPariente.contactB],
      set: { relacion: relacion || null },
    });
}

export async function quitarPariente(organizationId: string, contactId: string, otroId: string): Promise<void> {
  const [a, b] = contactId < otroId ? [contactId, otroId] : [otroId, contactId];
  const p = schema.contactoPariente;
  await getDb().delete(p).where(scoped(p.organizationId, organizationId, eq(p.contactA, a), eq(p.contactB, b)));
}
