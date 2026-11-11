import { sql, type SQL } from "drizzle-orm";
import { getDb } from "@/lib/db";
import type { ObjetoDto, RegistroDto } from "@/lib/motor/dto";
import { aDto, describirObjeto } from "./api";
import { recalcularPorRegistro, recalcularValor, relacionDeInteres } from "./interes";
import { cargarMotor, type Motor, type RelacionMeta, type ReglaMeta } from "./metadatos";
import { actualizarRegistro, MotorError, obtenerRegistro, type Actor } from "./registros";

/**
 * Motor — la oportunidad (núcleo) y los objetos del cliente (paso 5).
 *
 * Una oportunidad se vincula con registros por relaciones muchos a muchos
 * definidas en la configuración (oportunidad ↔ unidades, ↔ tratamientos). Las
 * reglas de etapa cambian un campo de los vinculados cuando la oportunidad
 * avanza: con uno solo se aplican solas; con varios, se pregunta cuáles.
 *
 * La oportunidad nunca se borra por un objeto: si se borra un registro, la
 * tabla intermedia suelta el vínculo y la oportunidad queda.
 */

const id = (nombre: string): SQL => sql`${sql.identifier(nombre)}`;

function relacionesDeOportunidad(motor: Motor): RelacionMeta[] {
  return motor.relaciones.filter(
    (r) => r.tipo === "muchos_a_muchos" && r.desde === "oportunidad" && r.tabla && motor.objetos.has(r.hacia)
  );
}

async function existeOportunidad(organizationId: string, oportunidadId: string): Promise<boolean> {
  const [fila] = (await getDb().execute(
    sql`SELECT 1 AS ok FROM oportunidad WHERE organization_id = ${organizationId} AND id = ${oportunidadId}`
  )) as unknown as { ok: number }[];
  return Boolean(fila);
}

async function idsVinculados(organizationId: string, r: RelacionMeta, oportunidadId: string): Promise<string[]> {
  const filas = (await getDb().execute(
    sql`SELECT ${id(r.columnaHacia)} AS id FROM ${id(r.tabla as string)}
        WHERE organization_id = ${organizationId} AND ${id(r.columnaDesde)} = ${oportunidadId}`
  )) as unknown as { id: string }[];
  return filas.map((f) => String(f.id));
}

export type VinculoDto = {
  relacion: string;
  nombre: string;
  objeto: ObjetoDto;
  registros: RegistroDto[];
  /**
   * La relación adopta los edificios de interés del núcleo
   * (`oportunidad_edificio`): la página ya los muestra como «Interés».
   */
  esInteres: boolean;
};

/** Lo que una oportunidad tiene vinculado, por relación. Sin configuración: nada. */
export async function vinculosDeOportunidad(organizationId: string, oportunidadId: string): Promise<VinculoDto[]> {
  const motor = await cargarMotor(organizationId);
  const out: VinculoDto[] = [];
  for (const r of relacionesDeOportunidad(motor)) {
    const objeto = motor.objetos.get(r.hacia);
    if (!objeto) continue;
    const registros: RegistroDto[] = [];
    for (const rid of await idsVinculados(organizationId, r, oportunidadId)) {
      const reg = await obtenerRegistro(organizationId, r.hacia, rid).catch(() => null);
      if (reg) registros.push(aDto(reg));
    }
    out.push({
      relacion: r.clave,
      nombre: r.nombreDesde,
      objeto: describirObjeto(motor, objeto),
      registros,
      esInteres: r.tabla === "oportunidad_edificio",
    });
  }
  return out;
}

/** Deja vinculados exactamente estos registros (agrega los nuevos, suelta los que ya no están). */
export async function vincularOportunidad(
  organizationId: string,
  oportunidadId: string,
  relacion: string,
  registroIds: string[]
): Promise<void> {
  const motor = await cargarMotor(organizationId);
  const r = relacionesDeOportunidad(motor).find((x) => x.clave === relacion);
  if (!r) throw new MotorError("invalido", `«${relacion}» no es una relación de la oportunidad`);
  if (!(await existeOportunidad(organizationId, oportunidadId))) {
    throw new MotorError("no_encontrado", "No existe esa oportunidad");
  }
  const objeto = motor.objetos.get(r.hacia);
  if (!objeto) throw new MotorError("objeto_desconocido", `No existe el objeto «${r.hacia}»`);
  const pedidos = [...new Set(registroIds)];
  if (pedidos.length) {
    const encontrados = (await getDb().execute(
      sql`SELECT id FROM ${id(objeto.tabla)} WHERE organization_id = ${organizationId} AND id IN (${sql.join(
        pedidos.map((x) => sql`${x}`),
        sql`, `
      )})`
    )) as unknown as { id: string }[];
    if (encontrados.length !== pedidos.length) {
      throw new MotorError("padre_desconocido", `Alguno de esos registros de «${objeto.nombrePlural}» no existe`);
    }
  }

  const actuales = await idsVinculados(organizationId, r, oportunidadId);
  const tabla = id(r.tabla as string);
  const cd = id(r.columnaDesde);
  const ch = id(r.columnaHacia);
  await getDb().transaction(async (tx) => {
    const sacar = actuales.filter((x) => !pedidos.includes(x));
    if (sacar.length) {
      await tx.execute(
        sql`DELETE FROM ${tabla} WHERE organization_id = ${organizationId} AND ${cd} = ${oportunidadId}
            AND ${ch} IN (${sql.join(
              sacar.map((x) => sql`${x}`),
              sql`, `
            )})`
      );
    }
    for (const nuevo of pedidos.filter((x) => !actuales.includes(x))) {
      await tx.execute(
        sql`INSERT INTO ${tabla} (organization_id, ${cd}, ${ch}) VALUES (${organizationId}, ${oportunidadId}, ${nuevo})
            ON CONFLICT DO NOTHING`
      );
    }
  });
  // Las unidades de interés definen el Valor de la oportunidad.
  if (relacionDeInteres(motor)?.clave === r.clave) await recalcularValor(organizationId, oportunidadId);
}

// ── Reglas de etapa ─────────────────────────────────────────────────────────

export type ReglaPendienteDto = {
  regla: string;
  relacion: string;
  /** «Unidad → Estado: Reservado». */
  descripcion: string;
  /** Los vinculados que todavía no tienen el valor. */
  candidatos: { id: string; titulo: string }[];
};

function describirRegla(motor: Motor, g: ReglaMeta): string {
  const r = motor.relaciones.find((x) => x.clave === g.relacion);
  const objeto = r ? motor.objetos.get(r.hacia) : undefined;
  const campo = objeto?.campos.find((c) => c.clave === g.campo);
  const valor = campo?.opciones?.find((o) => o.valor === String(g.valor))?.nombre ?? String(g.valor);
  return `${objeto?.nombre ?? g.relacion} → ${campo?.nombre ?? g.campo}: ${valor}`;
}

async function candidatos(
  organizationId: string,
  motor: Motor,
  g: ReglaMeta,
  oportunidadId: string
): Promise<{ id: string; titulo: string }[]> {
  const r = relacionesDeOportunidad(motor).find((x) => x.clave === g.relacion);
  if (!r) return [];
  const out: { id: string; titulo: string }[] = [];
  for (const rid of await idsVinculados(organizationId, r, oportunidadId)) {
    const reg = await obtenerRegistro(organizationId, r.hacia, rid).catch(() => null);
    if (reg && String(reg.valores[g.campo] ?? "") !== String(g.valor)) out.push({ id: reg.id, titulo: reg.titulo });
  }
  return out;
}

/** Las reglas de esta etapa que necesitan que alguien elija (más de un candidato). */
export async function reglasPendientes(
  organizationId: string,
  oportunidadId: string,
  etapa: string
): Promise<ReglaPendienteDto[]> {
  const motor = await cargarMotor(organizationId);
  const out: ReglaPendienteDto[] = [];
  for (const g of motor.reglas.filter((x) => x.etapa === etapa)) {
    const lista = await candidatos(organizationId, motor, g, oportunidadId);
    if (lista.length > 1) {
      out.push({ regla: g.clave, relacion: g.relacion, descripcion: describirRegla(motor, g), candidatos: lista });
    }
  }
  return out;
}

/** Aplica una regla a los registros elegidos (tienen que estar vinculados). */
export async function aplicarRegla(
  organizationId: string,
  oportunidadId: string,
  reglaClave: string,
  registroIds: string[],
  actor: Actor
): Promise<number> {
  const motor = await cargarMotor(organizationId);
  const g = motor.reglas.find((x) => x.clave === reglaClave);
  if (!g) throw new MotorError("invalido", `No existe la regla «${reglaClave}»`);
  const r = relacionesDeOportunidad(motor).find((x) => x.clave === g.relacion);
  if (!r) throw new MotorError("invalido", `La regla «${reglaClave}» no tiene relación vigente`);
  const vinculados = await idsVinculados(organizationId, r, oportunidadId);
  let aplicados = 0;
  for (const rid of new Set(registroIds)) {
    if (!vinculados.includes(rid)) throw new MotorError("invalido", "Ese registro no está vinculado a la oportunidad");
    await actualizarRegistro(organizationId, r.hacia, rid, { valores: { [g.campo]: g.valor } }, actor);
    await recalcularPorRegistro(organizationId, r.hacia, rid);
    aplicados++;
  }
  return aplicados;
}

/**
 * Al cambiar de etapa: aplica las reglas que tienen un solo candidato. Las de
 * varios quedan para que una persona elija (`reglasPendientes`). Nunca lanza:
 * una regla que falla no puede frenar el cambio de estado.
 */
export async function aplicarReglasDeEtapa(input: {
  organizationId: string;
  oportunidadId: string;
  etapa: string;
  actor: Actor;
}): Promise<{ aplicadas: string[]; pendientes: string[] }> {
  const aplicadas: string[] = [];
  const pendientes: string[] = [];
  try {
    const motor = await cargarMotor(input.organizationId);
    for (const g of motor.reglas.filter((x) => x.etapa === input.etapa)) {
      const lista = await candidatos(input.organizationId, motor, g, input.oportunidadId);
      if (lista.length === 1 && lista[0]) {
        await aplicarRegla(input.organizationId, input.oportunidadId, g.clave, [lista[0].id], input.actor);
        aplicadas.push(g.clave);
      } else if (lista.length > 1) pendientes.push(g.clave);
    }
  } catch (err) {
    console.error("[motor] no se pudieron aplicar las reglas de etapa:", err);
  }
  return { aplicadas, pendientes };
}
