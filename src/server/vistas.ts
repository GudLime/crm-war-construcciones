import { and, asc, eq, isNull, or } from "drizzle-orm";
import type { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { filtrosSchema, type PaginaConVistas, type VistaDto, type vistaEntradaSchema } from "@/lib/vistas";

/**
 * Vistas guardadas (D5): las del equipo las ven todos y cualquiera las
 * edita; las propias, solo quien las guardó. Y la última que usó cada uno.
 */

export class VistaError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

type Quien = { organizationId: string; userId: string };
type Entrada = z.infer<typeof vistaEntradaSchema>;

function aDto(f: typeof schema.vistaGuardada.$inferSelect): VistaDto {
  const filtros = filtrosSchema.safeParse(f.filtros);
  const orden = f.orden as VistaDto["orden"];
  return {
    id: f.id,
    nombre: f.nombre,
    compartida: f.userId === null,
    filtros: filtros.success ? filtros.data : {},
    orden: orden && typeof orden === "object" && "columna" in orden ? orden : null,
    columnas: Array.isArray(f.columnas) ? f.columnas : null,
    anchos: f.anchos && typeof f.anchos === "object" ? f.anchos : null,
  };
}

const visibles = (q: Quien, pagina: string) =>
  scoped(
    schema.vistaGuardada.organizationId,
    q.organizationId,
    eq(schema.vistaGuardada.pagina, pagina),
    or(isNull(schema.vistaGuardada.userId), eq(schema.vistaGuardada.userId, q.userId))
  );

export async function listarVistas(
  q: Quien,
  pagina: PaginaConVistas
): Promise<{ vistas: VistaDto[]; ultima: string | null }> {
  const db = getDb();
  const filas = await db
    .select()
    .from(schema.vistaGuardada)
    .where(visibles(q, pagina))
    .orderBy(asc(schema.vistaGuardada.posicion), asc(schema.vistaGuardada.createdAt));
  const [u] = await db
    .select({ vistaId: schema.vistaUltima.vistaId })
    .from(schema.vistaUltima)
    .where(
      and(
        eq(schema.vistaUltima.organizationId, q.organizationId),
        eq(schema.vistaUltima.userId, q.userId),
        eq(schema.vistaUltima.pagina, pagina)
      )
    )
    .limit(1);
  return { vistas: filas.map(aDto), ultima: u?.vistaId ?? null };
}

export async function crearVista(
  q: Quien,
  pagina: PaginaConVistas,
  datos: Entrada & { compartida: boolean }
): Promise<VistaDto> {
  const db = getDb();
  const ya = await db.select({ id: schema.vistaGuardada.id }).from(schema.vistaGuardada).where(visibles(q, pagina));
  const [fila] = await db
    .insert(schema.vistaGuardada)
    .values({
      id: newId("vistaGuardada"),
      organizationId: q.organizationId,
      userId: datos.compartida ? null : q.userId,
      pagina,
      nombre: datos.nombre,
      filtros: datos.filtros,
      orden: datos.orden ?? null,
      columnas: datos.columnas ?? null,
      anchos: datos.anchos ?? null,
      posicion: ya.length,
    })
    .returning();
  return aDto(fila!);
}

async function vistaEditable(q: Quien, id: string) {
  const [fila] = await getDb()
    .select()
    .from(schema.vistaGuardada)
    .where(scoped(schema.vistaGuardada.organizationId, q.organizationId, eq(schema.vistaGuardada.id, id)))
    .limit(1);
  if (!fila || (fila.userId !== null && fila.userId !== q.userId)) {
    throw new VistaError(404, "not_found", "Esa vista no existe");
  }
  return fila;
}

export async function editarVista(q: Quien, id: string, datos: Partial<Entrada>): Promise<VistaDto> {
  await vistaEditable(q, id);
  const [fila] = await getDb()
    .update(schema.vistaGuardada)
    .set({
      ...(datos.nombre !== undefined ? { nombre: datos.nombre } : {}),
      ...(datos.filtros !== undefined ? { filtros: datos.filtros } : {}),
      ...(datos.orden !== undefined ? { orden: datos.orden } : {}),
      ...(datos.columnas !== undefined ? { columnas: datos.columnas } : {}),
      ...(datos.anchos !== undefined ? { anchos: datos.anchos } : {}),
      updatedAt: new Date(),
    })
    .where(scoped(schema.vistaGuardada.organizationId, q.organizationId, eq(schema.vistaGuardada.id, id)))
    .returning();
  return aDto(fila!);
}

export async function borrarVista(q: Quien, id: string): Promise<void> {
  await vistaEditable(q, id);
  await getDb()
    .delete(schema.vistaGuardada)
    .where(scoped(schema.vistaGuardada.organizationId, q.organizationId, eq(schema.vistaGuardada.id, id)));
}

/** La última que usó: una guardada, una de fábrica («todas», «para-cerrar») o null. */
export async function recordarUltima(q: Quien, pagina: PaginaConVistas, vistaId: string | null): Promise<void> {
  await getDb()
    .insert(schema.vistaUltima)
    .values({ organizationId: q.organizationId, userId: q.userId, pagina, vistaId })
    .onConflictDoUpdate({
      target: [schema.vistaUltima.organizationId, schema.vistaUltima.userId, schema.vistaUltima.pagina],
      set: { vistaId, updatedAt: new Date() },
    });
}
