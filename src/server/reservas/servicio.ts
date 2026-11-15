import { randomBytes } from "node:crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import type { MesaTomada } from "@/lib/db/reservas-tables";
import { scoped } from "@/lib/db/tenant";
import {
  asignar,
  enZona,
  esFecha,
  esHora,
  fechasDeLaAnticipacion,
  formaPara,
  horariosReservables,
  resumenCupo,
  segmentoDe,
  type CupoSector,
  type Segmento,
  type Ocupacion,
} from "@/lib/reservas";
import { normalizarTelefono } from "@/lib/telefono";
import { ESTADOS_ABIERTOS, type EstadoOportunidad } from "@/lib/ventas";
import { registrarCreada, type Actor } from "@/server/oportunidad-historial";

/**
 * 071 — Reservas de restaurante: ajustes, disponibilidad y toma de cupo.
 * La regla de mesas vive pura en `lib/reservas.ts`; acá se juntan los datos
 * y se escribe. Lo usan la vista del día, Ajustes → Reservas y (fase 4) el
 * cerebro del flujo de WhatsApp.
 */

export class ReservaError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

/** Ocupan cupo las Confirmadas (abiertas) y las que Llegó; las cerradas lo liberan. */
export const ESTADOS_QUE_OCUPAN: EstadoOportunidad[] = [...ESTADOS_ABIERTOS, "compro"];

// ─── Ajustes ────────────────────────────────────────────────────────────

export const ajustesSchema = z.object({
  zonaHoraria: z.string().trim().min(3).max(60),
  anticipacionDias: z.number().int().min(0).max(90),
  minutosAntes: z.number().int().min(0).max(24 * 60),
  maxPersonas: z.number().int().min(1).max(100),
  duracionMinutos: z.number().int().min(15).max(12 * 60),
  enlaceCarta: z.string().trim().url().max(500).nullable(),
  direccion: z.string().trim().max(200).nullable(),
  umbralHabitual: z.number().int().min(2).max(100).default(3),
});
export type AjustesReservas = z.infer<typeof ajustesSchema>;

export const horariosSchema = z
  .array(
    z.object({
      diaSemana: z.number().int().min(0).max(6),
      hora: z.string().refine(esHora, "Hora en formato HH:MM"),
      activo: z.boolean().default(true),
    })
  )
  .max(7 * 24);

export const cupoSchema = z
  .array(
    z.object({
      sector: z.string().trim().min(1).max(40),
      capacidad: z.number().int().min(1).max(30),
      cantidad: z.number().int().min(0).max(200),
    })
  )
  .max(60);

export const cierreSchema = z.object({
  fecha: z.string().refine(esFecha, "Fecha en formato AAAA-MM-DD"),
  motivo: z.string().trim().max(120).nullable().optional(),
});

const AJUSTES_POR_DEFECTO: AjustesReservas = {
  zonaHoraria: "America/Argentina/Buenos_Aires",
  anticipacionDias: 7,
  minutosAntes: 20,
  maxPersonas: 6,
  duracionMinutos: 120,
  enlaceCarta: null,
  direccion: null,
  umbralHabitual: 3,
};

export async function leerAjustes(organizationId: string): Promise<AjustesReservas> {
  const [fila] = await getDb()
    .select()
    .from(schema.reservaAjustes)
    .where(eq(schema.reservaAjustes.organizationId, organizationId))
    .limit(1);
  if (!fila) return { ...AJUSTES_POR_DEFECTO };
  return {
    zonaHoraria: fila.zonaHoraria,
    anticipacionDias: fila.anticipacionDias,
    minutosAntes: fila.minutosAntes,
    maxPersonas: fila.maxPersonas,
    duracionMinutos: fila.duracionMinutos,
    enlaceCarta: fila.enlaceCarta,
    direccion: fila.direccion,
    umbralHabitual: fila.umbralHabitual,
  };
}

export async function leerHorarios(organizationId: string) {
  return getDb()
    .select({
      diaSemana: schema.reservaHorario.diaSemana,
      hora: schema.reservaHorario.hora,
      activo: schema.reservaHorario.activo,
    })
    .from(schema.reservaHorario)
    .where(scoped(schema.reservaHorario.organizationId, organizationId))
    .orderBy(asc(schema.reservaHorario.diaSemana), asc(schema.reservaHorario.hora));
}

export async function leerCupo(organizationId: string): Promise<CupoSector[]> {
  return getDb()
    .select({
      sector: schema.reservaCupo.sector,
      capacidad: schema.reservaCupo.capacidad,
      cantidad: schema.reservaCupo.cantidad,
      orden: schema.reservaCupo.orden,
    })
    .from(schema.reservaCupo)
    .where(scoped(schema.reservaCupo.organizationId, organizationId))
    .orderBy(asc(schema.reservaCupo.orden), asc(schema.reservaCupo.capacidad));
}

export async function leerSectores(organizationId: string): Promise<{ id: string; nombre: string }[]> {
  return getDb()
    .select({ id: schema.reservaSector.id, nombre: schema.reservaSector.nombre })
    .from(schema.reservaSector)
    .where(scoped(schema.reservaSector.organizationId, organizationId))
    .orderBy(asc(schema.reservaSector.orden), asc(schema.reservaSector.nombre));
}

export const sectoresSchema = z
  .array(z.object({ id: z.string().min(1).max(40).nullable().optional(), nombre: z.string().trim().min(1).max(40) }))
  .max(20);
export type SectoresInput = z.infer<typeof sectoresSchema>;

/**
 * Guarda la lista entera de sectores en su orden. Un sector con `id` que
 * cambia de nombre lo cambia también en sus mesas y en sus reservas; uno que
 * falta se borra, salvo que todavía tenga mesas cargadas.
 */
export async function guardarSectores(organizationId: string, lista: SectoresInput): Promise<void> {
  const nombres = new Set<string>();
  for (const s of lista) {
    const k = s.nombre.toLocaleLowerCase("es");
    if (nombres.has(k)) throw new ReservaError(422, "sector_repetido", `«${s.nombre}» está repetido`);
    nombres.add(k);
  }
  const actuales = await leerSectores(organizationId);
  const porId = new Map(actuales.map((s) => [s.id, s]));
  const quedan = new Set(lista.map((s) => s.id).filter((id): id is string => !!id && porId.has(id)));
  const cupo = await leerCupo(organizationId);
  for (const s of actuales) {
    if (!quedan.has(s.id) && cupo.some((q) => q.sector === s.nombre && q.cantidad > 0)) {
      throw new ReservaError(
        409,
        "sector_con_mesas",
        `«${s.nombre}» tiene mesas cargadas. Sacalas en Configuración → Reservas antes de borrarlo.`
      );
    }
  }
  await getDb().transaction(async (tx) => {
    const borrados = actuales.filter((s) => !quedan.has(s.id));
    if (borrados.length) {
      await tx.delete(schema.reservaSector).where(
        scoped(schema.reservaSector.organizationId, organizationId, inArray(schema.reservaSector.id, borrados.map((s) => s.id)))
      );
      await tx.delete(schema.reservaCupo).where(
        scoped(schema.reservaCupo.organizationId, organizationId, inArray(schema.reservaCupo.sector, borrados.map((s) => s.nombre)))
      );
    }
    // Primero un nombre provisorio a los que cambian, para poder intercambiar dos nombres.
    const renombrados = lista.filter((s) => s.id && porId.has(s.id) && porId.get(s.id)!.nombre !== s.nombre);
    for (const s of renombrados) {
      await tx.update(schema.reservaSector).set({ nombre: `~${s.id}` }).where(eq(schema.reservaSector.id, s.id!));
    }
    for (const [orden, s] of lista.entries()) {
      const antes = s.id ? porId.get(s.id) : undefined;
      if (!antes) {
        await tx.insert(schema.reservaSector).values({ id: newId("reservaSector"), organizationId, nombre: s.nombre, orden });
        continue;
      }
      await tx.update(schema.reservaSector).set({ nombre: s.nombre, orden }).where(eq(schema.reservaSector.id, antes.id));
      if (antes.nombre !== s.nombre) {
        await tx
          .update(schema.reservaCupo)
          .set({ sector: `~${antes.id}` })
          .where(scoped(schema.reservaCupo.organizationId, organizationId, eq(schema.reservaCupo.sector, antes.nombre)));
        await tx
          .update(schema.reserva)
          .set({ sector: `~${antes.id}` })
          .where(scoped(schema.reserva.organizationId, organizationId, eq(schema.reserva.sector, antes.nombre)));
      }
    }
    for (const s of renombrados) {
      await tx
        .update(schema.reservaCupo)
        .set({ sector: s.nombre })
        .where(scoped(schema.reservaCupo.organizationId, organizationId, eq(schema.reservaCupo.sector, `~${s.id}`)));
      await tx
        .update(schema.reserva)
        .set({ sector: s.nombre })
        .where(scoped(schema.reserva.organizationId, organizationId, eq(schema.reserva.sector, `~${s.id}`)));
    }
    // Las mesas siguen el orden de sus sectores (decide a qué sector va una reserva si empatan).
    for (const [orden, s] of lista.entries()) {
      await tx
        .update(schema.reservaCupo)
        .set({ orden })
        .where(scoped(schema.reservaCupo.organizationId, organizationId, eq(schema.reservaCupo.sector, s.nombre)));
    }
  });
}

export async function leerCierres(organizationId: string) {
  return getDb()
    .select({ fecha: schema.reservaCierre.fecha, motivo: schema.reservaCierre.motivo })
    .from(schema.reservaCierre)
    .where(scoped(schema.reservaCierre.organizationId, organizationId))
    .orderBy(asc(schema.reservaCierre.fecha));
}

/** Todo Ajustes → Reservas en una sola lectura. */
export async function leerConfiguracion(organizationId: string) {
  const [ajustes, horarios, cupo, cierres, sectores] = await Promise.all([
    leerAjustes(organizationId),
    leerHorarios(organizationId),
    leerCupo(organizationId),
    leerCierres(organizationId),
    leerSectores(organizationId),
  ]);
  return { ajustes, horarios, cupo, cierres, sectores: sectores.map((s) => s.nombre) };
}

export const configuracionSchema = z.object({
  ajustes: ajustesSchema,
  horarios: horariosSchema,
  cupo: cupoSchema,
  cierres: z.array(cierreSchema).max(400),
});
export type ConfiguracionReservas = z.infer<typeof configuracionSchema>;

/**
 * Guarda Ajustes → Reservas entero (reemplaza horarios, cupo y cierres).
 * Cambiar el cupo no toca las reservas ya tomadas: si quedan más de las que
 * entran, la vista del día lo muestra con cupo negativo.
 */
export async function guardarConfiguracion(organizationId: string, c: ConfiguracionReservas): Promise<void> {
  try {
    new Intl.DateTimeFormat("es-AR", { timeZone: c.ajustes.zonaHoraria });
  } catch {
    throw new ReservaError(422, "zona_invalida", `«${c.ajustes.zonaHoraria}» no es una zona horaria`);
  }
  const vistos = new Set<string>();
  for (const h of c.horarios) {
    const k = `${h.diaSemana} ${h.hora}`;
    if (vistos.has(k)) throw new ReservaError(422, "horario_repetido", `El horario ${h.hora} está repetido`);
    vistos.add(k);
  }
  const lista = (await leerSectores(organizationId)).map((s) => s.nombre);
  for (const q of c.cupo) {
    if (!lista.includes(q.sector)) {
      throw new ReservaError(422, "sector", `«${q.sector}» no es un sector. Se crean en Configuración → Sectores.`);
    }
  }
  const sectores = new Set<string>();
  for (const q of c.cupo) {
    const k = `${q.sector.toLowerCase()} ${q.capacidad}`;
    if (sectores.has(k)) {
      throw new ReservaError(422, "cupo_repetido", `Las mesas de ${q.capacidad} de «${q.sector}» están repetidas`);
    }
    sectores.add(k);
  }
  const ordenSector = new Map(lista.map((nombre, i) => [nombre, i]));

  await getDb().transaction(async (tx) => {
    await tx
      .insert(schema.reservaAjustes)
      .values({ organizationId, ...c.ajustes })
      .onConflictDoUpdate({
        target: schema.reservaAjustes.organizationId,
        set: { ...c.ajustes, updatedAt: new Date() },
      });
    await tx.delete(schema.reservaHorario).where(eq(schema.reservaHorario.organizationId, organizationId));
    if (c.horarios.length) {
      await tx.insert(schema.reservaHorario).values(
        c.horarios.map((h) => ({ id: newId("reservaHorario"), organizationId, ...h }))
      );
    }
    await tx.delete(schema.reservaCupo).where(eq(schema.reservaCupo.organizationId, organizationId));
    if (c.cupo.length) {
      await tx.insert(schema.reservaCupo).values(
        c.cupo.map((q) => ({
          id: newId("reservaCupo"),
          organizationId,
          ...q,
          orden: ordenSector.get(q.sector) ?? 0,
        }))
      );
    }
    await tx.delete(schema.reservaCierre).where(eq(schema.reservaCierre.organizationId, organizationId));
    const fechas = [...new Map(c.cierres.map((x) => [x.fecha, x])).values()];
    if (fechas.length) {
      await tx.insert(schema.reservaCierre).values(
        fechas.map((x) => ({ id: newId("reservaCierre"), organizationId, fecha: x.fecha, motivo: x.motivo ?? null }))
      );
    }
  });
}

// ─── Ocupación y disponibilidad ──────────────────────────────────────────

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

async function ocupadasEn(
  db: Db | Tx,
  organizationId: string,
  fecha: string,
  horas?: readonly string[],
  excepto?: string
): Promise<(Ocupacion & { hora: string })[]> {
  const filas = await db
    .select({
      id: schema.reserva.id,
      hora: schema.reserva.hora,
      sector: schema.reserva.sector,
      mesas: schema.reserva.mesas,
    })
    .from(schema.reserva)
    .innerJoin(schema.oportunidad, eq(schema.oportunidad.id, schema.reserva.oportunidadId))
    .where(
      scoped(
        schema.reserva.organizationId,
        organizationId,
        and(
          eq(schema.reserva.fecha, fecha),
          inArray(schema.oportunidad.estado, ESTADOS_QUE_OCUPAN),
          horas?.length ? inArray(schema.reserva.hora, [...horas]) : undefined
        )
      )
    );
  return filas.filter((f) => f.id !== excepto);
}

function porHora(ocupadas: readonly (Ocupacion & { hora: string })[], hora: string): Ocupacion[] {
  return ocupadas.filter((o) => o.hora === hora);
}

export type HorarioDisponible = { hora: string; hayLugar: boolean };

/** Los horarios reservables de una fecha y si entra una reserva de `personas`. */
export async function disponibilidad(
  organizationId: string,
  input: { fecha: string; personas: number; ahora?: Date }
): Promise<{ derivar: boolean; horarios: HorarioDisponible[] }> {
  const { ajustes, horarios, cupo, cierres } = await leerConfiguracion(organizationId);
  if (input.personas > ajustes.maxPersonas || !formaPara(cupo, input.personas)) {
    return { derivar: true, horarios: [] };
  }
  const reservables = horariosReservables({
    fecha: input.fecha,
    horarios,
    cierres: cierres.map((c) => c.fecha),
    ahora: input.ahora ?? new Date(),
    zona: ajustes.zonaHoraria,
    anticipacionDias: ajustes.anticipacionDias,
    minutosAntes: ajustes.minutosAntes,
  });
  if (!reservables.length) return { derivar: false, horarios: [] };
  const ocupadas = await ocupadasEn(getDb(), organizationId, input.fecha, reservables);
  return {
    derivar: false,
    horarios: reservables.map((hora) => ({
      hora,
      hayLugar: asignar(cupo, porHora(ocupadas, hora), input.personas) !== null,
    })),
  };
}

/** Los días de la anticipación con al menos un horario libre para `personas`. */
export async function diasConLugar(
  organizationId: string,
  input: { personas: number; ahora?: Date }
): Promise<{ derivar: boolean; dias: { fecha: string; horarios: string[] }[] }> {
  const ajustes = await leerAjustes(organizationId);
  const ahora = input.ahora ?? new Date();
  const dias: { fecha: string; horarios: string[] }[] = [];
  for (const fecha of fechasDeLaAnticipacion(ahora, ajustes.zonaHoraria, ajustes.anticipacionDias)) {
    const d = await disponibilidad(organizationId, { fecha, personas: input.personas, ahora });
    if (d.derivar) return { derivar: true, dias: [] };
    const libres = d.horarios.filter((h) => h.hayLugar).map((h) => h.hora);
    if (libres.length) dias.push({ fecha, horarios: libres });
  }
  return { derivar: false, dias };
}

// ─── Tomar cupo ─────────────────────────────────────────────────────────

export type ReservaCreada = {
  id: string;
  oportunidadId: string;
  contactId: string;
  fecha: string;
  hora: string;
  personas: number;
  nombre: string;
  sector: string;
  mesas: MesaTomada[];
  tokenCalendario: string;
};

/**
 * Toma el cupo y crea la reserva (y su oportunidad, Confirmada) en una sola
 * transacción. Un bloqueo por fecha y horario hace que dos pedidos a la vez
 * por la última mesa no entren los dos: el segundo ve la ocupación del
 * primero y recibe 409 `sin_lugar`.
 */
export async function tomarCupo(
  organizationId: string,
  input: {
    contactId: string;
    fecha: string;
    hora: string;
    personas: number;
    nombre: string;
    canal: "whatsapp" | "manual" | "telefono";
    observaciones?: string | null;
    actor: Actor;
    /** Una persona del equipo puede cargar una reserva fuera de los horarios reservables. */
    forzarHorario?: boolean;
    /** El equipo eligió el sector (tocó una mesa libre del mosaico): solo se busca ahí. */
    sector?: string | null;
    ahora?: Date;
  }
): Promise<ReservaCreada> {
  if (!esFecha(input.fecha) || !esHora(input.hora)) {
    throw new ReservaError(422, "invalid_body", "Fecha u hora inválida");
  }
  const { ajustes, horarios, cupo, cierres } = await leerConfiguracion(organizationId);
  if (!input.forzarHorario) {
    if (input.personas > ajustes.maxPersonas) {
      throw new ReservaError(409, "derivar", `Más de ${ajustes.maxPersonas} personas lo atiende una persona`);
    }
    const reservables = horariosReservables({
      fecha: input.fecha,
      horarios,
      cierres: cierres.map((c) => c.fecha),
      ahora: input.ahora ?? new Date(),
      zona: ajustes.zonaHoraria,
      anticipacionDias: ajustes.anticipacionDias,
      minutosAntes: ajustes.minutosAntes,
    });
    if (!reservables.includes(input.hora)) {
      throw new ReservaError(409, "fuera_de_horario", "Ese horario no se puede reservar");
    }
  }
  const [contacto] = await getDb()
    .select({ id: schema.contact.id })
    .from(schema.contact)
    .where(scoped(schema.contact.organizationId, organizationId, eq(schema.contact.id, input.contactId)))
    .limit(1);
  if (!contacto) throw new ReservaError(404, "not_found", "Ese contacto no existe");

  const creada = await getDb().transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`reserva:${organizationId}:${input.fecha}:${input.hora}`}))`
    );
    const ocupadas = await ocupadasEn(tx, organizationId, input.fecha, [input.hora]);
    const enSector = input.sector ? cupo.filter((c) => c.sector === input.sector) : cupo;
    if (input.sector && !enSector.length) throw new ReservaError(422, "sector", `«${input.sector}» no es un sector`);
    const asignada = asignar(enSector, ocupadas, input.personas);
    if (!asignada) {
      throw new ReservaError(
        409,
        "sin_lugar",
        input.sector ? `No queda lugar en «${input.sector}» en ese horario` : "No queda lugar en ese horario"
      );
    }

    const [op] = await tx
      .insert(schema.oportunidad)
      .values({
        id: newId("oportunidad"),
        organizationId,
        nombre: input.nombre,
        contactId: input.contactId,
        estado: "recibido",
      })
      .returning();
    const [res] = await tx
      .insert(schema.reserva)
      .values({
        id: newId("reserva"),
        organizationId,
        oportunidadId: op!.id,
        contactId: input.contactId,
        fecha: input.fecha,
        hora: input.hora,
        personas: input.personas,
        nombre: input.nombre,
        sector: asignada.sector,
        mesas: asignada.mesas,
        tokenCalendario: randomBytes(18).toString("base64url"),
        canal: input.canal,
        observaciones: input.observaciones ?? null,
      })
      .returning();
    return { op: op!, res: res! };
  });

  await registrarCreada(organizationId, creada.op, input.actor, {
    reserva: { fecha: input.fecha, hora: input.hora, personas: input.personas, canal: input.canal },
  });
  const r = creada.res;
  return {
    id: r.id,
    oportunidadId: r.oportunidadId,
    contactId: r.contactId,
    fecha: r.fecha,
    hora: r.hora,
    personas: r.personas,
    nombre: r.nombre,
    sector: r.sector,
    mesas: r.mesas,
    tokenCalendario: r.tokenCalendario,
  };
}

/**
 * El contacto de una reserva cargada a mano: el que ya tiene ese teléfono o
 * uno nuevo. Sin teléfono (alguien que se acercó al local), uno nuevo sin
 * WhatsApp.
 */
export async function contactoParaReserva(
  organizationId: string,
  input: { nombre: string; telefono?: string | null }
): Promise<string> {
  const db = getDb();
  if (input.telefono) {
    const n = normalizarTelefono(input.telefono);
    if (!n.ok) throw new ReservaError(422, "telefono_invalido", "Ese teléfono no parece válido");
    const [existente] = await db
      .select({ id: schema.contact.id })
      .from(schema.contact)
      .where(scoped(schema.contact.organizationId, organizationId, eq(schema.contact.waIdentity, n.telefono)))
      .limit(1);
    if (existente) return existente.id;
    const [nuevo] = await db
      .insert(schema.contact)
      .values({
        id: newId("contact"),
        organizationId,
        name: input.nombre,
        phone: n.telefono,
        waIdentity: n.telefono,
        source: "otro",
      })
      .onConflictDoNothing()
      .returning({ id: schema.contact.id });
    if (nuevo) return nuevo.id;
    const [ganador] = await db
      .select({ id: schema.contact.id })
      .from(schema.contact)
      .where(scoped(schema.contact.organizationId, organizationId, eq(schema.contact.waIdentity, n.telefono)))
      .limit(1);
    if (ganador) return ganador.id;
    throw new ReservaError(409, "contacto", "No se pudo crear el contacto");
  }
  const [nuevo] = await db
    .insert(schema.contact)
    .values({
      id: newId("contact"),
      organizationId,
      name: input.nombre,
      waIdentity: `reserva:${newId("reserva")}`,
      source: "otro",
    })
    .returning({ id: schema.contact.id });
  return nuevo!.id;
}

/** Mueve una reserva a otro sector, si ahí entran sus mesas. */
export async function cambiarSector(organizationId: string, reservaId: string, sector: string): Promise<void> {
  const [r] = await getDb()
    .select()
    .from(schema.reserva)
    .where(scoped(schema.reserva.organizationId, organizationId, eq(schema.reserva.id, reservaId)))
    .limit(1);
  if (!r) throw new ReservaError(404, "not_found", "Esa reserva no existe");
  if (r.sector === sector) return;
  const cupo = await leerCupo(organizationId);
  await getDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`reserva:${organizationId}:${r.fecha}:${r.hora}`}))`);
    const ocupadas = await ocupadasEn(tx, organizationId, r.fecha, [r.hora], r.id);
    const delSector = cupo.filter((c) => c.sector === sector);
    if (!delSector.length) throw new ReservaError(422, "sector", `«${sector}» no es un sector`);
    const libresAhi = resumenCupo(
      delSector,
      ocupadas.filter((o) => o.sector === sector)
    );
    for (const m of r.mesas) {
      const tipo = libresAhi.find((x) => x.capacidad === m.capacidad);
      if (!tipo || tipo.libres <= 0) {
        throw new ReservaError(409, "sin_lugar", `En «${sector}» no quedan mesas de ${m.capacidad}`);
      }
      tipo.libres--;
    }
    await tx
      .update(schema.reserva)
      .set({ sector, updatedAt: new Date() })
      .where(eq(schema.reserva.id, r.id));
  });
}

// ─── La vista del día ───────────────────────────────────────────────────

export type ReservaDelDia = {
  id: string;
  oportunidadId: string;
  contactId: string;
  nombre: string;
  contactoNombre: string;
  telefono: string | null;
  personas: number;
  sector: string;
  mesas: MesaTomada[];
  estado: string;
  canal: string;
  observaciones: string | null;
  /** Las notas de la persona (las del contacto): aparecen en cada reserva. */
  notas: string | null;
  /** Cómo viene la persona, sin contar esta reserva: para recibirla y para confirmar. */
  persona: { segmento: Segmento; visitasAntes: number; noVinoAntes: number };
};

export type HorarioDelDia = {
  hora: string;
  /** false: hay reservas en un horario que ya no está en Ajustes. */
  configurado: boolean;
  cupo: { capacidad: number; libres: number; total: number }[];
  personas: number;
  reservas: ReservaDelDia[];
};

export async function reservasDelDia(
  organizationId: string,
  fecha: string
): Promise<{
  fecha: string;
  hoy: string;
  /** La hora ahora en la zona del negocio ("HH:MM"), para abrir el mosaico en el horario que viene. */
  ahora: string;
  duracionMinutos: number;
  cerrado: string | null;
  sectores: string[];
  /** Las mesas de cada sector, para dibujar el salón. */
  mesas: { sector: string; capacidad: number; cantidad: number }[];
  horarios: HorarioDelDia[];
}> {
  if (!esFecha(fecha)) throw new ReservaError(422, "invalid_body", "Fecha inválida");
  const { ajustes, horarios, cupo, cierres, sectores } = await leerConfiguracion(organizationId);
  const filas = await getDb()
    .select({
      r: schema.reserva,
      estado: schema.oportunidad.estado,
      contactoNombre: schema.contact.name,
      telefono: schema.contact.phone,
      notas: schema.contact.notes,
    })
    .from(schema.reserva)
    .innerJoin(schema.oportunidad, eq(schema.oportunidad.id, schema.reserva.oportunidadId))
    .innerJoin(schema.contact, eq(schema.contact.id, schema.reserva.contactId))
    .where(scoped(schema.reserva.organizationId, organizationId, eq(schema.reserva.fecha, fecha)))
    .orderBy(asc(schema.reserva.hora), asc(schema.reserva.createdAt));

  // Lo que se sabe de cada persona por sus otras reservas.
  const { comensales } = await import("./comensales");
  const personas = await comensales(organizationId, [...new Set(filas.map((f) => f.r.contactId))]);
  const personaDe = (f: (typeof filas)[number]) => {
    const c = personas.porContacto[f.r.contactId];
    const visitasAntes = Math.max(0, (c?.visitas ?? 0) - (f.estado === "compro" ? 1 : 0));
    return {
      segmento: segmentoDe(visitasAntes, personas.umbral),
      visitasAntes,
      noVinoAntes: Math.max(0, (c?.noVino ?? 0) - (f.estado === "no_calificado" ? 1 : 0)),
    };
  };

  const delDia = new Set(
    horarios.filter((h) => h.activo && h.diaSemana === new Date(`${fecha}T00:00:00Z`).getUTCDay()).map((h) => h.hora)
  );
  const horas = [...new Set([...delDia, ...filas.map((f) => f.r.hora)])].sort();
  return {
    fecha,
    hoy: enZona(new Date(), ajustes.zonaHoraria).fecha,
    cerrado: cierres.find((c) => c.fecha === fecha)?.motivo ?? (cierres.some((c) => c.fecha === fecha) ? "Cerrado" : null),
    ahora: (() => {
      const m = enZona(new Date(), ajustes.zonaHoraria).minutos;
      return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    })(),
    duracionMinutos: ajustes.duracionMinutos,
    sectores: sectores.filter((s) => cupo.some((c) => c.sector === s)),
    mesas: cupo.map((c) => ({ sector: c.sector, capacidad: c.capacidad, cantidad: c.cantidad })),
    horarios: horas.map((hora) => {
      const deEsta = filas.filter((f) => f.r.hora === hora);
      const ocupan = deEsta.filter((f) => ESTADOS_QUE_OCUPAN.includes(f.estado as EstadoOportunidad));
      return {
        hora,
        configurado: delDia.has(hora),
        cupo: resumenCupo(
          cupo,
          ocupan.map((f) => ({ sector: f.r.sector, mesas: f.r.mesas }))
        ),
        personas: ocupan.reduce((a, f) => a + f.r.personas, 0),
        reservas: deEsta.map((f) => ({
          id: f.r.id,
          oportunidadId: f.r.oportunidadId,
          contactId: f.r.contactId,
          nombre: f.r.nombre,
          contactoNombre: f.contactoNombre,
          telefono: f.telefono,
          personas: f.r.personas,
          sector: f.r.sector,
          mesas: f.r.mesas,
          estado: f.estado,
          canal: f.r.canal,
          observaciones: f.r.observaciones,
          notas: f.notas?.trim() || null,
          persona: personaDe(f),
        })),
      };
    }),
  };
}

/** La reserva de una oportunidad (para mostrarla en su página). */
export async function reservaDeOportunidad(organizationId: string, oportunidadId: string) {
  const [r] = await getDb()
    .select()
    .from(schema.reserva)
    .where(scoped(schema.reserva.organizationId, organizationId, eq(schema.reserva.oportunidadId, oportunidadId)))
    .limit(1);
  return r ?? null;
}
