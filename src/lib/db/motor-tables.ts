import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { organization } from "./schema";

/** Cómo se le presenta un objeto al agente (`clientes/<cliente>.json` → `agente`). */
export type AgenteObjeto = {
  filtro?: Record<string, string[]>;
  agruparPor?: string;
  rangos?: string[];
  indicacion?: string;
};

/**
 * Motor de objetos personalizados — metadatos (migración 0038).
 *
 * Describen la estructura que define el archivo de configuración del cliente.
 * Los escribe solo el arranque (`server/motor/sincronizar.ts`): ni el
 * administrador ni el cliente cambian la estructura desde la interfaz. Lo que
 * sale de la configuración queda `archivado`, nunca se borra.
 *
 * Los registros de cada objeto viven en su propia tabla (`tabla`): una tabla
 * adoptada que ya existía (como `edificio`) o una `obj_<clave>` que crea el
 * motor. Una columna real por campo; nada de clave-valor.
 */

export const motorObjeto = pgTable(
  "motor_objeto",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    clave: text("clave").notNull(),
    nombre: text("nombre").notNull(),
    nombrePlural: text("nombre_plural").notNull(),
    icono: text("icono").notNull().default("box"),
    /** Tabla física de los registros. */
    tabla: text("tabla").notNull(),
    /** La tabla existía antes del motor: el motor no toca su estructura. */
    adoptada: boolean("adoptada").notNull().default(false),
    /** Claves de los campos que, pegados, forman el nombre del registro. */
    titulo: jsonb("titulo").$type<string[]>().notNull(),
    /** Clave de la relación dentro de cuyo padre el título es único. */
    tituloUnicoDentroDe: text("titulo_unico_dentro_de"),
    /** Columna donde se guarda el nombre armado (0042), como `departamento.unidad`. */
    columnaTitulo: text("columna_titulo"),
    visibleAgente: boolean("visible_agente").notNull().default(false),
    /** Cómo se le presenta al agente (0041): filtro, agrupación, rangos, indicación. */
    agente: jsonb("agente").$type<AgenteObjeto>(),
    orden: integer("orden").notNull().default(0),
    archivado: boolean("archivado").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("motor_objeto_org_clave_uq").on(t.organizationId, t.clave)]
);

export const motorCampo = pgTable(
  "motor_campo",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    objetoId: text("objeto_id")
      .notNull()
      .references(() => motorObjeto.id, { onDelete: "cascade" }),
    clave: text("clave").notNull(),
    nombre: text("nombre").notNull(),
    /** Uno de `TIPOS_CAMPO` (`src/lib/motor/config.ts`). */
    tipo: text("tipo").notNull(),
    /** Columna física; NULL en los campos calculados. */
    columna: text("columna"),
    obligatorio: boolean("obligatorio").notNull().default(false),
    opciones: jsonb("opciones").$type<{ valor: string; nombre: string }[]>(),
    calculo: jsonb("calculo").$type<Record<string, unknown>>(),
    visibleLista: boolean("visible_lista").notNull().default(true),
    visibleAgente: boolean("visible_agente").notNull().default(true),
    /** Cuándo se completó la columna con su valor inicial (0042): no se repite. */
    inicializadoAt: timestamp("inicializado_at"),
    orden: integer("orden").notNull().default(0),
    archivado: boolean("archivado").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("motor_campo_objeto_clave_uq").on(t.objetoId, t.clave),
    index("motor_campo_org_idx").on(t.organizationId, t.objetoId),
  ]
);

export const motorRelacion = pgTable(
  "motor_relacion",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    clave: text("clave").notNull(),
    /** Clave de un objeto, o `oportunidad` / `contacto` (núcleo). */
    desde: text("desde").notNull(),
    hacia: text("hacia").notNull(),
    tipo: text("tipo", { enum: ["uno_a_muchos", "muchos_a_muchos"] }).notNull(),
    nombreDesde: text("nombre_desde").notNull(),
    nombreHacia: text("nombre_hacia").notNull(),
    /** Uno a muchos: columna en la tabla del lado «hacia». */
    columna: text("columna"),
    /** Muchos a muchos: tabla intermedia. */
    tabla: text("tabla"),
    /** Muchos a muchos: la tabla intermedia ya existía (0040). */
    adoptaTabla: boolean("adopta_tabla").notNull().default(false),
    columnaDesde: text("columna_desde"),
    columnaHacia: text("columna_hacia"),
    /** De dónde se copian los vínculos la primera vez (0040). */
    sembrarDesde: jsonb("sembrar_desde").$type<{ tabla: string; columnaDesde: string; columnaHacia: string }>(),
    /** Cuándo se copiaron: no se repite. */
    sembradoAt: timestamp("sembrado_at"),
    obligatoria: boolean("obligatoria").notNull().default(false),
    archivado: boolean("archivado").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("motor_relacion_org_clave_uq").on(t.organizationId, t.clave)]
);

/**
 * Historial de cambios de los registros (migración 0039). Solo se agregan
 * filas. Guarda el título del momento: se sigue leyendo aunque el registro se
 * borre. Una importación de CSV comparte `loteId`.
 */
export const motorCambio = pgTable(
  "motor_cambio",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** Clave del objeto. */
    objeto: text("objeto").notNull(),
    registroId: text("registro_id").notNull(),
    titulo: text("titulo").notNull(),
    accion: text("accion", { enum: ["creado", "actualizado", "borrado"] }).notNull(),
    /** Clave del campo (o de la relación) que cambió; NULL en creado/borrado. */
    campo: text("campo"),
    antes: jsonb("antes"),
    despues: jsonb("despues"),
    actorTipo: text("actor_tipo", { enum: ["usuario", "agente", "importacion", "sistema"] }).notNull(),
    actorId: text("actor_id"),
    loteId: text("lote_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("motor_cambio_registro_idx").on(t.organizationId, t.objeto, t.registroId, t.createdAt),
    index("motor_cambio_lote_idx").on(t.loteId),
  ]
);

/**
 * Reglas de etapa (migración 0040): cuando la oportunidad pasa a `etapa`, el
 * campo de los registros vinculados por `relacion` toma `valor`.
 */
export const motorRegla = pgTable(
  "motor_regla",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    clave: text("clave").notNull(),
    etapa: text("etapa").notNull(),
    relacion: text("relacion").notNull(),
    campo: text("campo").notNull(),
    valor: jsonb("valor").$type<string | number | boolean>().notNull(),
    archivado: boolean("archivado").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("motor_regla_org_clave_uq").on(t.organizationId, t.clave)]
);
