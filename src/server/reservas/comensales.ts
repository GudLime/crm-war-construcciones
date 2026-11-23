import { desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { COMENSAL_VACIO, enZona, segmentoDe, type Comensal } from "@/lib/reservas";
import { ESTADOS_ABIERTOS } from "@/lib/ventas";
import { ReservaError, leerAjustes } from "./servicio";

/**
 * 071 — Las personas de un restaurante: lo que se cuenta de sus reservas
 * (visitas, no vino, última visita, la próxima) y su segmento, más lo único
 * que se guarda aparte, si acepta promociones. Nada de esto se copia en el
 * contacto: se calcula cada vez, así nunca queda desactualizado.
 */

export type Comensales = { umbral: number; hoy: string; porContacto: Record<string, Comensal> };

export async function comensales(organizationId: string, contactIds?: string[]): Promise<Comensales> {
  const ajustes = await leerAjustes(organizationId);
  const hoy = enZona(new Date(), ajustes.zonaHoraria).fecha;
  if (contactIds && contactIds.length === 0) return { umbral: ajustes.umbralHabitual, hoy, porContacto: {} };
  const db = getDb();
  const abiertos = sql.join(
    ESTADOS_ABIERTOS.map((e) => sql`${e}`),
    sql`, `
  );
  const filtro = contactIds ? inArray(schema.reserva.contactId, contactIds) : undefined;
  const filas = await db
    .select({
      contactId: schema.reserva.contactId,
      reservas: sql<number>`count(*)::int`,
      visitas: sql<number>`(count(*) filter (where ${schema.oportunidad.estado} = 'compro'))::int`,
      noVino: sql<number>`(count(*) filter (where ${schema.oportunidad.estado} = 'no_calificado'))::int`,
      canceladas: sql<number>`(count(*) filter (where ${schema.oportunidad.estado} = 'perdido'))::int`,
      primeraVisita: sql<string | null>`(min(${schema.reserva.fecha}) filter (where ${schema.oportunidad.estado} = 'compro'))::text`,
      ultimaVisita: sql<string | null>`(max(${schema.reserva.fecha}) filter (where ${schema.oportunidad.estado} = 'compro'))::text`,
      proxima: sql<string | null>`min(${schema.reserva.fecha}::text || ' ' || ${schema.reserva.hora}) filter (where ${schema.oportunidad.estado} in (${abiertos}) and ${schema.reserva.fecha} >= ${hoy})`,
    })
    .from(schema.reserva)
    .innerJoin(schema.oportunidad, eq(schema.oportunidad.id, schema.reserva.oportunidadId))
    .where(scoped(schema.reserva.organizationId, organizationId, filtro))
    .groupBy(schema.reserva.contactId);
  const promos = await db
    .select({ contactId: schema.reservaComensal.contactId, acepta: schema.reservaComensal.aceptaPromociones })
    .from(schema.reservaComensal)
    .where(
      scoped(
        schema.reservaComensal.organizationId,
        organizationId,
        contactIds ? inArray(schema.reservaComensal.contactId, contactIds) : undefined
      )
    );
  const acepta = new Map(promos.map((p) => [p.contactId, p.acepta]));
  const porContacto: Record<string, Comensal> = {};
  for (const f of filas) {
    const [fecha, hora] = f.proxima?.split(" ") ?? [];
    porContacto[f.contactId] = {
      visitas: f.visitas,
      reservas: f.reservas,
      noVino: f.noVino,
      canceladas: f.canceladas,
      primeraVisita: f.primeraVisita,
      ultimaVisita: f.ultimaVisita,
      proxima: fecha && hora ? { fecha, hora } : null,
      segmento: segmentoDe(f.visitas, ajustes.umbralHabitual),
      aceptaPromociones: acepta.get(f.contactId) ?? false,
    };
  }
  for (const [contactId, a] of acepta) {
    porContacto[contactId] ??= { ...COMENSAL_VACIO, segmento: "nuevo", aceptaPromociones: a };
  }
  return { umbral: ajustes.umbralHabitual, hoy, porContacto };
}

export async function comensal(organizationId: string, contactId: string): Promise<Comensal> {
  const r = await comensales(organizationId, [contactId]);
  return r.porContacto[contactId] ?? { ...COMENSAL_VACIO, segmento: "nuevo" };
}

/** Las reservas de una persona, de la más nueva a la más vieja. */
export async function historialDe(organizationId: string, contactId: string) {
  return getDb()
    .select({
      id: schema.reserva.id,
      oportunidadId: schema.reserva.oportunidadId,
      fecha: schema.reserva.fecha,
      hora: schema.reserva.hora,
      personas: schema.reserva.personas,
      sector: schema.reserva.sector,
      observaciones: schema.reserva.observaciones,
      estado: schema.oportunidad.estado,
    })
    .from(schema.reserva)
    .innerJoin(schema.oportunidad, eq(schema.oportunidad.id, schema.reserva.oportunidadId))
    .where(scoped(schema.reserva.organizationId, organizationId, eq(schema.reserva.contactId, contactId)))
    .orderBy(desc(schema.reserva.fecha), desc(schema.reserva.hora))
    .limit(200);
}

/** Marca si la persona acepta recibir promociones (y desde cuándo). */
export async function guardarAceptaPromociones(
  organizationId: string,
  contactId: string,
  acepta: boolean
): Promise<void> {
  const [c] = await getDb()
    .select({ id: schema.contact.id })
    .from(schema.contact)
    .where(scoped(schema.contact.organizationId, organizationId, eq(schema.contact.id, contactId)))
    .limit(1);
  if (!c) throw new ReservaError(404, "not_found", "Ese contacto no existe");
  const ahora = new Date();
  await getDb()
    .insert(schema.reservaComensal)
    .values({ organizationId, contactId, aceptaPromociones: acepta, aceptaPromocionesAt: acepta ? ahora : null })
    .onConflictDoUpdate({
      target: [schema.reservaComensal.organizationId, schema.reservaComensal.contactId],
      set: { aceptaPromociones: acepta, aceptaPromocionesAt: acepta ? ahora : null, updatedAt: ahora },
    });
}
