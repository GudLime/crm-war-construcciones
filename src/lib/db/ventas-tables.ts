import {
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { contact, organization } from "./schema";

/**
 * Tablas de Ventas de la constructora. Viven aparte del esquema base para
 * poder agregarlas sin reescribir ese archivo. El cliente de BD las mezcla
 * en `schema` (ver `src/lib/db/index.ts`).
 */

export const edificio = pgTable(
  "edificio",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    nombre: text("nombre").notNull(),
    direccion: text("direccion"),
    estado: text("estado", {
      enum: ["en_construccion", "terminado", "en_pozo", "a_construir"],
    })
      .notNull()
      .default("en_construccion"),
    /** Texto libre, como en Notion («unidades de 2 y 3 ambientes»). */
    enVenta: text("en_venta"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("edificio_org_nombre_idx").on(t.organizationId, t.nombre)]
);

/**
 * Una unidad dentro de un edificio. Los metros totales no se guardan: son la
 * suma de cubiertos, semicubiertos y descubiertos.
 */
export const departamento = pgTable(
  "departamento",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    edificioId: text("edificio_id")
      .notNull()
      .references(() => edificio.id, { onDelete: "cascade" }),
    /** Identificador de la unidad: «3B», «PB 02». */
    unidad: text("unidad").notNull(),
    /** Frente, contrafrente, interno: cómo mira dentro del edificio. */
    orientacionEdificio: text("orientacion_edificio"),
    /** Norte, este, noroeste: la orientación geográfica. */
    orientacionGeo: text("orientacion_geo"),
    metrosCubiertos: numeric("metros_cubiertos", { precision: 8, scale: 2 }),
    metrosSemicubiertos: numeric("metros_semicubiertos", { precision: 8, scale: 2 }),
    metrosDescubiertos: numeric("metros_descubiertos", { precision: 8, scale: 2 }),
    /** Precio de lista en centavos. NULL = todavía sin precio. */
    valorCents: integer("valor_cents"),
    moneda: text("moneda"),
    estado: text("estado", {
      enum: ["disponible", "consultar", "reservado", "vendido"],
    })
      .notNull()
      .default("disponible"),
    tipologia: text("tipologia", {
      enum: ["1_ambiente", "2_ambientes", "3_ambientes", "4_ambientes", "triplex"],
    }),
    piso: integer("piso"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("departamento_edificio_idx").on(t.organizationId, t.edificioId, t.unidad),
    uniqueIndex("departamento_edificio_unidad_uq").on(t.edificioId, t.unidad),
  ]
);

/**
 * Un interesado concreto: de dónde llegó, a qué contacto pertenece y qué
 * edificio o departamento está mirando. No reemplaza al lead del pipeline;
 * es la ficha comercial de la constructora.
 */
export const oportunidad = pgTable(
  "oportunidad",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    nombre: text("nombre").notNull(),
    origen: text("origen"),
    contactId: text("contact_id").references(() => contact.id, { onDelete: "set null" }),
    edificioId: text("edificio_id").references(() => edificio.id, { onDelete: "set null" }),
    departamentoId: text("departamento_id").references(() => departamento.id, {
      onDelete: "set null",
    }),
    estado: text("estado", {
      enum: [
        "recibido",
        "no_responde",
        "en_charlas",
        "conoce_informacion",
        "visito",
        "reservo",
        "compro",
        "no_calificado",
        "perdido",
      ],
    })
      .notNull()
      .default("recibido"),
    tipo: text("tipo", { enum: ["venta", "alquiler", "inmobiliaria"] }),
    motivoCierre: text("motivo_cierre"),
    valorCents: integer("valor_cents"),
    moneda: text("moneda"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("oportunidad_org_estado_idx").on(t.organizationId, t.estado, t.updatedAt),
    index("oportunidad_contacto_idx").on(t.organizationId, t.contactId),
  ]
);

/**
 * Acción que hace una persona del equipo, no la IA: una llamada, una visita
 * o un mensaje que alguien tiene que mandar a mano.
 */
export const tareaVenta = pgTable(
  "tarea_venta",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    titulo: text("titulo").notNull(),
    tipo: text("tipo", {
      enum: ["llamada", "visita", "mensaje", "reunion", "correo"],
    }).notNull(),
    estado: text("estado", {
      enum: ["realizar", "no_responde", "listo"],
    })
      .notNull()
      .default("realizar"),
    fecha: timestamp("fecha"),
    comentarios: text("comentarios"),
    contactId: text("contact_id").references(() => contact.id, { onDelete: "set null" }),
    oportunidadId: text("oportunidad_id").references(() => oportunidad.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("tarea_venta_org_estado_idx").on(t.organizationId, t.estado, t.fecha),
    index("tarea_venta_oportunidad_idx").on(t.organizationId, t.oportunidadId),
  ]
);

/**
 * 068 — Los edificios que le interesan a una oportunidad. Varios: un cliente
 * mira más de uno antes de decidirse. El departamento puntual, cuando se
 * define, sigue en `oportunidad.departamento_id`.
 */
export const oportunidadEdificio = pgTable(
  "oportunidad_edificio",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    oportunidadId: text("oportunidad_id")
      .notNull()
      .references(() => oportunidad.id, { onDelete: "cascade" }),
    edificioId: text("edificio_id")
      .notNull()
      .references(() => edificio.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.oportunidadId, t.edificioId] }),
    index("oportunidad_edificio_edificio_idx").on(t.organizationId, t.edificioId),
  ]
);

/** 068 — Las tipologías que le interesan a una oportunidad (varias). */
export const oportunidadTipologia = pgTable(
  "oportunidad_tipologia",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    oportunidadId: text("oportunidad_id")
      .notNull()
      .references(() => oportunidad.id, { onDelete: "cascade" }),
    tipologia: text("tipologia", {
      enum: ["1_ambiente", "2_ambientes", "3_ambientes", "4_ambientes", "triplex"],
    }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.oportunidadId, t.tipologia] })]
);
