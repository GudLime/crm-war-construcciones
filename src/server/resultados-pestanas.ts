import { and, asc, eq, isNull, or } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import {
  datosEdificiosSchema,
  datosFechasSchema,
  type DatosEdificios,
  type DatosFechas,
  type PestanaDto,
  type TipoPestana,
} from "@/lib/resultados";

/**
 * Resultados — las pestañas guardadas de fechas y de edificios. Viven en
 * `vista_guardada` (0046) con `pagina = 'resultados.fechas' | 'resultados.edificios'`:
 * del equipo (`user_id` null, las ven todos) o propias. La última elegida de
 * cada fila, por persona, en `vista_ultima`.
 */

type Quien = { organizationId: string; userId: string };
export const paginaDe = (t: TipoPestana) => `resultados.${t}` as const;

export class PestanaError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

function aDto(tipo: TipoPestana, f: typeof schema.vistaGuardada.$inferSelect): PestanaDto | null {
  const parse = tipo === "fechas" ? datosFechasSchema.safeParse(f.filtros) : datosEdificiosSchema.safeParse(f.filtros);
  if (!parse.success) return null;
  return { id: f.id, tipo, nombre: f.nombre, compartida: f.userId === null, datos: parse.data };
}

const visibles = (q: Quien, tipo: TipoPestana) =>
  scoped(
    schema.vistaGuardada.organizationId,
    q.organizationId,
    eq(schema.vistaGuardada.pagina, paginaDe(tipo)),
    or(isNull(schema.vistaGuardada.userId), eq(schema.vistaGuardada.userId, q.userId))
  );

export async function listarPestanas(q: Quien) {
  const db = getDb();
  const leer = async (tipo: TipoPestana) =>
    (
      await db
        .select()
        .from(schema.vistaGuardada)
        .where(visibles(q, tipo))
        .orderBy(asc(schema.vistaGuardada.posicion), asc(schema.vistaGuardada.createdAt))
    )
      .map((f) => aDto(tipo, f))
      .filter((x): x is PestanaDto => x !== null);
  const [fechas, edificios, ultimas] = await Promise.all([
    leer("fechas"),
    leer("edificios"),
    db
      .select({ pagina: schema.vistaUltima.pagina, vistaId: schema.vistaUltima.vistaId })
      .from(schema.vistaUltima)
      .where(and(eq(schema.vistaUltima.organizationId, q.organizationId), eq(schema.vistaUltima.userId, q.userId))),
  ]);
  const ultima = (t: TipoPestana) => ultimas.find((u) => u.pagina === paginaDe(t))?.vistaId ?? null;
  return { fechas, edificios, ultimaFechas: ultima("fechas"), ultimaEdificios: ultima("edificios") };
}

export async function crearPestana(
  q: Quien,
  tipo: TipoPestana,
  nombre: string,
  datos: DatosFechas | DatosEdificios,
  compartida: boolean
): Promise<PestanaDto> {
  const db = getDb();
  const ya = await db.select({ id: schema.vistaGuardada.id }).from(schema.vistaGuardada).where(visibles(q, tipo));
  const [f] = await db
    .insert(schema.vistaGuardada)
    .values({
      id: newId("vistaGuardada"),
      organizationId: q.organizationId,
      userId: compartida ? null : q.userId,
      pagina: paginaDe(tipo),
      nombre,
      filtros: datos as unknown as Record<string, unknown>,
      posicion: ya.length,
    })
    .returning();
  return aDto(tipo, f!)!;
}

async function editable(q: Quien, id: string) {
  const [f] = await getDb()
    .select()
    .from(schema.vistaGuardada)
    .where(scoped(schema.vistaGuardada.organizationId, q.organizationId, eq(schema.vistaGuardada.id, id)))
    .limit(1);
  if (!f || !f.pagina.startsWith("resultados.") || (f.userId !== null && f.userId !== q.userId)) {
    throw new PestanaError(404, "not_found", "Esa pestaña no existe");
  }
  return f;
}

export async function renombrarPestana(q: Quien, id: string, nombre: string): Promise<void> {
  await editable(q, id);
  await getDb()
    .update(schema.vistaGuardada)
    .set({ nombre, updatedAt: new Date() })
    .where(scoped(schema.vistaGuardada.organizationId, q.organizationId, eq(schema.vistaGuardada.id, id)));
}

export async function borrarPestana(q: Quien, id: string): Promise<void> {
  await editable(q, id);
  await getDb()
    .delete(schema.vistaGuardada)
    .where(scoped(schema.vistaGuardada.organizationId, q.organizationId, eq(schema.vistaGuardada.id, id)));
}

/** La última elegida de una fila: una propia, una de fábrica («30d», «todos») o null. */
export async function recordarPestana(q: Quien, tipo: TipoPestana, vistaId: string | null): Promise<void> {
  await getDb()
    .insert(schema.vistaUltima)
    .values({ organizationId: q.organizationId, userId: q.userId, pagina: paginaDe(tipo), vistaId })
    .onConflictDoUpdate({
      target: [schema.vistaUltima.organizationId, schema.vistaUltima.userId, schema.vistaUltima.pagina],
      set: { vistaId, updatedAt: new Date() },
    });
}
