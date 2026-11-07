import { readFile } from "node:fs/promises";
import path from "node:path";
import { eq, notInArray, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { getEnv } from "@/lib/env";
import {
  columnaDeCampo,
  columnaDeRelacion,
  columnasDeRelacion,
  tablaDeObjeto,
  tablaDeRelacion,
  tieneColumna,
  validarConfig,
  type ConfigCliente,
  type TipoCampo,
} from "@/lib/motor/config";
import { columnasEsperadas, sentenciaSiembra, sentenciasDdl, TIPO_SQL } from "@/lib/motor/ddl";

/**
 * Motor — aplica el archivo de configuración del cliente al arrancar.
 *
 * 1. Lee `CLIENTE_CONFIG` (un archivo dentro de `clientes/`). Sin la variable,
 *    no hace nada: la instancia no tiene objetos personalizados.
 * 2. Valida el archivo. Con errores, avisa en el log y no toca nada.
 * 3. Crea las tablas y columnas de los objetos nuevos (solo agrega).
 * 4. Verifica que las tablas adoptadas tengan las columnas que describe la
 *    configuración. Un objeto adoptado al que le falta algo no se registra.
 * 5. Registra los metadatos en cada organización: crea o actualiza lo que está
 *    en la configuración y ARCHIVA lo que ya no está (nunca borra).
 *
 * Re-ejecutable: correrlo dos veces seguidas no cambia nada. Nunca lanza: un
 * error del motor no puede tumbar el arranque del CRM.
 */

export type ResultadoSincronizacion =
  | { estado: "sin_config" }
  | { estado: "error"; errores: string[] }
  | { estado: "ok"; objetos: number; organizaciones: number; omitidos: string[] };

const CARPETA_CLIENTES = "clientes";

/** Resuelve la ruta del archivo sin dejar que salga de `clientes/`. */
export function rutaConfig(valor: string, raiz = process.cwd()): string | null {
  const carpeta = path.resolve(raiz, CARPETA_CLIENTES);
  const ruta = path.resolve(raiz, valor);
  if (!ruta.startsWith(carpeta + path.sep) || !ruta.endsWith(".json")) return null;
  return ruta;
}

export async function leerConfigCliente(): Promise<
  { estado: "sin_config" } | { estado: "error"; errores: string[] } | { estado: "ok"; config: ConfigCliente }
> {
  const valor = getEnv().CLIENTE_CONFIG;
  if (!valor) return { estado: "sin_config" };
  const ruta = rutaConfig(valor);
  if (!ruta) {
    return { estado: "error", errores: [`CLIENTE_CONFIG=${valor}: tiene que ser un .json dentro de ${CARPETA_CLIENTES}/`] };
  }
  let datos: unknown;
  try {
    datos = JSON.parse(await readFile(ruta, "utf8"));
  } catch (err) {
    return { estado: "error", errores: [`no se pudo leer ${valor}: ${(err as Error).message}`] };
  }
  const r = validarConfig(datos);
  return r.ok ? { estado: "ok", config: r.config } : { estado: "error", errores: r.errores };
}

/** Objetos adoptados cuya tabla no tiene todas las columnas esperadas. */
async function adoptadosIncompletos(config: ConfigCliente): Promise<Map<string, string[]>> {
  const esperadas = columnasEsperadas(config);
  if (esperadas.size === 0) return new Map();
  const db = getDb();
  const filas = (await db.execute(
    sql`select table_name, column_name from information_schema.columns where table_schema = current_schema()`
  )) as unknown as { table_name: string; column_name: string }[];
  const existentes = new Map<string, Set<string>>();
  for (const f of filas) {
    const set = existentes.get(f.table_name) ?? new Set<string>();
    set.add(f.column_name);
    existentes.set(f.table_name, set);
  }
  const faltan = new Map<string, string[]>();
  for (const [tabla, cols] of esperadas) {
    const hay = existentes.get(tabla);
    const falta = hay ? cols.filter((c) => !hay.has(c)) : [`(la tabla «${tabla}» no existe)`];
    if (falta.length) faltan.set(tabla, falta);
  }
  return faltan;
}

async function registrarEnOrganizacion(organizationId: string, config: ConfigCliente): Promise<void> {
  const db = getDb();
  const ahora = new Date();
  await db.transaction(async (tx) => {
    const objetos = config.objetos;
    for (const [orden, o] of objetos.entries()) {
      const [fila] = await tx
        .insert(schema.motorObjeto)
        .values({
          id: newId("motorObjeto"),
          organizationId,
          clave: o.clave,
          nombre: o.nombre,
          nombrePlural: o.nombrePlural,
          icono: o.icono,
          tabla: tablaDeObjeto(o),
          adoptada: Boolean(o.adopta),
          titulo: o.titulo,
          tituloUnicoDentroDe: o.tituloUnicoDentroDe ?? null,
          columnaTitulo: o.columnaTitulo ?? null,
          visibleAgente: o.visibleAgente,
          agente: o.agente ?? null,
          orden,
          archivado: false,
        })
        .onConflictDoUpdate({
          target: [schema.motorObjeto.organizationId, schema.motorObjeto.clave],
          // `visibleAgente` NO se pisa: después del alta lo maneja el administrador.
          set: {
            nombre: o.nombre,
            nombrePlural: o.nombrePlural,
            icono: o.icono,
            tabla: tablaDeObjeto(o),
            adoptada: Boolean(o.adopta),
            titulo: o.titulo,
            tituloUnicoDentroDe: o.tituloUnicoDentroDe ?? null,
          columnaTitulo: o.columnaTitulo ?? null,
            agente: o.agente ?? null,
            orden,
            archivado: false,
            updatedAt: ahora,
          },
        })
        .returning({ id: schema.motorObjeto.id });
      if (!fila) continue;

      for (const [ordenCampo, c] of o.campos.entries()) {
        await tx
          .insert(schema.motorCampo)
          .values({
            id: newId("motorCampo"),
            organizationId,
            objetoId: fila.id,
            clave: c.clave,
            nombre: c.nombre,
            tipo: c.tipo,
            columna: tieneColumna(c.tipo) ? columnaDeCampo(c) : null,
            obligatorio: c.obligatorio,
            opciones: c.opciones ?? null,
            calculo: (c.calculo as Record<string, unknown> | undefined) ?? null,
            visibleLista: c.visibleLista,
            visibleAgente: c.visibleAgente,
            orden: ordenCampo,
            archivado: false,
          })
          .onConflictDoUpdate({
            target: [schema.motorCampo.objetoId, schema.motorCampo.clave],
            // `visibleAgente` del campo tampoco se pisa (ícono de IA por columna).
            set: {
              nombre: c.nombre,
              tipo: c.tipo,
              columna: tieneColumna(c.tipo) ? columnaDeCampo(c) : null,
              obligatorio: c.obligatorio,
              opciones: c.opciones ?? null,
              calculo: (c.calculo as Record<string, unknown> | undefined) ?? null,
              visibleLista: c.visibleLista,
              orden: ordenCampo,
              archivado: false,
              updatedAt: ahora,
            },
          });
      }
      const clavesCampos = o.campos.map((c) => c.clave);
      await tx
        .update(schema.motorCampo)
        .set({ archivado: true, updatedAt: ahora })
        .where(
          scoped(
            schema.motorCampo.organizationId,
            organizationId,
            eq(schema.motorCampo.objetoId, fila.id),
            notInArray(schema.motorCampo.clave, clavesCampos)
          )
        );
    }

    const clavesObjetos = objetos.map((o) => o.clave);
    await tx
      .update(schema.motorObjeto)
      .set({ archivado: true, updatedAt: ahora })
      .where(
        scoped(
          schema.motorObjeto.organizationId,
          organizationId,
          clavesObjetos.length ? notInArray(schema.motorObjeto.clave, clavesObjetos) : undefined
        )
      );

    for (const r of config.relaciones) {
      const valores = {
        desde: r.desde,
        hacia: r.hacia,
        tipo: r.tipo,
        nombreDesde: r.nombreDesde,
        nombreHacia: r.nombreHacia,
        columna: r.tipo === "uno_a_muchos" ? columnaDeRelacion(r) : null,
        tabla: r.tipo === "muchos_a_muchos" ? tablaDeRelacion(r) : null,
        adoptaTabla: r.tipo === "muchos_a_muchos" && r.adoptaTabla,
        columnaDesde: r.tipo === "muchos_a_muchos" ? columnasDeRelacion(r).desde : null,
        columnaHacia: r.tipo === "muchos_a_muchos" ? columnasDeRelacion(r).hacia : null,
        sembrarDesde: r.sembrarDesde ?? null,
        obligatoria: r.obligatoria,
        archivado: false,
      };
      await tx
        .insert(schema.motorRelacion)
        .values({ id: newId("motorRelacion"), organizationId, clave: r.clave, ...valores })
        .onConflictDoUpdate({
          target: [schema.motorRelacion.organizationId, schema.motorRelacion.clave],
          set: { ...valores, updatedAt: ahora },
        });
    }
    for (const g of config.reglasEtapa) {
      const valores = { etapa: g.etapa, relacion: g.relacion, campo: g.campo, valor: g.valor, archivado: false };
      await tx
        .insert(schema.motorRegla)
        .values({ id: newId("motorRegla"), organizationId, clave: g.clave, ...valores })
        .onConflictDoUpdate({
          target: [schema.motorRegla.organizationId, schema.motorRegla.clave],
          set: { ...valores, updatedAt: ahora },
        });
    }
    const clavesReglas = config.reglasEtapa.map((g) => g.clave);
    await tx
      .update(schema.motorRegla)
      .set({ archivado: true, updatedAt: ahora })
      .where(
        scoped(
          schema.motorRegla.organizationId,
          organizationId,
          clavesReglas.length ? notInArray(schema.motorRegla.clave, clavesReglas) : undefined
        )
      );

    const clavesRelaciones = config.relaciones.map((r) => r.clave);
    await tx
      .update(schema.motorRelacion)
      .set({ archivado: true, updatedAt: ahora })
      .where(
        scoped(
          schema.motorRelacion.organizationId,
          organizationId,
          clavesRelaciones.length ? notInArray(schema.motorRelacion.clave, clavesRelaciones) : undefined
        )
      );
  });
}

export async function sincronizarMotor(): Promise<ResultadoSincronizacion> {
  const leida = await leerConfigCliente();
  if (leida.estado !== "ok") return leida;
  return aplicarConfig(leida.config);
}

/**
 * Aplica una configuración ya validada: estructura, metadatos por
 * organización, siembras y valores iniciales. `soloOrganizaciones` limita a
 * cuáles (los tests; el arranque usa todas).
 */
export async function aplicarConfig(
  config: ConfigCliente,
  soloOrganizaciones?: string[]
): Promise<ResultadoSincronizacion> {
  const db = getDb();

  // Estructura de los objetos nuevos: todo o nada.
  const ddl = sentenciasDdl(config);
  if (ddl.length) {
    await db.transaction(async (tx) => {
      for (const s of ddl) await tx.execute(sql.raw(s));
    });
  }

  // Un adoptado incompleto no se registra (sus pantallas leerían columnas que
  // no existen); sus relaciones tampoco.
  const faltan = await adoptadosIncompletos(config);
  const omitidos = config.objetos.filter((o) => o.adopta && faltan.has(o.adopta)).map((o) => o.clave);
  const relacionesOmitidas = config.relaciones
    .filter((r) => r.tipo === "muchos_a_muchos" && r.adoptaTabla && faltan.has(tablaDeRelacion(r)))
    .map((r) => r.clave);
  const relaciones = config.relaciones.filter(
    (r) => !omitidos.includes(r.desde) && !omitidos.includes(r.hacia) && !relacionesOmitidas.includes(r.clave)
  );
  const registrable: ConfigCliente = {
    ...config,
    objetos: config.objetos.filter((o) => !omitidos.includes(o.clave)),
    relaciones,
    reglasEtapa: config.reglasEtapa.filter((g) => relaciones.some((r) => r.clave === g.relacion)),
  };

  const orgs = (await db.select({ id: schema.organization.id }).from(schema.organization)).filter(
    (o) => !soloOrganizaciones || soloOrganizaciones.includes(o.id)
  );
  for (const org of orgs) await registrarEnOrganizacion(org.id, registrable);

  // Siembras de una sola vez (después de registrar: la marca vive en motor_relacion).
  for (const r of registrable.relaciones) {
    const siembra = sentenciaSiembra(r);
    if (!siembra) continue;
    const [hecha] = (await db.execute(
      sql`select 1 as ok from motor_relacion where clave = ${r.clave} and sembrado_at is not null limit 1`
    )) as unknown as { ok: number }[];
    if (hecha) continue;
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(siembra));
      await tx.execute(sql`update motor_relacion set sembrado_at = now() where clave = ${r.clave}`);
    });
    console.log(`[motor] vínculos de «${r.clave}» copiados desde ${r.sembrarDesde?.tabla}.${r.sembrarDesde?.columnaHacia}`);
  }

  // Paso 8 — valores iniciales de columnas nuevas, una vez por organización.
  for (const org of orgs) await completarIniciales(org.id, registrable);

  return {
    estado: "ok",
    objetos: registrable.objetos.length,
    organizaciones: orgs.length,
    omitidos: [
      ...omitidos.map((clave) => {
        const o = config.objetos.find((x) => x.clave === clave);
        const tabla = o?.adopta ?? "";
        return `${clave}: faltan ${(faltan.get(tabla) ?? []).join(", ")}`;
      }),
      ...relacionesOmitidas.map((clave) => {
        const r = config.relaciones.find((x) => x.clave === clave);
        return `${clave}: faltan ${(faltan.get(r ? tablaDeRelacion(r) : "") ?? []).join(", ")}`;
      }),
    ],
  };
}

/**
 * Paso 8 — completa las columnas con `inicial` una sola vez por organización
 * (marca `motor_campo.inicializado_at`) y solo donde están vacías: nunca pisa
 * un dato. Si una falla (un valor que no se puede convertir), se anota en el
 * log, no se marca y el resto sigue.
 */
async function completarIniciales(organizationId: string, config: ConfigCliente): Promise<void> {
  const db = getDb();
  for (const o of config.objetos) {
    const tabla = tablaDeObjeto(o);
    for (const c of o.campos) {
      if (!c.inicial || !tieneColumna(c.tipo)) continue;
      const [campo] = (await db.execute(
        sql`select mc.id, mc.inicializado_at from motor_campo mc
            join motor_objeto mo on mo.id = mc.objeto_id
            where mc.organization_id = ${organizationId} and mo.clave = ${o.clave} and mc.clave = ${c.clave}
            limit 1`
      )) as unknown as { id: string; inicializado_at: Date | null }[];
      if (!campo || campo.inicializado_at) continue;
      const col = columnaDeCampo(c);
      const tipo = sql.raw(TIPO_SQL[c.tipo as Exclude<TipoCampo, "calculado">]);
      let origen: SQL;
      if ("valor" in c.inicial) {
        origen = sql`${String(c.inicial.valor)}`;
      } else {
        let expr: SQL = sql`CAST(${sql.identifier(c.inicial.copiarDe)} AS text)`;
        if (c.inicial.patron) expr = sql`substring(${expr} from ${c.inicial.patron})`;
        const mapa = Object.entries(c.inicial.mapa ?? {});
        if (mapa.length) {
          expr = sql`CASE ${expr} ${sql.join(
            mapa.map(([k, v]) => sql`WHEN ${k} THEN ${String(v)}`),
            sql` `
          )} END`;
        }
        origen = sql`NULLIF(trim(${expr}), '')`;
      }
      try {
        const r = (await db.execute(
          sql`UPDATE ${sql.identifier(tabla)} SET ${sql.identifier(col)} = CAST(${origen} AS ${tipo})
              WHERE organization_id = ${organizationId} AND ${sql.identifier(col)} IS NULL`
        )) as unknown as { count?: number };
        await db.execute(sql`update motor_campo set inicializado_at = now() where id = ${campo.id}`);
        console.log(`[motor] «${o.clave}.${c.clave}» completado${typeof r.count === "number" ? ` en ${r.count} fila(s)` : ""}`);
      } catch (err) {
        console.error(`[motor] no se pudo completar «${o.clave}.${c.clave}»:`, err);
      }
    }
  }
}

/** Para el arranque: corre la sincronización y cuenta el resultado en el log, sin lanzar. */
export async function sincronizarMotorAlArrancar(): Promise<void> {
  try {
    const r = await sincronizarMotor();
    if (r.estado === "sin_config") return;
    if (r.estado === "error") {
      console.error(`[motor] la configuración del cliente tiene errores; no se aplicó:\n  ${r.errores.join("\n  ")}`);
      return;
    }
    console.log(`[motor] ${r.objetos} objeto(s) registrados en ${r.organizaciones} organización(es)`);
    if (r.omitidos.length) {
      console.error(`[motor] objetos adoptados sin registrar:\n  ${r.omitidos.join("\n  ")}`);
    }
  } catch (err) {
    console.error("[motor] no se pudo aplicar la configuración del cliente:", err);
  }
}
