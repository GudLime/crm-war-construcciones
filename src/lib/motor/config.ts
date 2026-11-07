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
    /**
     * Paso 8 — En un objeto adoptado, el motor crea esta columna si la tabla
     * no la tiene (solo agrega; nunca cambia ni borra columnas). En un objeto
     * propio no hace falta: todas se crean.
     */
    crear: z.boolean().optional(),
    /**
     * Paso 8 — Con qué se completa la columna UNA vez por organización, solo en
     * las filas donde está vacía: un valor fijo, o copiado de otra columna de
     * la misma tabla, opcionalmente con un patrón (expresión regular de
     * Postgres; se toma el primer grupo) y una tabla de equivalencias. Lo que
     * no coincide queda vacío.
     */
    inicial: z
      .union([
        z.object({ valor: z.union([z.string(), z.number(), z.boolean()]) }),
        z.object({
          copiarDe: clave,
          patron: z.string().min(1).max(200).optional(),
          mapa: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
        }),
      ])
      .optional(),
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
    if (c.inicial && (c.tipo === "calculado" || c.tipo === "seleccion_multiple")) {
      ctx.addIssue({ code: "custom", message: `«${c.clave}»: este tipo de campo no lleva «inicial»` });
    }
    if (c.inicial && "patron" in c.inicial && c.inicial.patron) {
      try {
        new RegExp(c.inicial.patron);
      } catch {
        ctx.addIssue({ code: "custom", message: `«${c.clave}»: el patrón de «inicial» no es válido` });
      }
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
  /**
   * Paso 8 — Columna donde el motor guarda el nombre armado (como
   * `departamento.unidad` = «6B»): lo que ya usa esa columna (un índice único,
   * otras pantallas, integraciones) sigue andando. Se reescribe solo cuando
   * cambia un campo del título; mientras tanto, el nombre es lo guardado.
   */
  columnaTitulo: clave.optional(),
  /**
   * Paso 8 — Si aparece en el menú (por defecto, sí). Apagado, sus pantallas
   * siguen andando por enlace: sirve para un hijo que se ve dentro del padre,
   * o mientras un cliente sigue usando una página propia.
   */
  enMenu: z.boolean().default(true),
  /** Si el agente puede leer este objeto. Lo puede cambiar el administrador. */
  visibleAgente: z.boolean().default(false),
  /**
   * Cómo se le presenta el objeto al agente (opcional):
   * - `filtro`: solo se listan los registros cuyo campo vale alguno de estos
   *   valores (las unidades disponibles); los demás solo se cuentan.
   * - `agruparPor`: un campo para agrupar (ambientes) y calcularle `rangos`
   *   (mínimo y máximo de campos numéricos): el agente copia el rango en vez
   *   de hacer la cuenta.
   * - `indicacion`: una línea para el agente sobre este objeto.
   */
  agente: z
    .object({
      filtro: z.record(clave, z.array(z.string()).min(1)).optional(),
      agruparPor: clave.optional(),
      rangos: z.array(clave).optional(),
      indicacion: z.string().max(400).optional(),
    })
    .optional(),
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
  /**
   * Muchos a muchos: la tabla intermedia ya existe (como `oportunidad_edificio`
   * en WAR). El motor no la crea; verifica que tenga las columnas.
   */
  adoptaTabla: z.boolean().default(false),
  /** Muchos a muchos: columnas de la tabla intermedia. Por defecto `desde_id` y `hacia_id`. */
  columnaDesde: clave.optional(),
  columnaHacia: clave.optional(),
  /**
   * Muchos a muchos: copia UNA SOLA VEZ los vínculos de una columna que ya
   * existe (como `oportunidad.departamento_id` en WAR). Nunca se repite: si
   * después alguien saca un vínculo, no vuelve.
   */
  sembrarDesde: z
    .object({ tabla: clave, columnaDesde: clave, columnaHacia: clave })
    .optional(),
  obligatoria: z.boolean().default(false),
});

/**
 * Regla de etapa: cuando la oportunidad pasa a `etapa`, el campo de los
 * registros vinculados por `relacion` toma `valor` (Reservó → la unidad pasa a
 * Reservado). Con un solo vinculado se aplica sola; con varios, se pregunta
 * cuáles.
 */
const reglaEtapaSchema = z.object({
  clave,
  etapa: clave,
  relacion: clave,
  campo: clave,
  valor: z.union([z.string(), z.number(), z.boolean()]),
});

export const configClienteSchema = z.object({
  /** Versión del formato del archivo. */
  version: z.literal(1),
  cliente: z.string().min(1),
  rubro: z.string().min(1).optional(),
  objetos: z.array(objetoSchema).default([]),
  relaciones: z.array(relacionSchema).default([]),
  reglasEtapa: z.array(reglaEtapaSchema).default([]),
  /**
   * Paso 7 — el tablero de estadísticas de oportunidades (Resultados): qué
   * bloques se ven, en qué orden, y el «Ver por» con el que arranca
   * (`origen`, `tipo`, `<relación>`, `<relación>.<campo>` o
   * `<relación>.<relación padre>`).
   */
  estadisticas: z
    .object({
      bloques: z.array(z.enum(["embudo", "tiempos", "motivos", "origenes"])).min(1).optional(),
      verPor: z.string().min(1).max(130).optional(),
    })
    .optional(),
});

export type ConfigCliente = z.infer<typeof configClienteSchema>;
export type ObjetoConfig = ConfigCliente["objetos"][number];
export type CampoConfig = ObjetoConfig["campos"][number];
export type RelacionConfig = ConfigCliente["relaciones"][number];
export type ReglaEtapaConfig = ConfigCliente["reglasEtapa"][number];

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

/** Columnas de la tabla intermedia de una relación muchos a muchos. */
export function columnasDeRelacion(r: Pick<RelacionConfig, "columnaDesde" | "columnaHacia">): {
  desde: string;
  hacia: string;
} {
  return { desde: r.columnaDesde ?? "desde_id", hacia: r.columnaHacia ?? "hacia_id" };
}

/** Etapas de la oportunidad (núcleo, `lib/ventas`): las que una regla puede nombrar. */
export const ETAPAS_OPORTUNIDAD = [
  "recibido",
  "en_charlas",
  "conoce_informacion",
  "visito",
  "reservo",
  "compro",
  "no_calificado",
  "perdido",
] as const;

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

    if (o.columnaTitulo) {
      if (columnas.has(o.columnaTitulo)) {
        errores.push(`objeto «${o.clave}»: «columnaTitulo» no puede ser la columna de un campo`);
      }
      if (["id", "organization_id", "created_at", "updated_at"].includes(o.columnaTitulo)) {
        errores.push(`objeto «${o.clave}»: la columna «${o.columnaTitulo}» la maneja el motor`);
      }
    }
    for (const c of o.campos) {
      if (c.inicial && "copiarDe" in c.inicial && c.inicial.copiarDe === columnaDeCampo(c)) {
        errores.push(`objeto «${o.clave}»: «${c.clave}» no puede copiarse de sí mismo`);
      }
      if (c.inicial && !c.crear && o.adopta) {
        errores.push(`objeto «${o.clave}»: «${c.clave}» lleva «inicial» pero no «crear»: solo se completa una columna nueva`);
      }
    }

    if (o.agente) {
      for (const f of Object.keys(o.agente.filtro ?? {})) {
        if (!campos.has(f)) errores.push(`objeto «${o.clave}»: el agente filtra por «${f}», que no existe`);
      }
      if (o.agente.agruparPor && !campos.has(o.agente.agruparPor)) {
        errores.push(`objeto «${o.clave}»: el agente agrupa por «${o.agente.agruparPor}», que no existe`);
      }
      for (const r of o.agente.rangos ?? []) {
        const c = campos.get(r);
        if (!c) errores.push(`objeto «${o.clave}»: el rango «${r}» no es un campo`);
        else if (!["numero", "moneda", "calculado"].includes(c.tipo)) {
          errores.push(`objeto «${o.clave}»: el rango «${r}» no es numérico`);
        }
      }
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
    if (r.tipo === "uno_a_muchos" && (r.adoptaTabla || r.columnaDesde || r.columnaHacia || r.sembrarDesde)) {
      errores.push(`relación «${r.clave}»: «adoptaTabla», «columnaDesde», «columnaHacia» y «sembrarDesde» son solo para muchos a muchos`);
    }
    if (r.adoptaTabla && !r.tabla) errores.push(`relación «${r.clave}»: para adoptar una tabla hay que nombrarla en «tabla»`);
    const cols = columnasDeRelacion(r);
    if (r.tipo === "muchos_a_muchos" && cols.desde === cols.hacia) {
      errores.push(`relación «${r.clave}»: «columnaDesde» y «columnaHacia» no pueden ser la misma`);
    }
  }

  const reglas = new Set<string>();
  for (const g of config.reglasEtapa) {
    if (reglas.has(g.clave)) errores.push(`regla «${g.clave}» repetida`);
    reglas.add(g.clave);
    if (!(ETAPAS_OPORTUNIDAD as readonly string[]).includes(g.etapa)) {
      errores.push(`regla «${g.clave}»: «${g.etapa}» no es una etapa de la oportunidad`);
    }
    const r = relaciones.get(g.relacion);
    if (!r || r.tipo !== "muchos_a_muchos" || r.desde !== "oportunidad") {
      errores.push(`regla «${g.clave}»: «${g.relacion}» tiene que ser una relación muchos a muchos desde la oportunidad`);
      continue;
    }
    const campo = objetos.get(r.hacia)?.campos.find((c) => c.clave === g.campo);
    if (!campo || !tieneColumna(campo.tipo)) {
      errores.push(`regla «${g.clave}»: «${g.campo}» no es un campo de «${r.hacia}»`);
    } else if (campo.tipo === "seleccion" && !campo.opciones?.some((o) => o.valor === String(g.valor))) {
      errores.push(`regla «${g.clave}»: «${String(g.valor)}» no es una opción de «${campo.nombre}»`);
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

  const verPor = config.estadisticas?.verPor;
  if (verPor && !["origen", "tipo"].includes(verPor)) {
    const [rel, sub] = verPor.split(".");
    const r = config.relaciones.find((x) => x.clave === rel);
    if (!r || r.tipo !== "muchos_a_muchos" || r.desde !== "oportunidad") {
      errores.push(`estadisticas.verPor «${verPor}»: «${rel}» no es una relación muchos a muchos desde la oportunidad`);
    } else if (sub) {
      const destino = objetos.get(r.hacia);
      const esCampo = destino?.campos.some((c) => c.clave === sub);
      const esPadre = config.relaciones.some((x) => x.clave === sub && x.tipo === "uno_a_muchos" && x.hacia === r.hacia);
      if (!esCampo && !esPadre) {
        errores.push(`estadisticas.verPor «${verPor}»: «${sub}» no es un campo ni un padre de «${r.hacia}»`);
      }
    }
  }

  return errores.length ? { ok: false, errores } : { ok: true, config };
}
