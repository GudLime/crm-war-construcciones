import { z } from "zod";

/**
 * Motor de objetos personalizados — el archivo de configuración de un cliente
 * (`clientes/<cliente>.json`). Puro: sin base ni servidor.
 *
 * Define la estructura del CRM de ese cliente: sus objetos (Edificio, Unidad,
 * Tratamiento…), los campos de cada uno y las relaciones entre ellos o con la
 * oportunidad. La estructura solo cambia desde acá (y por PR): ni el
 * administrador ni el cliente agregan columnas desde la interfaz.
 *
 * Dos clases de objeto:
 * - **Adoptado** (`adopta`): describe una tabla que ya existe (como
 *   `edificio` en WAR). El motor no crea ni toca su estructura; solo verifica
 *   que la tabla y las columnas existan.
 * - **Nuevo**: el motor crea su tabla `obj_<clave>` y le agrega las columnas
 *   que falten. Nunca borra ni cambia columnas existentes.
 */

/** Identificador de Postgres seguro para interpolar en DDL: minúsculas, dígitos y `_`. */
export const IDENTIFICADOR = /^[a-z][a-z0-9_]{0,62}$/;

export const TIPOS_CAMPO = [
  "texto",
  "numero",
  "moneda",
  "fecha",
  "seleccion",
  "seleccion_multiple",
  "booleano",
  "enlace",
  "imagen",
  "calculado",
] as const;
export type TipoCampo = (typeof TIPOS_CAMPO)[number];

/** Los tipos que el motor guarda en una columna propia (todos menos `calculado`). */
export function tieneColumna(tipo: TipoCampo): boolean {
  return tipo !== "calculado";
}

const clave = z
  .string()
  .regex(IDENTIFICADOR, "minúsculas, dígitos y _; empieza con letra; hasta 63 caracteres");

const opcionSchema = z.object({
  valor: z.string().min(1),
  nombre: z.string().min(1),
});

/** Resumen de los registros relacionados (como el rollup de Notion). */
const resumenSchema = z.object({
  relacion: clave,
  campo: clave.optional(),
  operacion: z.enum(["minimo", "maximo", "suma", "cantidad", "promedio"]),
  /** Solo los registros cuyo campo vale alguno de estos valores. */
  filtro: z.record(clave, z.array(z.string()).min(1)).optional(),
});

const campoSchema = z
  .object({
    clave,
    nombre: z.string().min(1),
    tipo: z.enum(TIPOS_CAMPO),
    /** Columna física; por defecto, la clave. En un objeto adoptado, la columna que ya existe. */
    columna: clave.optional(),
    obligatorio: z.boolean().default(false),
    opciones: z.array(opcionSchema).optional(),
    /** Solo para `calculado`: suma de campos numéricos, o un resumen de una relación. */
    calculo: z
      .union([
        z.object({ suma: z.array(clave).min(1) }),
        z.object({ resumen: resumenSchema }),
      ])
      .optional(),
    visibleLista: z.boolean().default(true),
    /** Si el agente puede leer este campo (cuando el objeto le es visible). */
    visibleAgente: z.boolean().default(true),
  })
  .superRefine((c, ctx) => {
    const conOpciones = c.tipo === "seleccion" || c.tipo === "seleccion_multiple";
    if (conOpciones && !c.opciones?.length) {
      ctx.addIssue({ code: "custom", message: `«${c.clave}»: un campo de selección necesita opciones` });
    }
    if (!conOpciones && c.opciones) {
      ctx.addIssue({ code: "custom", message: `«${c.clave}»: solo los campos de selección llevan opciones` });
    }
    if (c.tipo === "calculado" && !c.calculo) {
      ctx.addIssue({ code: "custom", message: `«${c.clave}»: un campo calculado necesita «calculo»` });
    }
    if (c.tipo !== "calculado" && c.calculo) {
      ctx.addIssue({ code: "custom", message: `«${c.clave}»: solo los campos calculados llevan «calculo»` });
    }
  });

const objetoSchema = z.object({
  clave,
  nombre: z.string().min(1),
  nombrePlural: z.string().min(1),
  icono: z.string().min(1).default("box"),
  /** Tabla existente que este objeto describe. Sin esto, el motor usa `obj_<clave>`. */
  adopta: clave.optional(),
  /**
   * Cómo se arma el nombre del registro: un campo, o varios pegados sin
   * separador (piso + tipología = «6B»). Es la clave para buscar, importar y
   * relacionar.
   */
  titulo: z.array(clave).min(1),
  /**
   * Con qué es único el título: solo (por organización) o dentro del registro
   * padre de una relación (la unidad «6B» es única dentro de su edificio).
   */
  tituloUnicoDentroDe: clave.optional(),
  /** Si el agente puede leer este objeto. Lo puede cambiar el administrador. */
  visibleAgente: z.boolean().default(false),
  campos: z.array(campoSchema).min(1),
});

const relacionSchema = z.object({
  clave,
  /** Clave de un objeto, o `oportunidad` (núcleo). */
  desde: clave,
  hacia: clave,
  tipo: z.enum(["uno_a_muchos", "muchos_a_muchos"]),
  /** Cómo se ve la relación desde cada lado. */
  nombreDesde: z.string().min(1),
  nombreHacia: z.string().min(1),
  /** Uno a muchos: la columna en la tabla del lado «hacia». Por defecto `<desde>_id`. */
  columna: clave.optional(),
  /** Muchos a muchos: la tabla intermedia. Por defecto `rel_<clave>`. */
  tabla: clave.optional(),
  obligatoria: z.boolean().default(false),
});

export const configClienteSchema = z.object({
  /** Versión del formato del archivo. */
  version: z.literal(1),
  cliente: z.string().min(1),
  rubro: z.string().min(1).optional(),
  objetos: z.array(objetoSchema).default([]),
  relaciones: z.array(relacionSchema).default([]),
});

export type ConfigCliente = z.infer<typeof configClienteSchema>;
export type ObjetoConfig = ConfigCliente["objetos"][number];
export type CampoConfig = ObjetoConfig["campos"][number];
export type RelacionConfig = ConfigCliente["relaciones"][number];

/** Objetos del núcleo que una relación puede nombrar. */
export const OBJETOS_NUCLEO = ["oportunidad", "contacto"] as const;

/** Tablas del núcleo que el motor nunca crea ni adopta. */
const TABLAS_RESERVADAS = new Set([
  "oportunidad",
  "contact",
  "conversation",
  "message",
  "organization",
  "user",
  "motor_objeto",
  "motor_campo",
  "motor_relacion",
]);

export function tablaDeObjeto(o: Pick<ObjetoConfig, "clave" | "adopta">): string {
  return o.adopta ?? `obj_${o.clave}`;
}

export function columnaDeCampo(c: Pick<CampoConfig, "clave" | "columna">): string {
  return c.columna ?? c.clave;
}

export function columnaDeRelacion(r: Pick<RelacionConfig, "desde" | "columna">): string {
  return r.columna ?? `${r.desde}_id`;
}

export function tablaDeRelacion(r: Pick<RelacionConfig, "clave" | "tabla">): string {
  return r.tabla ?? `rel_${r.clave}`;
}

export type ResultadoConfig =
  | { ok: true; config: ConfigCliente }
  | { ok: false; errores: string[] };

/**
 * Valida un archivo de configuración: forma (Zod) y coherencia entre partes
 * (claves únicas, títulos y cálculos que nombran campos que existen,
 * relaciones entre objetos que existen). Devuelve todos los errores juntos.
 */
export function validarConfig(datos: unknown): ResultadoConfig {
  const parsed = configClienteSchema.safeParse(datos);
  if (!parsed.success) {
    return {
      ok: false,
      errores: parsed.error.issues.map((i) => `${i.path.join(".") || "(raíz)"}: ${i.message}`),
    };
  }
  const config = parsed.data;
  const errores: string[] = [];

  const objetos = new Map<string, ObjetoConfig>();
  const tablas = new Set<string>();
  for (const o of config.objetos) {
    if (objetos.has(o.clave)) errores.push(`objeto «${o.clave}» repetido`);
    if ((OBJETOS_NUCLEO as readonly string[]).includes(o.clave)) {
      errores.push(`objeto «${o.clave}»: es un objeto del núcleo, no se puede redefinir`);
    }
    objetos.set(o.clave, o);
    const tabla = tablaDeObjeto(o);
    if (TABLAS_RESERVADAS.has(tabla)) errores.push(`objeto «${o.clave}»: la tabla «${tabla}» es del núcleo`);
    if (tablas.has(tabla)) errores.push(`objeto «${o.clave}»: la tabla «${tabla}» ya la usa otro objeto`);
    tablas.add(tabla);

    const campos = new Map<string, CampoConfig>();
    const columnas = new Set<string>();
    for (const c of o.campos) {
      if (campos.has(c.clave)) errores.push(`objeto «${o.clave}»: campo «${c.clave}» repetido`);
      campos.set(c.clave, c);
      if (!tieneColumna(c.tipo)) continue;
      const col = columnaDeCampo(c);
      if (["id", "organization_id", "created_at", "updated_at"].includes(col)) {
        errores.push(`objeto «${o.clave}»: la columna «${col}» la maneja el motor`);
      }
      if (columnas.has(col)) errores.push(`objeto «${o.clave}»: la columna «${col}» está repetida`);
      columnas.add(col);
    }

    for (const t of o.titulo) {
      const c = campos.get(t);
      if (!c) errores.push(`objeto «${o.clave}»: el título nombra el campo «${t}», que no existe`);
      else if (!tieneColumna(c.tipo)) errores.push(`objeto «${o.clave}»: el título no puede usar el campo calculado «${t}»`);
    }

    for (const c of o.campos) {
      if (c.calculo && "suma" in c.calculo) {
        for (const s of c.calculo.suma) {
          const sumando = campos.get(s);
          if (!sumando) errores.push(`objeto «${o.clave}»: «${c.clave}» suma «${s}», que no existe`);
          else if (sumando.tipo !== "numero" && sumando.tipo !== "moneda") {
            errores.push(`objeto «${o.clave}»: «${c.clave}» suma «${s}», que no es numérico`);
          }
        }
      }
    }
  }

  const existeObjeto = (k: string) => objetos.has(k) || (OBJETOS_NUCLEO as readonly string[]).includes(k);
  const relaciones = new Map<string, RelacionConfig>();
  for (const r of config.relaciones) {
    if (relaciones.has(r.clave)) errores.push(`relación «${r.clave}» repetida`);
    relaciones.set(r.clave, r);
    if (!existeObjeto(r.desde)) errores.push(`relación «${r.clave}»: «${r.desde}» no es un objeto`);
    if (!existeObjeto(r.hacia)) errores.push(`relación «${r.clave}»: «${r.hacia}» no es un objeto`);
    if (r.tipo === "uno_a_muchos" && !objetos.has(r.hacia)) {
      // La columna va en la tabla del lado «muchos»; el núcleo no se toca.
      errores.push(`relación «${r.clave}»: en uno a muchos, el lado «hacia» tiene que ser un objeto del cliente`);
    }
    if (r.tipo === "uno_a_muchos" && r.tabla) errores.push(`relación «${r.clave}»: «tabla» es solo para muchos a muchos`);
    if (r.tipo === "muchos_a_muchos" && r.columna) errores.push(`relación «${r.clave}»: «columna» es solo para uno a muchos`);
    if (r.tipo === "muchos_a_muchos" && TABLAS_RESERVADAS.has(tablaDeRelacion(r))) {
      errores.push(`relación «${r.clave}»: la tabla «${tablaDeRelacion(r)}» es del núcleo`);
    }
  }

  for (const o of config.objetos) {
    if (o.tituloUnicoDentroDe) {
      const r = relaciones.get(o.tituloUnicoDentroDe);
      if (!r || r.tipo !== "uno_a_muchos" || r.hacia !== o.clave) {
        errores.push(
          `objeto «${o.clave}»: «tituloUnicoDentroDe» tiene que ser una relación uno a muchos que llegue a este objeto`
        );
      }
    }
    for (const c of o.campos) {
      if (!c.calculo || !("resumen" in c.calculo)) continue;
      const { relacion, campo, operacion, filtro } = c.calculo.resumen;
      const r = relaciones.get(relacion);
      if (!r || r.desde !== o.clave) {
        errores.push(`objeto «${o.clave}»: «${c.clave}» resume la relación «${relacion}», que no sale de este objeto`);
        continue;
      }
      const hijo = objetos.get(r.hacia);
      if (!hijo) continue;
      const camposHijo = new Map(hijo.campos.map((h) => [h.clave, h] as const));
      if (operacion !== "cantidad") {
        const h = campo ? camposHijo.get(campo) : undefined;
        if (!h) errores.push(`objeto «${o.clave}»: «${c.clave}» resume un campo de «${hijo.clave}» que no existe`);
      }
      for (const f of Object.keys(filtro ?? {})) {
        if (!camposHijo.has(f)) errores.push(`objeto «${o.clave}»: «${c.clave}» filtra por «${f}», que no existe en «${hijo.clave}»`);
      }
    }
  }

  return errores.length ? { ok: false, errores } : { ok: true, config };
}
