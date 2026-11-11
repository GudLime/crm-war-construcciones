import { sql, type SQL } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { cargarMotor, type Motor, type RelacionMeta } from "./metadatos";
import { listarRegistros, type Registro } from "./registros";
import type { InteresDto, UnidadDeInteresDto } from "@/lib/motor/dto";
import { coincideConInteres, valorDelInteres } from "@/lib/motor/interes";

export type { InteresDto, UnidadDeInteresDto };

/**
 * Motor — el interés encadenado de la oportunidad: Edificio → Ambientes →
 * Unidades, y el Valor calculado.
 *
 * Lo activa `interes` en UNA relación muchos a muchos desde la oportunidad
 * (`clientes/<cliente>.json`, ver `relacionSchema.interes`). Sin eso, nada de
 * este archivo cambia la oportunidad: el Valor sigue siendo a mano.
 *
 * - Se ofrecen los registros de los edificios de interés (núcleo:
 *   `oportunidad_edificio`), con alguno de los ambientes de interés
 *   (`oportunidad_ambiente`; sin ambientes, todos) y en un estado ofrecible.
 * - Al sacar un edificio o un ambiente, se sueltan los registros elegidos que
 *   ya no coinciden (`podarInteres`).
 * - Valor = promedio del campo `valor` de los elegidos; sin elegidos, el de los
 *   ofrecidos de los ambientes de interés; sin ambientes, vacío. Si hay
 *   monedas distintas, se promedian los de la moneda más repetida.
 */

const ident = (nombre: string): SQL => sql`${sql.identifier(nombre)}`;

type Interes = NonNullable<RelacionMeta["interes"]>;
type RelacionConInteres = RelacionMeta & { interes: Interes; tabla: string };

/** La relación de la oportunidad con `interes`, si la configuración tiene una. */
export function relacionDeInteres(motor: Motor): RelacionConInteres | null {
  const r = motor.relaciones.find(
    (x) => x.interes && x.tipo === "muchos_a_muchos" && x.desde === "oportunidad" && x.tabla && motor.objetos.has(x.hacia)
  );
  return r ? (r as RelacionConInteres) : null;
}

function padreEdificio(motor: Motor, r: RelacionConInteres): RelacionMeta | null {
  const p = motor.relaciones.find((x) => x.clave === r.interes.edificio);
  return p && p.tipo === "uno_a_muchos" && p.hacia === r.hacia && p.columna ? p : null;
}

function aNumero(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function aUnidad(r: RelacionConInteres, padre: RelacionMeta | null, reg: Registro): UnidadDeInteresDto {
  const i = r.interes;
  const amb = i.ambientes ? aNumero(reg.valores[i.ambientes]) : null;
  const valor = i.valor ? aNumero(reg.valores[i.valor]) : null;
  const moneda = i.moneda ? reg.valores[i.moneda] : null;
  const estado = i.estado ? reg.valores[i.estado.campo] : null;
  return {
    id: reg.id,
    titulo: reg.titulo,
    edificioId: padre ? (reg.padres[padre.clave] ?? null) : null,
    ambientes: amb === null ? null : Math.round(amb),
    valorCents: valor === null ? null : Math.round(valor),
    moneda: typeof moneda === "string" && moneda.trim() ? moneda.trim() : null,
    ofrecida: !i.estado || i.estado.valores.includes(String(estado ?? "")),
  };
}

async function interesDelNucleo(
  organizationId: string,
  oportunidadId: string
): Promise<{ edificios: string[]; ambientes: number[] }> {
  const db = getDb();
  const edificios = (await db.execute(
    sql`SELECT edificio_id AS id FROM oportunidad_edificio
        WHERE organization_id = ${organizationId} AND oportunidad_id = ${oportunidadId}`
  )) as unknown as { id: string }[];
  const ambientes = (await db.execute(
    sql`SELECT ambientes AS n FROM oportunidad_ambiente
        WHERE organization_id = ${organizationId} AND oportunidad_id = ${oportunidadId}`
  )) as unknown as { n: unknown }[];
  return {
    edificios: edificios.map((e) => String(e.id)),
    ambientes: ambientes.map((a) => Number(a.n)).filter(Number.isFinite),
  };
}

async function idsElegidos(organizationId: string, r: RelacionConInteres, oportunidadId: string): Promise<string[]> {
  const filas = (await getDb().execute(
    sql`SELECT ${ident(r.columnaHacia)} AS id FROM ${ident(r.tabla)}
        WHERE organization_id = ${organizationId} AND ${ident(r.columnaDesde)} = ${oportunidadId}`
  )) as unknown as { id: string }[];
  return filas.map((f) => String(f.id));
}

async function unidadesPorIds(
  organizationId: string,
  r: RelacionConInteres,
  padre: RelacionMeta | null,
  ids: string[]
): Promise<UnidadDeInteresDto[]> {
  if (!ids.length) return [];
  const { registros } = await listarRegistros(organizationId, r.hacia, { ids, limite: 1000 });
  return registros.map((reg) => aUnidad(r, padre, reg));
}

async function unidadesDeEdificios(
  organizationId: string,
  r: RelacionConInteres,
  padre: RelacionMeta | null,
  edificios: string[]
): Promise<UnidadDeInteresDto[]> {
  if (!padre || !edificios.length) return [];
  const { registros } = await listarRegistros(organizationId, r.hacia, {
    padreEn: { relacion: padre.clave, ids: edificios },
    limite: 1000,
  });
  return registros.map((reg) => aUnidad(r, padre, reg));
}

/** Lo que necesita la página de la oportunidad para elegir el interés. Sin `interes` configurado: null. */
export async function opcionesDeInteres(organizationId: string, oportunidadId: string): Promise<InteresDto | null> {
  const motor = await cargarMotor(organizationId);
  const r = relacionDeInteres(motor);
  if (!r) return null;
  const objeto = motor.objetos.get(r.hacia)!;
  const padre = padreEdificio(motor, r);
  const nucleo = await interesDelNucleo(organizationId, oportunidadId);
  const elegidas = await idsElegidos(organizationId, r, oportunidadId);
  const deLosEdificios = await unidadesDeEdificios(organizationId, r, padre, nucleo.edificios);
  const yaEstan = new Set(deLosEdificios.map((u) => u.id));
  const afuera = await unidadesPorIds(
    organizationId,
    r,
    padre,
    elegidas.filter((x) => !yaEstan.has(x))
  );
  const ambientesDisponibles = [
    ...new Set(deLosEdificios.filter((u) => u.ofrecida && u.ambientes !== null).map((u) => u.ambientes as number)),
  ].sort((a, b) => a - b);
  return {
    relacion: r.clave,
    nombre: r.nombreDesde,
    objeto: { clave: objeto.clave, nombre: objeto.nombre, nombrePlural: objeto.nombrePlural },
    ambientesDisponibles,
    unidades: [...deLosEdificios, ...afuera],
    elegidas,
    valorCalculado: Boolean(r.interes.valor),
  };
}

/** Suelta los elegidos que ya no coinciden con los edificios o ambientes de interés. Devuelve cuántos. */
export async function podarInteres(organizationId: string, oportunidadId: string): Promise<number> {
  const motor = await cargarMotor(organizationId);
  const r = relacionDeInteres(motor);
  if (!r) return 0;
  const padre = padreEdificio(motor, r);
  const nucleo = await interesDelNucleo(organizationId, oportunidadId);
  const elegidas = await unidadesPorIds(organizationId, r, padre, await idsElegidos(organizationId, r, oportunidadId));
  const sacar = elegidas.filter((u) => !coincideConInteres(u, nucleo)).map((u) => u.id);
  if (!sacar.length) return 0;
  await getDb().execute(
    sql`DELETE FROM ${ident(r.tabla)} WHERE organization_id = ${organizationId}
        AND ${ident(r.columnaDesde)} = ${oportunidadId}
        AND ${ident(r.columnaHacia)} IN (${sql.join(
          sacar.map((x) => sql`${x}`),
          sql`, `
        )})`
  );
  return sacar.length;
}

/**
 * Recalcula y guarda el Valor de la oportunidad. Sin `interes.valor`: no toca
 * nada. `conservarSiVacio`: si no se puede calcular, deja el que había (lo usa
 * el recálculo al arrancar, para no borrar valores cargados a mano antes).
 */
export async function recalcularValor(
  organizationId: string,
  oportunidadId: string,
  op: { conservarSiVacio?: boolean } = {}
): Promise<void> {
  const motor = await cargarMotor(organizationId);
  const r = relacionDeInteres(motor);
  if (!r?.interes.valor) return;
  const padre = padreEdificio(motor, r);
  const nucleo = await interesDelNucleo(organizationId, oportunidadId);
  const elegidas = await unidadesPorIds(organizationId, r, padre, await idsElegidos(organizationId, r, oportunidadId));
  const deLosEdificios =
    elegidas.some((u) => u.valorCents !== null) || !nucleo.ambientes.length
      ? []
      : await unidadesDeEdificios(organizationId, r, padre, nucleo.edificios);
  const valor = valorDelInteres(elegidas, deLosEdificios, nucleo);
  if (!valor && op.conservarSiVacio) return;
  await getDb().execute(
    sql`UPDATE oportunidad SET valor_cents = ${valor?.valorCents ?? null}, moneda = ${valor?.moneda ?? null}
        WHERE organization_id = ${organizationId} AND id = ${oportunidadId}`
  );
}

/**
 * Después de cambiar el interés de una oportunidad. `podar`: cuando una
 * persona reemplazó edificios o ambientes (sacar puede soltar unidades);
 * sumar (leads, el agente) nunca suelta. Nunca lanza: el interés ya quedó
 * guardado y esto es lo que se deriva de él.
 */
export async function ajustarInteres(
  organizationId: string,
  oportunidadId: string,
  op: { podar: boolean }
): Promise<void> {
  try {
    if (op.podar) await podarInteres(organizationId, oportunidadId);
    await recalcularValor(organizationId, oportunidadId);
  } catch (err) {
    console.error("[motor] no se pudo ajustar el interés de la oportunidad", oportunidadId, err);
  }
}

/**
 * Cambió un registro (su precio, sus ambientes, su estado): recalcula el Valor
 * de las oportunidades que lo eligieron y de las que, sin elegidos, promedian
 * los de su edificio.
 */
export async function recalcularPorRegistro(
  organizationId: string,
  objetoClave: string,
  registroId: string
): Promise<void> {
  try {
    const motor = await cargarMotor(organizationId);
    const r = relacionDeInteres(motor);
    // `objetoClave` puede ser la clave del objeto o su tabla (las pantallas viejas
    // de departamentos editan la tabla adoptada directamente).
    if (!r?.interes.valor || (r.hacia !== objetoClave && motor.objetos.get(r.hacia)?.tabla !== objetoClave)) return;
    const padre = padreEdificio(motor, r);
    const [u] = await unidadesPorIds(organizationId, r, padre, [registroId]);
    const filas = (await getDb().execute(
      sql`SELECT ${ident(r.columnaDesde)} AS id FROM ${ident(r.tabla)}
          WHERE organization_id = ${organizationId} AND ${ident(r.columnaHacia)} = ${registroId}
          UNION
          SELECT oe.oportunidad_id AS id FROM oportunidad_edificio oe
          WHERE oe.organization_id = ${organizationId} AND oe.edificio_id = ${u?.edificioId ?? ""}
            AND NOT EXISTS (
              SELECT 1 FROM ${ident(r.tabla)} t
              WHERE t.organization_id = ${organizationId} AND t.${ident(r.columnaDesde)} = oe.oportunidad_id
            )`
    )) as unknown as { id: string }[];
    for (const f of filas) await recalcularValor(organizationId, String(f.id));
  } catch (err) {
    console.error("[motor] no se pudo recalcular el valor por un cambio de registro", registroId, err);
  }
}

/**
 * Recalcula el Valor de todas las oportunidades con interés (después de una
 * importación de precios, por ejemplo). Nunca lanza.
 */
export async function recalcularTodos(
  organizationId: string,
  op: { conservarSiVacio?: boolean } = {}
): Promise<number> {
  try {
    const motor = await cargarMotor(organizationId);
    const r = relacionDeInteres(motor);
    if (!r?.interes.valor) return 0;
    const filas = (await getDb().execute(
      sql`SELECT ${ident(r.columnaDesde)} AS id FROM ${ident(r.tabla)} WHERE organization_id = ${organizationId}
          UNION
          SELECT oportunidad_id AS id FROM oportunidad_edificio WHERE organization_id = ${organizationId}`
    )) as unknown as { id: string }[];
    for (const f of filas) await recalcularValor(organizationId, String(f.id), op);
    return filas.length;
  } catch (err) {
    console.error("[motor] no se pudieron recalcular los valores", err);
    return 0;
  }
}

/**
 * Al arrancar: recalcula el Valor de las oportunidades de todas las
 * organizaciones (precios que cambiaron por fuera, oportunidades de antes del
 * interés encadenado). Nunca borra un valor que no se pueda calcular.
 */
export async function recalcularValoresAlArrancar(): Promise<void> {
  try {
    const orgs = (await getDb().execute(sql`SELECT id FROM organization`)) as unknown as { id: string }[];
    let total = 0;
    for (const o of orgs) total += await recalcularTodos(String(o.id), { conservarSiVacio: true });
    if (total) console.log(`[motor] Valor recalculado en ${total} oportunidad(es)`);
  } catch (err) {
    console.error("[motor] no se pudieron recalcular los valores al arrancar", err);
  }
}

/** Las unidades elegidas de varias oportunidades (para la lista). Sin `interes`: vacío. */
export async function unidadesDeOportunidades(
  organizationId: string,
  oportunidadIds: readonly string[]
): Promise<Map<string, { id: string; titulo: string }[]>> {
  const out = new Map<string, { id: string; titulo: string }[]>();
  if (!oportunidadIds.length) return out;
  const motor = await cargarMotor(organizationId);
  const r = relacionDeInteres(motor);
  if (!r) return out;
  const filas = (await getDb().execute(
    sql`SELECT ${ident(r.columnaDesde)} AS op, ${ident(r.columnaHacia)} AS id FROM ${ident(r.tabla)}
        WHERE organization_id = ${organizationId} AND ${ident(r.columnaDesde)} IN (${sql.join(
          oportunidadIds.map((x) => sql`${x}`),
          sql`, `
        )})`
  )) as unknown as { op: string; id: string }[];
  const ids = [...new Set(filas.map((f) => String(f.id)))];
  const titulos = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 500) {
    const { registros } = await listarRegistros(organizationId, r.hacia, { ids: ids.slice(i, i + 500), limite: 1000 });
    for (const reg of registros) titulos.set(reg.id, reg.titulo);
  }
  const cmp = new Intl.Collator("es", { numeric: true, sensitivity: "base" }).compare;
  for (const f of filas) {
    const titulo = titulos.get(String(f.id));
    if (!titulo) continue;
    const lista = out.get(String(f.op)) ?? [];
    lista.push({ id: String(f.id), titulo });
    out.set(String(f.op), lista);
  }
  for (const lista of out.values()) lista.sort((a, b) => cmp(a.titulo, b.titulo));
  return out;
}

/** ¿La configuración calcula el Valor de la oportunidad? */
export async function valorEsCalculado(organizationId: string): Promise<boolean> {
  const r = relacionDeInteres(await cargarMotor(organizationId));
  return Boolean(r?.interes.valor);
}
