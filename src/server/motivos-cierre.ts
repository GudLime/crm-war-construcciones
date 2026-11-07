import { asc, count, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import {
  MOTIVOS_POR_DEFECTO,
  NOMBRE_MOTIVO_MAX,
  normalizarNombreMotivo,
  planoMotivo,
  TOPE_MOTIVOS,
  type MotivoCierreDto,
} from "@/lib/motivos-cierre";

/**
 * War — Motivos de cierre configurables. Mismo patrón que los orígenes: la
 * oportunidad guarda el nombre como texto; renombrar lo arrastra (también al
 * historial), borrar no toca a las que ya lo tienen.
 */

export class MotivoError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export const motivoSchema = z.object({
  nombre: z
    .string()
    .transform(normalizarNombreMotivo)
    .pipe(
      z
        .string()
        .min(1, "El nombre es obligatorio")
        .max(NOMBRE_MOTIVO_MAX, `El nombre va hasta ${NOMBRE_MOTIVO_MAX} caracteres`)
        .refine((n) => planoMotivo(n).length > 0, "El nombre necesita al menos una letra o número")
    ),
});

export const ordenMotivosSchema = z.object({
  ids: z.array(z.string().min(1).max(40)).min(1).max(TOPE_MOTIVOS),
});

const t = schema.motivoCierre;

function aDto(fila: typeof t.$inferSelect, usos?: number): MotivoCierreDto {
  return { id: fila.id, nombre: fila.nombre, orden: fila.orden, ...(usos === undefined ? {} : { usos }) };
}

async function sembrarSiHaceFalta(organizationId: string) {
  const [{ n } = { n: 0 }] = await getDb()
    .select({ n: count() })
    .from(t)
    .where(scoped(t.organizationId, organizationId));
  if (Number(n) > 0) return;
  await getDb()
    .insert(t)
    .values(MOTIVOS_POR_DEFECTO.map((nombre, i) => ({ id: newId("motivoCierre"), organizationId, nombre, orden: i })))
    .onConflictDoNothing();
}

/** Para los desplegables y para validar. */
export async function listarMotivos(organizationId: string): Promise<MotivoCierreDto[]> {
  await sembrarSiHaceFalta(organizationId);
  const filas = await getDb()
    .select()
    .from(t)
    .where(scoped(t.organizationId, organizationId))
    .orderBy(asc(t.orden), asc(t.nombre));
  return filas.map((f) => aDto(f));
}

/** Para Ajustes: además, cuántas oportunidades tiene cada uno. */
export async function listarMotivosConUsos(organizationId: string): Promise<MotivoCierreDto[]> {
  const lista = await listarMotivos(organizationId);
  const usos = await getDb()
    .select({ motivo: schema.oportunidad.motivoCierre, n: count() })
    .from(schema.oportunidad)
    .where(scoped(schema.oportunidad.organizationId, organizationId, isNotNull(schema.oportunidad.motivoCierre)))
    .groupBy(schema.oportunidad.motivoCierre);
  const porNombre = new Map(usos.map((u) => [u.motivo, Number(u.n)]));
  return lista.map((m) => ({ ...m, usos: porNombre.get(m.nombre) ?? 0 }));
}

/**
 * ¿Se puede guardar este motivo? Sí si está en la lista, o si es el que la
 * oportunidad ya tenía (aunque después se haya borrado de Ajustes).
 */
export async function motivoValido(
  organizationId: string,
  nombre: string | null | undefined,
  actual: string | null = null
): Promise<boolean> {
  if (!nombre || nombre === actual) return true;
  return (await listarMotivos(organizationId)).some((m) => m.nombre === nombre);
}

export const motivoDesconocido = (nombre: string) =>
  new MotivoError(422, "motivo_desconocido", `El motivo «${nombre}» no existe: agregalo en Configuración → Motivos de cierre`);

const repetido = (nombre: string) => new MotivoError(409, "duplicado", `Ya hay un motivo que se llama «${nombre}»`);

function chocaCon(lista: MotivoCierreDto[], nombre: string, salvoId?: string) {
  const plano = planoMotivo(nombre);
  return lista.find((m) => m.id !== salvoId && planoMotivo(m.nombre) === plano);
}

export async function crearMotivo(organizationId: string, datos: z.infer<typeof motivoSchema>): Promise<MotivoCierreDto> {
  const lista = await listarMotivos(organizationId);
  if (lista.length >= TOPE_MOTIVOS) throw new MotivoError(409, "tope", `Caben hasta ${TOPE_MOTIVOS} motivos`);
  const choca = chocaCon(lista, datos.nombre);
  if (choca) throw repetido(choca.nombre);
  const orden = lista.reduce((max, m) => Math.max(max, m.orden), -1) + 1;
  try {
    const [fila] = await getDb()
      .insert(t)
      .values({ id: newId("motivoCierre"), organizationId, nombre: datos.nombre, orden })
      .returning();
    return aDto(fila!, 0);
  } catch (err) {
    if (esDuplicado(err)) throw repetido(datos.nombre);
    throw err;
  }
}

/** Renombrar arrastra a las oportunidades y al historial (para que las estadísticas no partan el motivo en dos). */
export async function editarMotivo(
  organizationId: string,
  id: string,
  datos: z.infer<typeof motivoSchema>
): Promise<MotivoCierreDto> {
  const lista = await listarMotivos(organizationId);
  const actual = lista.find((m) => m.id === id);
  if (!actual) throw new MotivoError(404, "not_found", "Ese motivo no existe");
  const choca = chocaCon(lista, datos.nombre, id);
  if (choca) throw repetido(choca.nombre);
  try {
    return await getDb().transaction(async (tx) => {
      const [fila] = await tx
        .update(t)
        .set({ nombre: datos.nombre, updatedAt: new Date() })
        .where(scoped(t.organizationId, organizationId, eq(t.id, id)))
        .returning();
      if (actual.nombre !== datos.nombre) {
        await tx
          .update(schema.oportunidad)
          .set({ motivoCierre: datos.nombre })
          .where(
            scoped(schema.oportunidad.organizationId, organizationId, eq(schema.oportunidad.motivoCierre, actual.nombre))
          );
        await tx
          .update(schema.oportunidadEvento)
          .set({ motivo: datos.nombre })
          .where(
            scoped(schema.oportunidadEvento.organizationId, organizationId, eq(schema.oportunidadEvento.motivo, actual.nombre))
          );
      }
      return aDto(fila!);
    });
  } catch (err) {
    if (esDuplicado(err)) throw repetido(datos.nombre);
    throw err;
  }
}

/** Borrar: las oportunidades que lo tenían lo conservan como texto. Tiene que quedar al menos uno. */
export async function borrarMotivo(organizationId: string, id: string): Promise<void> {
  const lista = await listarMotivos(organizationId);
  if (!lista.some((m) => m.id === id)) throw new MotivoError(404, "not_found", "Ese motivo no existe");
  if (lista.length <= 1) throw new MotivoError(409, "ultimo", "Tiene que quedar al menos un motivo");
  await getDb().delete(t).where(scoped(t.organizationId, organizationId, eq(t.id, id)));
}

/** Reordenar: los ids en el orden en que se ven; los que falten van al final. */
export async function ordenarMotivos(organizationId: string, ids: string[]): Promise<MotivoCierreDto[]> {
  const lista = await listarMotivos(organizationId);
  const conocidos = new Set(lista.map((m) => m.id));
  const pedidos = [...new Set(ids)].filter((x) => conocidos.has(x));
  const final = [...pedidos, ...lista.map((m) => m.id).filter((x) => !pedidos.includes(x))];
  await getDb().transaction(async (tx) => {
    for (const [i, mid] of final.entries()) {
      await tx.update(t).set({ orden: i }).where(scoped(t.organizationId, organizationId, eq(t.id, mid)));
    }
  });
  return listarMotivosConUsos(organizationId);
}

function esDuplicado(err: unknown): boolean {
  const code = (err as { code?: string })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
  return code === "23505";
}
