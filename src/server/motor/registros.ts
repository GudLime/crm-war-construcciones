import { and, desc, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import {
  armarTitulo,
  calcularSuma,
  convertir,
  mismoValor,
  normalizar,
  type CampoMeta,
  type Valor,
} from "@/lib/motor/valores";
import { cargarMotor, tablaNucleo, type Motor, type ObjetoMeta, type RelacionMeta } from "./metadatos";

/**
 * Motor — lectura y escritura de registros de cualquier objeto (paso 2).
 *
 * Todo pasa por los metadatos: qué columnas hay, de qué tipo, cuál es el
 * título, con quién se relaciona. Las tablas son reales (una columna por
 * campo), así que se arma SQL con identificadores ya validados por la
 * configuración y valores siempre como parámetros.
 *
 * Reglas:
 * - El título (campos pegados) es único por organización, o dentro de su
 *   padre si el objeto tiene `tituloUnicoDentroDe`. Se compara normalizado:
 *   «Olazábal 2649» = «olazabal  2649».
 * - Cada cambio queda en `motor_cambio` (solo se agregan filas).
 * - Borrar pregunta qué hacer con los asociados: borrarlos también o dejarlos
 *   con la relación vacía. Los objetos del núcleo nunca se borran en cadena.
 */

export type Actor = {
  tipo: "usuario" | "agente" | "importacion" | "sistema";
  id?: string | null;
  /** Una importación de CSV comparte el lote. */
  loteId?: string | null;
};

export type Registro = {
  id: string;
  titulo: string;
  valores: Record<string, Valor>;
  /** Clave de la relación uno a muchos que llega a este objeto → id del padre. */
  padres: Record<string, string | null>;
  creadoEn: Date | null;
};

export type CodigoError =
  | "objeto_desconocido"
  | "no_encontrado"
  | "invalido"
  | "duplicado"
  | "padre_desconocido"
  | "en_uso";

export class MotorError extends Error {
  constructor(
    readonly codigo: CodigoError,
    message: string,
    readonly detalles: string[] = []
  ) {
    super(message);
    this.name = "MotorError";
  }
}

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Ejecutor = Db | Tx;
type Fila = Record<string, unknown>;

/** Identificador SQL (ya validado por la configuración), como fragmento. */
const id = (nombre: string): SQL => sql`${sql.identifier(nombre)}`;

// ── Metadatos ───────────────────────────────────────────────────────────────

function objetoDe(motor: Motor, clave: string): ObjetoMeta {
  const o = motor.objetos.get(clave);
  if (!o) throw new MotorError("objeto_desconocido", `No existe el objeto «${clave}»`);
  return o;
}

/** Relaciones uno a muchos que llegan a este objeto (sus padres). */
function relacionesPadre(motor: Motor, objeto: ObjetoMeta): RelacionMeta[] {
  return motor.relaciones.filter((r) => r.tipo === "uno_a_muchos" && r.hacia === objeto.clave && r.columna);
}

/** Relaciones uno a muchos que salen de este objeto (sus hijos). */
function relacionesHijo(motor: Motor, objeto: ObjetoMeta): RelacionMeta[] {
  return motor.relaciones.filter((r) => r.tipo === "uno_a_muchos" && r.desde === objeto.clave && r.columna);
}

function camposConColumna(objeto: ObjetoMeta): (CampoMeta & { columna: string })[] {
  return objeto.campos.filter((c): c is CampoMeta & { columna: string } => c.columna !== null);
}

// ── Lectura ─────────────────────────────────────────────────────────────────

/** Valor de la base → valor del motor (numeric y bigint llegan como texto). */
function desdeBase(campo: CampoMeta, v: unknown): Valor {
  if (v === null || v === undefined) return null;
  switch (campo.tipo) {
    case "numero":
    case "moneda":
      return Number(v);
    case "booleano":
      return Boolean(v);
    case "fecha":
      return v instanceof Date ? v : new Date(String(v));
    case "seleccion_multiple":
      return Array.isArray(v) ? v.map(String) : null;
    default:
      return String(v);
  }
}

/** Valor del motor → parámetro SQL. */
function aBase(campo: CampoMeta, v: Valor): SQL {
  if (v === null) return sql`NULL`;
  if (campo.tipo === "seleccion_multiple") return sql`${JSON.stringify(v)}::jsonb`;
  return sql`${v}`;
}

function aRegistro(motor: Motor, objeto: ObjetoMeta, fila: Fila): Registro {
  const valores: Record<string, Valor> = {};
  for (const c of camposConColumna(objeto)) valores[c.clave] = desdeBase(c, fila[c.columna]);
  for (const c of objeto.campos) {
    if (c.calculo && "suma" in c.calculo) valores[c.clave] = calcularSuma(c.calculo.suma, valores);
  }
  const padres: Record<string, string | null> = {};
  for (const r of relacionesPadre(motor, objeto)) {
    const v = fila[r.columna as string];
    padres[r.clave] = v === null || v === undefined ? null : String(v);
  }
  const creado = fila.created_at;
  return {
    id: String(fila.id),
    titulo: armarTitulo(objeto.titulo, valores),
    valores,
    padres,
    creadoEn: creado instanceof Date ? creado : null,
  };
}

function columnasSelect(motor: Motor, objeto: ObjetoMeta): SQL {
  const cols = new Set<string>(["id"]);
  for (const c of camposConColumna(objeto)) cols.add(c.columna);
  for (const r of relacionesPadre(motor, objeto)) cols.add(r.columna as string);
  if (objeto.columnas.has("created_at")) cols.add("created_at");
  return sql.join(
    [...cols].map((c) => id(c)),
    sql`, `
  );
}

const AGREGADO: Record<string, string> = {
  minimo: "min",
  maximo: "max",
  suma: "sum",
  promedio: "avg",
};

/** Completa los campos calculados por resumen de una relación, para varios registros a la vez. */
async function completarResumenes(
  ex: Ejecutor,
  organizationId: string,
  motor: Motor,
  objeto: ObjetoMeta,
  registros: Registro[]
): Promise<void> {
  if (!registros.length) return;
  const ids = sql.join(
    registros.map((r) => sql`${r.id}`),
    sql`, `
  );
  for (const campo of objeto.campos) {
    if (!campo.calculo || !("resumen" in campo.calculo)) continue;
    const { relacion, campo: campoHijo, operacion, filtro } = campo.calculo.resumen;
    const r = motor.relaciones.find((x) => x.clave === relacion && x.desde === objeto.clave);
    if (!r) continue;
    const hijo = motor.objetos.get(r.hacia);
    const tablaHijo = hijo?.tabla ?? tablaNucleo(r.hacia);
    if (!tablaHijo) continue;

    let expr: SQL;
    if (operacion === "cantidad") expr = sql`count(*)`;
    else {
      const col = hijo?.campos.find((c) => c.clave === campoHijo)?.columna;
      if (!col) continue;
      expr = sql`${sql.raw(AGREGADO[operacion] ?? "min")}(h.${id(col)})`;
    }

    const condiciones: SQL[] = [];
    for (const [clave, valores] of Object.entries(filtro ?? {})) {
      const col = hijo?.campos.find((c) => c.clave === clave)?.columna;
      if (!col || !valores.length) continue;
      condiciones.push(
        sql`CAST(h.${id(col)} AS text) IN (${sql.join(
          valores.map((v) => sql`${v}`),
          sql`, `
        )})`
      );
    }
    const extra = condiciones.length ? sql` AND ${sql.join(condiciones, sql` AND `)}` : sql``;

    let filas: { k: string; v: unknown }[];
    if (r.tipo === "uno_a_muchos") {
      const fk = id(r.columna as string);
      filas = (await ex.execute(
        sql`SELECT h.${fk} AS k, ${expr} AS v FROM ${id(tablaHijo)} h
            WHERE h.organization_id = ${organizationId} AND h.${fk} IN (${ids})${extra}
            GROUP BY h.${fk}`
      )) as unknown as { k: string; v: unknown }[];
    } else {
      const jd = id(r.columnaDesde);
      const jh = id(r.columnaHacia);
      filas = (await ex.execute(
        sql`SELECT j.${jd} AS k, ${expr} AS v FROM ${id(r.tabla as string)} j
            JOIN ${id(tablaHijo)} h ON h.id = j.${jh}
            WHERE j.organization_id = ${organizationId} AND j.${jd} IN (${ids})${extra}
            GROUP BY j.${jd}`
      )) as unknown as { k: string; v: unknown }[];
    }
    const porId = new Map(filas.map((f) => [String(f.k), f.v] as const));
    for (const reg of registros) {
      const v = porId.get(reg.id);
      reg.valores[campo.clave] =
        v === null || v === undefined ? (operacion === "cantidad" ? 0 : null) : Number(v);
    }
  }
}

export type OpcionesListado = {
  /** Texto a buscar en el título. */
  busqueda?: string;
  /** Campo de selección o booleano → valores aceptados. */
  filtros?: Record<string, string[]>;
  /** Solo los hijos de un registro: la relación uno a muchos y el id del padre. */
  padre?: { relacion: string; id: string };
  limite?: number;
  desde?: number;
};

function condicionesListado(motor: Motor, objeto: ObjetoMeta, op: OpcionesListado): SQL[] {
  const out: SQL[] = [];
  if (op.busqueda?.trim()) {
    const partes = objeto.titulo
      .map((t) => objeto.campos.find((c) => c.clave === t)?.columna)
      .filter((c): c is string => Boolean(c))
      .map((c) => sql`coalesce(CAST(${id(c)} AS text), '')`);
    if (partes.length) {
      out.push(sql`concat(${sql.join(partes, sql`, `)}) ILIKE ${`%${op.busqueda.trim().replace(/[%_\\]/g, (m) => `\\${m}`)}%`}`);
    }
  }
  for (const [clave, valores] of Object.entries(op.filtros ?? {})) {
    const c = objeto.campos.find((x) => x.clave === clave);
    if (!c?.columna || !valores.length) continue;
    const lista = sql.join(
      valores.map((v) => sql`${v}`),
      sql`, `
    );
    if (c.tipo === "seleccion_multiple") out.push(sql`jsonb_exists_any(${id(c.columna)}, ARRAY[${lista}]::text[])`);
    else out.push(sql`CAST(${id(c.columna)} AS text) IN (${lista})`);
  }
  if (op.padre) {
    const r = relacionesPadre(motor, objeto).find((x) => x.clave === op.padre?.relacion);
    if (!r) throw new MotorError("invalido", `«${op.padre.relacion}» no es un padre de «${objeto.clave}»`);
    out.push(sql`${id(r.columna as string)} = ${op.padre.id}`);
  }
  return out;
}

export async function listarRegistros(
  organizationId: string,
  objetoClave: string,
  op: OpcionesListado = {}
): Promise<{ registros: Registro[]; total: number }> {
  const db = getDb();
  const motor = await cargarMotor(organizationId);
  const objeto = objetoDe(motor, objetoClave);
  const condiciones = condicionesListado(motor, objeto, op);
  const donde = sql.join([sql`organization_id = ${organizationId}`, ...condiciones], sql` AND `);
  const orden = objeto.columnas.has("created_at") ? sql`created_at DESC, id` : sql`id`;
  const limite = Math.min(Math.max(op.limite ?? 100, 1), 1000);
  const desde = Math.max(op.desde ?? 0, 0);

  const filas = (await db.execute(
    sql`SELECT ${columnasSelect(motor, objeto)} FROM ${id(objeto.tabla)}
        WHERE ${donde} ORDER BY ${orden} LIMIT ${limite} OFFSET ${desde}`
  )) as unknown as Fila[];
  const [cuenta] = (await db.execute(
    sql`SELECT count(*) AS n FROM ${id(objeto.tabla)} WHERE ${donde}`
  )) as unknown as { n: unknown }[];

  const registros = filas.map((f) => aRegistro(motor, objeto, f));
  await completarResumenes(db, organizationId, motor, objeto, registros);
  return { registros, total: Number(cuenta?.n ?? 0) };
}

async function leerUno(
  ex: Ejecutor,
  organizationId: string,
  motor: Motor,
  objeto: ObjetoMeta,
  registroId: string
): Promise<Registro | null> {
  const [fila] = (await ex.execute(
    sql`SELECT ${columnasSelect(motor, objeto)} FROM ${id(objeto.tabla)}
        WHERE organization_id = ${organizationId} AND id = ${registroId}`
  )) as unknown as Fila[];
  if (!fila) return null;
  const reg = aRegistro(motor, objeto, fila);
  await completarResumenes(ex, organizationId, motor, objeto, [reg]);
  return reg;
}

export async function obtenerRegistro(
  organizationId: string,
  objetoClave: string,
  registroId: string
): Promise<Registro> {
  const motor = await cargarMotor(organizationId);
  const objeto = objetoDe(motor, objetoClave);
  const reg = await leerUno(getDb(), organizationId, motor, objeto, registroId);
  if (!reg) throw new MotorError("no_encontrado", `No existe ese registro de «${objeto.nombre}»`);
  return reg;
}

/**
 * Varios registros por id, de una (sin campos calculados por resumen): para
 * las estadísticas, que solo necesitan título, campos y padres.
 */
export async function registrosPorIds(
  organizationId: string,
  motor: Motor,
  objetoClave: string,
  ids: string[]
): Promise<Registro[]> {
  const objeto = objetoDe(motor, objetoClave);
  const unicos = [...new Set(ids)];
  if (!unicos.length) return [];
  const out: Registro[] = [];
  for (let i = 0; i < unicos.length; i += 1000) {
    const lote = unicos.slice(i, i + 1000);
    const filas = (await getDb().execute(
      sql`SELECT ${columnasSelect(motor, objeto)} FROM ${id(objeto.tabla)}
          WHERE organization_id = ${organizationId} AND id IN (${sql.join(
            lote.map((x) => sql`${x}`),
            sql`, `
          )})`
    )) as unknown as Fila[];
    out.push(...filas.map((f) => aRegistro(motor, objeto, f)));
  }
  return out;
}

/** Cuántos registros cuelgan de este, por relación: para la ventana de borrar. */
export async function contarAsociados(
  organizationId: string,
  objetoClave: string,
  registroId: string
): Promise<{ relacion: string; objeto: string; nombre: string; cantidad: number }[]> {
  const db = getDb();
  const motor = await cargarMotor(organizationId);
  const objeto = objetoDe(motor, objetoClave);
  const out: { relacion: string; objeto: string; nombre: string; cantidad: number }[] = [];
  for (const r of relacionesHijo(motor, objeto)) {
    const hijo = motor.objetos.get(r.hacia);
    if (!hijo) continue;
    const [fila] = (await db.execute(
      sql`SELECT count(*) AS n FROM ${id(hijo.tabla)}
          WHERE organization_id = ${organizationId} AND ${id(r.columna as string)} = ${registroId}`
    )) as unknown as { n: unknown }[];
    out.push({ relacion: r.clave, objeto: hijo.clave, nombre: r.nombreDesde, cantidad: Number(fila?.n ?? 0) });
  }
  return out;
}

export async function historialRegistro(organizationId: string, objetoClave: string, registroId: string) {
  return getDb()
    .select()
    .from(schema.motorCambio)
    .where(
      scoped(
        schema.motorCambio.organizationId,
        organizationId,
        and(sql`${schema.motorCambio.objeto} = ${objetoClave}`, sql`${schema.motorCambio.registroId} = ${registroId}`)
      )
    )
    .orderBy(desc(schema.motorCambio.createdAt));
}

// ── Escritura ───────────────────────────────────────────────────────────────

export type Entrada = {
  /** Clave del campo → valor (texto del CSV, de un formulario o ya tipado). */
  valores?: Record<string, unknown>;
  /** Clave de la relación padre → id del padre (null la vacía). */
  padres?: Record<string, string | null>;
};

/** Convierte y valida la entrada. Junta todos los errores antes de fallar. */
function prepararEntrada(
  motor: Motor,
  objeto: ObjetoMeta,
  entrada: Entrada,
  completa: boolean
): { valores: Record<string, Valor>; padres: Record<string, string | null> } {
  const errores: string[] = [];
  const valores: Record<string, Valor> = {};
  const recibidos = entrada.valores ?? {};
  for (const clave of Object.keys(recibidos)) {
    const c = objeto.campos.find((x) => x.clave === clave);
    if (!c) errores.push(`«${clave}» no es un campo de «${objeto.nombre}»`);
    else if (!c.columna) errores.push(`«${c.nombre}» es calculado: no se escribe`);
  }
  for (const c of camposConColumna(objeto)) {
    if (!(c.clave in recibidos)) {
      if (completa && c.obligatorio) errores.push(`«${c.nombre}» es obligatorio`);
      continue;
    }
    const r = convertir(c, recibidos[c.clave]);
    if (r.ok) valores[c.clave] = r.valor;
    else errores.push(r.error);
  }

  const padres: Record<string, string | null> = {};
  const relaciones = relacionesPadre(motor, objeto);
  const recibidosPadres = entrada.padres ?? {};
  for (const clave of Object.keys(recibidosPadres)) {
    if (!relaciones.some((r) => r.clave === clave)) errores.push(`«${clave}» no es un padre de «${objeto.nombre}»`);
  }
  for (const r of relaciones) {
    if (!(r.clave in recibidosPadres)) {
      if (completa && r.obligatoria) errores.push(`Falta «${r.nombreHacia}»`);
      continue;
    }
    const v = recibidosPadres[r.clave];
    if ((v === null || v === undefined || v === "") && r.obligatoria) errores.push(`Falta «${r.nombreHacia}»`);
    padres[r.clave] = v ? String(v) : null;
  }

  if (errores.length) throw new MotorError("invalido", errores[0] ?? "Datos inválidos", errores);
  return { valores, padres };
}

async function verificarPadres(
  ex: Ejecutor,
  organizationId: string,
  motor: Motor,
  objeto: ObjetoMeta,
  padres: Record<string, string | null>
): Promise<void> {
  for (const r of relacionesPadre(motor, objeto)) {
    const padreId = padres[r.clave];
    if (!padreId) continue;
    const padre = motor.objetos.get(r.desde);
    const tabla = padre?.tabla ?? tablaNucleo(r.desde);
    if (!tabla) continue;
    const [fila] = (await ex.execute(
      sql`SELECT 1 AS ok FROM ${id(tabla)} WHERE organization_id = ${organizationId} AND id = ${padreId}`
    )) as unknown as { ok: number }[];
    if (!fila) throw new MotorError("padre_desconocido", `No existe ese «${r.nombreHacia}»`);
  }
}

/** El título no puede quedar vacío ni repetirse en su alcance. */
async function verificarTitulo(
  ex: Ejecutor,
  organizationId: string,
  motor: Motor,
  objeto: ObjetoMeta,
  valores: Record<string, Valor>,
  padres: Record<string, string | null>,
  excluirId: string | null
): Promise<string> {
  const titulo = armarTitulo(objeto.titulo, valores);
  if (!titulo.trim()) throw new MotorError("invalido", `El nombre de «${objeto.nombre}» no puede quedar vacío`);

  const condiciones: SQL[] = [sql`organization_id = ${organizationId}`];
  if (excluirId) condiciones.push(sql`id <> ${excluirId}`);
  if (objeto.tituloUnicoDentroDe) {
    const r = relacionesPadre(motor, objeto).find((x) => x.clave === objeto.tituloUnicoDentroDe);
    if (r) {
      const padreId = padres[r.clave];
      condiciones.push(
        padreId ? sql`${id(r.columna as string)} = ${padreId}` : sql`${id(r.columna as string)} IS NULL`
      );
    }
  }
  const cols = objeto.titulo
    .map((t) => objeto.campos.find((c) => c.clave === t))
    .filter((c): c is CampoMeta & { columna: string } => Boolean(c?.columna));
  if (!cols.length) return titulo;
  const filas = (await ex.execute(
    sql`SELECT ${sql.join(
      cols.map((c) => id(c.columna)),
      sql`, `
    )} FROM ${id(objeto.tabla)} WHERE ${sql.join(condiciones, sql` AND `)}`
  )) as unknown as Fila[];
  const buscado = normalizar(titulo);
  for (const f of filas) {
    const otros: Record<string, Valor> = {};
    for (const c of cols) otros[c.clave] = desdeBase(c, f[c.columna]);
    if (normalizar(armarTitulo(objeto.titulo, otros)) === buscado) {
      throw new MotorError("duplicado", `Ya existe «${titulo}» en ${objeto.nombrePlural}`);
    }
  }
  return titulo;
}

async function anotar(
  ex: Ejecutor,
  organizationId: string,
  objeto: ObjetoMeta,
  registroId: string,
  titulo: string,
  actor: Actor,
  cambios: { accion: "creado" | "actualizado" | "borrado"; campo?: string; antes?: unknown; despues?: unknown }[]
): Promise<void> {
  if (!cambios.length) return;
  await ex.insert(schema.motorCambio).values(
    cambios.map((c) => ({
      id: newId("motorCambio"),
      organizationId,
      objeto: objeto.clave,
      registroId,
      titulo,
      accion: c.accion,
      campo: c.campo ?? null,
      antes: c.antes === undefined ? null : c.antes,
      despues: c.despues === undefined ? null : c.despues,
      actorTipo: actor.tipo,
      actorId: actor.id ?? null,
      loteId: actor.loteId ?? null,
    }))
  );
}

function enJson(valores: Record<string, Valor>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(valores)) out[k] = v instanceof Date ? v.toISOString() : v;
  return out;
}

export async function crearRegistro(
  organizationId: string,
  objetoClave: string,
  entrada: Entrada,
  actor: Actor
): Promise<Registro> {
  const db = getDb();
  const motor = await cargarMotor(organizationId);
  const objeto = objetoDe(motor, objetoClave);
  const { valores, padres } = prepararEntrada(motor, objeto, entrada, true);

  return db.transaction(async (tx) => {
    await verificarPadres(tx, organizationId, motor, objeto, padres);
    const titulo = await verificarTitulo(tx, organizationId, motor, objeto, valores, padres, null);
    const nuevoId = newId("registro");

    const cols: SQL[] = [id("id"), id("organization_id")];
    const vals: SQL[] = [sql`${nuevoId}`, sql`${organizationId}`];
    for (const c of camposConColumna(objeto)) {
      if (!(c.clave in valores)) continue;
      cols.push(id(c.columna));
      vals.push(aBase(c, valores[c.clave] ?? null));
    }
    for (const r of relacionesPadre(motor, objeto)) {
      if (!(r.clave in padres)) continue;
      cols.push(id(r.columna as string));
      vals.push(sql`${padres[r.clave] ?? null}`);
    }
    try {
      await tx.execute(
        sql`INSERT INTO ${id(objeto.tabla)} (${sql.join(cols, sql`, `)}) VALUES (${sql.join(vals, sql`, `)})`
      );
    } catch (err) {
      throw traducirErrorBase(err, objeto);
    }
    await anotar(tx, organizationId, objeto, nuevoId, titulo, actor, [
      { accion: "creado", despues: { ...enJson(valores), padres } },
    ]);
    const creado = await leerUno(tx, organizationId, motor, objeto, nuevoId);
    if (!creado) throw new MotorError("no_encontrado", "El registro no quedó guardado");
    return creado;
  });
}

export async function actualizarRegistro(
  organizationId: string,
  objetoClave: string,
  registroId: string,
  entrada: Entrada,
  actor: Actor
): Promise<Registro> {
  const db = getDb();
  const motor = await cargarMotor(organizationId);
  const objeto = objetoDe(motor, objetoClave);
  const cambio = prepararEntrada(motor, objeto, entrada, false);

  return db.transaction(async (tx) => {
    const actual = await leerUno(tx, organizationId, motor, objeto, registroId);
    if (!actual) throw new MotorError("no_encontrado", `No existe ese registro de «${objeto.nombre}»`);

    const sets: SQL[] = [];
    const anotaciones: { accion: "actualizado"; campo: string; antes: unknown; despues: unknown }[] = [];
    const valores: Record<string, Valor> = { ...actual.valores };
    for (const c of camposConColumna(objeto)) {
      if (!(c.clave in cambio.valores)) continue;
      const nuevo = cambio.valores[c.clave] ?? null;
      if (mismoValor(actual.valores[c.clave], nuevo)) continue;
      valores[c.clave] = nuevo;
      sets.push(sql`${id(c.columna)} = ${aBase(c, nuevo)}`);
      anotaciones.push({
        accion: "actualizado",
        campo: c.clave,
        antes: enJson({ v: actual.valores[c.clave] ?? null }).v,
        despues: enJson({ v: nuevo }).v,
      });
    }
    const padres = { ...actual.padres };
    for (const r of relacionesPadre(motor, objeto)) {
      if (!(r.clave in cambio.padres)) continue;
      const nuevo = cambio.padres[r.clave] ?? null;
      if ((actual.padres[r.clave] ?? null) === nuevo) continue;
      padres[r.clave] = nuevo;
      sets.push(sql`${id(r.columna as string)} = ${nuevo}`);
      anotaciones.push({ accion: "actualizado", campo: r.clave, antes: actual.padres[r.clave] ?? null, despues: nuevo });
    }
    if (!sets.length) return actual;

    await verificarPadres(tx, organizationId, motor, objeto, cambio.padres);
    const titulo = await verificarTitulo(tx, organizationId, motor, objeto, valores, padres, registroId);
    if (objeto.columnas.has("updated_at")) sets.push(sql`updated_at = now()`);
    try {
      await tx.execute(
        sql`UPDATE ${id(objeto.tabla)} SET ${sql.join(sets, sql`, `)}
            WHERE organization_id = ${organizationId} AND id = ${registroId}`
      );
    } catch (err) {
      throw traducirErrorBase(err, objeto);
    }
    await anotar(tx, organizationId, objeto, registroId, titulo, actor, anotaciones);
    const leido = await leerUno(tx, organizationId, motor, objeto, registroId);
    if (!leido) throw new MotorError("no_encontrado", "El registro desapareció");
    return leido;
  });
}

export type ModoBorrado = "cascada" | "soltar";

async function borrarEn(
  tx: Tx,
  organizationId: string,
  motor: Motor,
  objeto: ObjetoMeta,
  registroId: string,
  modo: ModoBorrado,
  actor: Actor,
  profundidad: number
): Promise<number> {
  if (profundidad > 10) throw new MotorError("invalido", "Demasiados niveles de registros asociados");
  const actual = await leerUno(tx, organizationId, motor, objeto, registroId);
  if (!actual) throw new MotorError("no_encontrado", `No existe ese registro de «${objeto.nombre}»`);
  let borrados = 0;

  // Hijos: objetos del cliente (el núcleo nunca es hijo en uno a muchos).
  for (const r of relacionesHijo(motor, objeto)) {
    const hijo = motor.objetos.get(r.hacia);
    if (!hijo) continue;
    const fk = id(r.columna as string);
    if (modo === "cascada") {
      const hijos = (await tx.execute(
        sql`SELECT id FROM ${id(hijo.tabla)} WHERE organization_id = ${organizationId} AND ${fk} = ${registroId}`
      )) as unknown as { id: string }[];
      for (const h of hijos) {
        borrados += await borrarEn(tx, organizationId, motor, hijo, String(h.id), modo, actor, profundidad + 1);
      }
    } else {
      await tx.execute(
        sql`UPDATE ${id(hijo.tabla)} SET ${fk} = NULL WHERE organization_id = ${organizationId} AND ${fk} = ${registroId}`
      );
    }
  }

  // Las filas de muchos a muchos se van solas (ON DELETE CASCADE de la tabla
  // intermedia): la oportunidad del otro lado queda, sin esta relación.
  try {
    await tx.execute(
      sql`DELETE FROM ${id(objeto.tabla)} WHERE organization_id = ${organizationId} AND id = ${registroId}`
    );
  } catch (err) {
    throw traducirErrorBase(err, objeto);
  }
  await anotar(tx, organizationId, objeto, registroId, actual.titulo, actor, [
    { accion: "borrado", antes: { ...enJson(actual.valores), padres: actual.padres }, despues: { modo } },
  ]);
  return borrados + 1;
}

/** Borra un registro. Devuelve cuántos registros se borraron en total. */
export async function borrarRegistro(
  organizationId: string,
  objetoClave: string,
  registroId: string,
  modo: ModoBorrado,
  actor: Actor
): Promise<number> {
  const motor = await cargarMotor(organizationId);
  const objeto = objetoDe(motor, objetoClave);
  return getDb().transaction((tx) => borrarEn(tx, organizationId, motor, objeto, registroId, modo, actor, 0));
}

/** Errores de Postgres que el usuario puede entender. */
function traducirErrorBase(err: unknown, objeto: ObjetoMeta): unknown {
  const codigo = (err as { code?: string } | null)?.code;
  if (codigo === "23503") {
    return new MotorError("en_uso", `Este registro de «${objeto.nombre}» está en uso en otra parte del CRM`);
  }
  if (codigo === "23505") return new MotorError("duplicado", `Ya existe un registro igual en ${objeto.nombrePlural}`);
  if (codigo === "23502") {
    const columna = (err as { column_name?: string }).column_name;
    return new MotorError(
      "invalido",
      `Falta un dato obligatorio de la tabla${columna ? ` («${columna}»)` : ""} que la configuración no describe`
    );
  }
  return err;
}
