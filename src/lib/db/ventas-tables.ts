import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { contact, organization, user } from "./schema";

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
    /** 0032 — Si está prendido, el edificio y sus unidades van en la memoria del agente. */
    memoriaAgente: boolean("memoria_agente").notNull().default(false),
    /** 0032 — Lo que el agente tiene que saber de este edificio (visitas, entrega, amenities…). */
    notasAgente: text("notas_agente"),
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
    /** 0031 — Ambientes de la unidad, como vienen en la lista de precios. */
    dormitorios: integer("dormitorios"),
    banos: integer("banos"),
    toilette: integer("toilette"),
    enSuite: integer("en_suite"),
    /** 0032 — Comentario de esta unidad para el agente. */
    notasAgente: text("notas_agente"),
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
    /**
     * War — lo último que pasó con esta oportunidad: un formulario nuevo o un
     * mensaje de WhatsApp. La lista se ordena por acá, así lo que se movió
     * vuelve arriba. Se toca solo con interacciones del interesado.
     */
    ultimaInteraccion: timestamp("ultima_interaccion").notNull().defaultNow(),
    /** War — Desde cuándo está en el estado actual (para medir tiempos). */
    estadoDesde: timestamp("estado_desde").notNull().defaultNow(),
    /** War — Cuándo se cerró (Compró, Perdido, No calificado); null si está abierta. */
    cerradaAt: timestamp("cerrada_at"),
    /**
     * War — «Sin respuesta»: tandas de mensajes nuestros (o llamadas no
     * atendidas) desde lo último que escribió la persona. Vuelve a 0 cuando
     * responde. Ver `server/oportunidad-historial.ts`.
     */
    intentosSinRespuesta: integer("intentos_sin_respuesta").notNull().default(0),
    ultimoIntentoAt: timestamp("ultimo_intento_at"),
    ultimaRespuestaAt: timestamp("ultima_respuesta_at"),
    primerContactoAt: timestamp("primer_contacto_at"),
    primeraRespuestaAt: timestamp("primera_respuesta_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("oportunidad_org_estado_idx").on(t.organizationId, t.estado, t.updatedAt),
    index("oportunidad_contacto_idx").on(t.organizationId, t.contactId),
    index("oportunidad_org_ultima_idx").on(t.organizationId, t.ultimaInteraccion),
  ]
);

/**
 * War — Cada formulario de anuncio (o portal) que llegó por Make. El lead ID
 * vive acá, en la oportunidad, no en el contacto: una misma persona puede
 * llenar varios formularios. El UNIQUE por lead ID hace idempotente el
 * reintento de Make.
 */
export const oportunidadLead = pgTable(
  "oportunidad_lead",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    oportunidadId: text("oportunidad_id")
      .notNull()
      .references(() => oportunidad.id, { onDelete: "cascade" }),
    contactId: text("contact_id").references(() => contact.id, { onDelete: "set null" }),
    leadId: text("lead_id").notNull(),
    origen: text("origen").notNull(),
    edificioId: text("edificio_id").references(() => edificio.id, { onDelete: "set null" }),
    /** Lo que escribió la persona, tal cual: sirve para revisar los que no cerraron. */
    telefonoCrudo: text("telefono_crudo"),
    campaignId: text("campaign_id"),
    campaignName: text("campaign_name"),
    adsetId: text("adset_id"),
    adsetName: text("adset_name"),
    adId: text("ad_id"),
    adName: text("ad_name"),
    formId: text("form_id"),
    formName: text("form_name"),
    plataforma: text("plataforma"),
    /** Respuestas extra del formulario, sin interpretar. */
    respuestas: jsonb("respuestas").$type<Record<string, unknown>>(),
    recibidoAt: timestamp("recibido_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("oportunidad_lead_org_lead_uq").on(t.organizationId, t.leadId),
    index("oportunidad_lead_oportunidad_idx").on(t.organizationId, t.oportunidadId),
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

/**
 * War — Versiones anteriores de las instrucciones del agente. Se guarda la
 * anterior cada vez que cambian (las últimas 20), para poder volver atrás si
 * un .md nuevo hace que el agente responda peor.
 */
export const agentInstruccionesVersion = pgTable(
  "agent_instrucciones_version",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    instructions: text("instructions").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("agent_instrucciones_version_org_idx").on(t.organizationId, t.createdAt)]
);

/**
 * War 0035 — Orígenes de las oportunidades (Ajustes → Orígenes). El nombre es
 * lo que se guarda en `oportunidad.origen` (texto, sin FK: borrar un origen
 * no le cambia nada a las oportunidades que ya lo tienen) y lo que manda Make.
 */
/** War — Motivos de cierre configurables (migración war_0001). */
export const motivoCierre = pgTable(
  "motivo_cierre",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    nombre: text("nombre").notNull(),
    /** Posición en la lista y en los desplegables. */
    orden: integer("orden").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("motivo_cierre_org_nombre_uq").on(t.organizationId, t.nombre)]
);

export const origenOportunidad = pgTable(
  "origen_oportunidad",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    nombre: text("nombre").notNull(),
    /** Clave de `ICONOS_ORIGEN` (`src/lib/origenes.ts`). */
    icono: text("icono").notNull().default("tag"),
    /** Posición en la lista y en el desplegable. */
    orden: integer("orden").notNull().default(0),
    /**
     * Imagen propia (el logo de Zonaprop, de MercadoLibre…). Si hay, se
     * muestra en lugar del ícono. El archivo vive en el volumen de medios como
     * `origen-<id>`; acá solo su tipo y una versión para la caché.
     */
    imagenMime: text("imagen_mime"),
    imagenVersion: bigint("imagen_version", { mode: "number" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("origen_oportunidad_org_nombre_uq").on(t.organizationId, t.nombre),
    index("origen_oportunidad_org_orden_idx").on(t.organizationId, t.orden),
  ]
);

/**
 * War — Historial de cada oportunidad, pensado para estadísticas.
 *
 * Solo se AGREGAN filas: nunca se pisan ni se borran (salvo que se borre la
 * oportunidad). Mismo criterio que `lead_stage_event`:
 *
 * - `occurred_at` es cuándo PASÓ, no cuándo se registró.
 * - Origen, edificio, tipo y contacto van como FOTO del momento: editar la
 *   oportunidad después no reescribe el pasado, y casi toda agregación los
 *   cruza sin pagar un join.
 * - `segundos_en_estado_anterior` hace que "cuánto tardan" sea una suma.
 *
 * El estado ACTUAL se lee de `oportunidad`; esto cuenta cómo se llegó ahí.
 */
export const oportunidadEvento = pgTable(
  "oportunidad_evento",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    oportunidadId: text("oportunidad_id")
      .notNull()
      .references(() => oportunidad.id, { onDelete: "cascade" }),
    contactId: text("contact_id").references(() => contact.id, { onDelete: "set null" }),
    tipo: text("tipo", {
      enum: [
        "creada",
        "estado",
        "cerrada",
        "reabierta",
        "formulario",
        "primer_contacto",
        "primera_respuesta",
      ],
    }).notNull(),
    estadoDesde: text("estado_desde"),
    estadoHasta: text("estado_hasta"),
    /** Solo en `cerrada`: ganada (Compró), perdida o no calificado. */
    resultado: text("resultado", { enum: ["ganada", "perdida", "no_calificado"] }),
    motivo: text("motivo"),
    segundosEnEstadoAnterior: integer("segundos_en_estado_anterior"),
    /** Intentos sin respuesta al momento del evento (sirve en `cerrada`). */
    intentosSinRespuesta: integer("intentos_sin_respuesta"),
    origen: text("origen"),
    edificioId: text("edificio_id").references(() => edificio.id, { onDelete: "set null" }),
    tipoOportunidad: text("tipo_oportunidad"),
    /** persona (con `actor_user_id`), ia (Mateo), make, sistema o migracion. */
    fuente: text("fuente", { enum: ["persona", "ia", "make", "sistema", "migracion"] }).notNull(),
    actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
    /** Extra según el tipo: lead ID y campaña de un formulario, canal de un contacto… */
    datos: jsonb("datos").$type<Record<string, unknown>>(),
    occurredAt: timestamp("occurred_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("oportunidad_evento_op_idx").on(t.organizationId, t.oportunidadId, t.occurredAt),
    index("oportunidad_evento_tipo_idx").on(t.organizationId, t.tipo, t.occurredAt),
  ]
);

/**
 * War — Ajustes → Ventas: cuándo se cierra una oportunidad por falta de
 * respuesta y hasta cuándo un mensaje reabre la misma en vez de abrir otra.
 * Una fila por organización; sin fila valen los valores por defecto
 * (`AJUSTES_VENTAS_POR_DEFECTO` en `lib/ventas-ajustes.ts`).
 */
export const ventasAjustes = pgTable("ventas_ajustes", {
  organizationId: text("organization_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  sinRespuestaIntentos: integer("sin_respuesta_intentos").notNull().default(3),
  sinRespuestaDias: integer("sin_respuesta_dias").notNull().default(7),
  sinRespuestaModo: text("sin_respuesta_modo", { enum: ["cerrar", "sugerir", "apagado"] })
    .notNull()
    .default("cerrar"),
  reaperturaDias: integer("reapertura_dias").notNull().default(120),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
