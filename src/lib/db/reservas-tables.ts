import { boolean, date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { contact, organization } from "./schema";
import { oportunidad } from "./ventas-tables";

/**
 * 071 — Reservas de restaurante (detrás de la bandera `RESERVAS`).
 *
 * La reserva ES una oportunidad (con otro nombre por el vocabulario del
 * cliente): esta tabla le agrega lo propio de una reserva —fecha, horario,
 * personas, el sector y las mesas que ocupa—. Como en la agenda, la
 * migración se aplica siempre: sin la bandera las tablas quedan vacías.
 */

/** Una mesa ocupada: su capacidad. Las de un mismo sector se juntan para 5 o 6. */
export type MesaTomada = { capacidad: number };

/** Los ajustes de reservas del negocio: una fila por organización. */
export const reservaAjustes = pgTable("reserva_ajustes", {
  organizationId: text("organization_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  /** Zona del negocio: «hoy», «mañana» y «20 minutos antes» se cuentan acá. */
  zonaHoraria: text("zona_horaria").notNull().default("America/Argentina/Buenos_Aires"),
  /** Hasta cuántos días adelante se puede reservar (hoy cuenta como el día 0). */
  anticipacionDias: integer("anticipacion_dias").notNull().default(7),
  /** Hasta cuántos minutos antes del horario se reserva por WhatsApp. */
  minutosAntes: integer("minutos_antes").notNull().default(20),
  /** Más personas que esto: lo atiende una persona (el flujo deriva). */
  maxPersonas: integer("max_personas").notNull().default(6),
  /** Cuánto dura una reserva en el calendario de quien reserva. */
  duracionMinutos: integer("duracion_minutos").notNull().default(120),
  enlaceCarta: text("enlace_carta"),
  direccion: text("direccion"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/** Un horario de reserva: día de la semana (0 = domingo) y hora «HH:MM». */
export const reservaHorario = pgTable(
  "reserva_horario",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    diaSemana: integer("dia_semana").notNull(),
    hora: text("hora").notNull(),
    activo: boolean("activo").notNull().default(true),
  },
  (t) => [uniqueIndex("reserva_horario_unico").on(t.organizationId, t.diaSemana, t.hora)]
);

/**
 * El cupo de cada horario: cuántas mesas de cada capacidad hay en cada
 * sector. Vale igual para todos los horarios (cada horario arranca con
 * todas las mesas libres).
 */
/**
 * Un sector del local (Salón, Semidescubierto). Las mesas y las reservas lo
 * nombran por su nombre; cambiarle el nombre lo cambia en las dos.
 */
export const reservaSector = pgTable(
  "reserva_sector",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    nombre: text("nombre").notNull(),
    orden: integer("orden").notNull().default(0),
  },
  (t) => [uniqueIndex("reserva_sector_unico").on(t.organizationId, t.nombre)]
);

export const reservaCupo = pgTable(
  "reserva_cupo",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    sector: text("sector").notNull(),
    capacidad: integer("capacidad").notNull(),
    cantidad: integer("cantidad").notNull(),
    orden: integer("orden").notNull().default(0),
  },
  (t) => [uniqueIndex("reserva_cupo_unico").on(t.organizationId, t.sector, t.capacidad)]
);

/** Un día sin reservas (feriado, evento privado). */
export const reservaCierre = pgTable(
  "reserva_cierre",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    fecha: date("fecha").notNull(),
    motivo: text("motivo"),
  },
  (t) => [uniqueIndex("reserva_cierre_unico").on(t.organizationId, t.fecha)]
);

/**
 * La reserva: 1 a 1 con su oportunidad. Ocupa cupo mientras la oportunidad
 * esté Confirmada (`recibido`) o Llegó (`compro`); cancelada o no vino, lo
 * libera (la ocupación se calcula, no se guarda).
 */
export const reserva = pgTable(
  "reserva",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    oportunidadId: text("oportunidad_id")
      .notNull()
      .references(() => oportunidad.id, { onDelete: "cascade" }),
    contactId: text("contact_id")
      .notNull()
      .references(() => contact.id, { onDelete: "cascade" }),
    fecha: date("fecha").notNull(),
    hora: text("hora").notNull(),
    personas: integer("personas").notNull(),
    /** A nombre de quién (puede no ser el nombre del contacto). */
    nombre: text("nombre").notNull(),
    sector: text("sector").notNull(),
    mesas: jsonb("mesas").$type<MesaTomada[]>().notNull(),
    /** Para el enlace «Agendar» (público, sin datos personales en la URL). */
    tokenCalendario: text("token_calendario").notNull(),
    /** whatsapp | manual | telefono */
    canal: text("canal").notNull().default("manual"),
    observaciones: text("observaciones"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("reserva_oportunidad_unica").on(t.oportunidadId),
    uniqueIndex("reserva_token_unico").on(t.tokenCalendario),
    index("reserva_turno_idx").on(t.organizationId, t.fecha, t.hora),
    index("reserva_contacto_idx").on(t.organizationId, t.contactId),
  ]
);
