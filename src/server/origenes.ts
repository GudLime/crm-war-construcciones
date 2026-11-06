import { asc, count, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import {
  CLAVES_ICONO,
  NOMBRE_ORIGEN_MAX,
  normalizarNombreOrigen,
  ORIGENES_POR_DEFECTO,
  origenCanonico,
  planoOrigen,
  TOPE_ORIGENES,
  assetImagenOrigen,
  urlImagenOrigen,
  type OrigenDto,
} from "@/lib/origenes";
import { deleteMediaFile, saveMediaFile } from "@/server/whatsapp/media";

/**
 * War — Orígenes de las oportunidades (Ajustes → Orígenes). Las rutas solo
 * validan sesión y permiso; acá vive lo demás.
 */

export class OrigenError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export const origenSchema = z.object({
  nombre: z
    .string()
    .transform(normalizarNombreOrigen)
    .pipe(
      z
        .string()
        .min(1, "El nombre es obligatorio")
        .max(NOMBRE_ORIGEN_MAX, `El nombre va hasta ${NOMBRE_ORIGEN_MAX} caracteres`)
        .refine((n) => planoOrigen(n).length > 0, "El nombre necesita al menos una letra o número")
    ),
  icono: z.enum(CLAVES_ICONO as [string, ...string[]], { error: "Ese ícono no existe" }),
});

export const ordenSchema = z.object({
  ids: z.array(z.string().min(1).max(40)).min(1).max(TOPE_ORIGENES),
});

const t = schema.origenOportunidad;

function aDto(fila: typeof t.$inferSelect, usos?: number): OrigenDto {
  return {
    id: fila.id,
    nombre: fila.nombre,
    icono: fila.icono,
    orden: fila.orden,
    imagen:
      fila.imagenMime && fila.imagenVersion
        ? urlImagenOrigen(fila.id, fila.imagenVersion)
        : null,
    ...(usos === undefined ? {} : { usos }),
  };
}

async function filas(organizationId: string) {
  return getDb()
    .select()
    .from(t)
    .where(scoped(t.organizationId, organizationId))
    .orderBy(asc(t.orden), asc(t.nombre));
}

/**
 * Una organización sin ninguno recibe los de siempre. La migración 0035 ya
 * los cargó en las que existían; esto cubre las que se crean después. Como
 * no se puede borrar el último, "sin ninguno" solo pasa la primera vez.
 */
async function sembrarSiHaceFalta(organizationId: string) {
  const [{ n } = { n: 0 }] = await getDb()
    .select({ n: count() })
    .from(t)
    .where(scoped(t.organizationId, organizationId));
  if (Number(n) > 0) return;
  await getDb()
    .insert(t)
    .values(
      ORIGENES_POR_DEFECTO.map((o, i) => ({
        id: newId("origenOportunidad"),
        organizationId,
        nombre: o.nombre,
        icono: o.icono,
        orden: i,
      }))
    )
    .onConflictDoNothing();
}

/** Para el desplegable y para validar: nombre, ícono y orden. */
export async function listarOrigenes(organizationId: string): Promise<OrigenDto[]> {
  await sembrarSiHaceFalta(organizationId);
  return (await filas(organizationId)).map((f) => aDto(f));
}

/** Para Ajustes: además, cuántas oportunidades usa cada uno. */
export async function listarOrigenesConUsos(organizationId: string): Promise<OrigenDto[]> {
  const lista = await listarOrigenes(organizationId);
  const usos = await getDb()
    .select({ origen: schema.oportunidad.origen, n: count() })
    .from(schema.oportunidad)
    .where(
      scoped(schema.oportunidad.organizationId, organizationId, isNotNull(schema.oportunidad.origen))
    )
    .groupBy(schema.oportunidad.origen);
  const porNombre = new Map(usos.map((u) => [u.origen, Number(u.n)]));
  return lista.map((o) => ({ ...o, usos: porNombre.get(o.nombre) ?? 0 }));
}

/** El nombre canónico de un origen configurado ("meta_ads" → "Meta Ads"), o null. */
export async function resolverOrigen(
  organizationId: string,
  raw: string | null | undefined
): Promise<string | null> {
  const lista = await listarOrigenes(organizationId);
  return origenCanonico(
    raw,
    lista.map((o) => o.nombre)
  );
}

function chocaCon(lista: OrigenDto[], nombre: string, salvoId?: string): OrigenDto | undefined {
  const plano = planoOrigen(nombre);
  return lista.find((o) => o.id !== salvoId && planoOrigen(o.nombre) === plano);
}

const repetido = (nombre: string) =>
  new OrigenError(409, "duplicado", `Ya hay un origen que se llama «${nombre}»`);

export async function crearOrigen(
  organizationId: string,
  datos: z.infer<typeof origenSchema>
): Promise<OrigenDto> {
  const lista = await listarOrigenes(organizationId);
  if (lista.length >= TOPE_ORIGENES) {
    throw new OrigenError(409, "tope", `Caben hasta ${TOPE_ORIGENES} orígenes`);
  }
  const choca = chocaCon(lista, datos.nombre);
  if (choca) throw repetido(choca.nombre);
  const orden = lista.reduce((max, o) => Math.max(max, o.orden), -1) + 1;
  try {
    const [fila] = await getDb()
      .insert(t)
      .values({ id: newId("origenOportunidad"), organizationId, ...datos, orden })
      .returning();
    return aDto(fila!, 0);
  } catch (err) {
    if (esDuplicado(err)) throw repetido(datos.nombre);
    throw err;
  }
}

/**
 * Cambiar el nombre lo cambia también en las oportunidades y en los
 * formularios recibidos que lo tenían, para que nada quede huérfano.
 */
export async function editarOrigen(
  organizationId: string,
  id: string,
  datos: z.infer<typeof origenSchema>
): Promise<OrigenDto> {
  const lista = await listarOrigenes(organizationId);
  const actual = lista.find((o) => o.id === id);
  if (!actual) throw new OrigenError(404, "not_found", "Ese origen no existe");
  const choca = chocaCon(lista, datos.nombre, id);
  if (choca) throw repetido(choca.nombre);

  try {
    return await getDb().transaction(async (tx) => {
      const [fila] = await tx
        .update(t)
        .set({ nombre: datos.nombre, icono: datos.icono, updatedAt: new Date() })
        .where(scoped(t.organizationId, organizationId, eq(t.id, id)))
        .returning();
      if (actual.nombre !== datos.nombre) {
        await tx
          .update(schema.oportunidad)
          .set({ origen: datos.nombre })
          .where(
            scoped(
              schema.oportunidad.organizationId,
              organizationId,
              eq(schema.oportunidad.origen, actual.nombre)
            )
          );
        await tx
          .update(schema.oportunidadLead)
          .set({ origen: datos.nombre })
          .where(
            scoped(
              schema.oportunidadLead.organizationId,
              organizationId,
              eq(schema.oportunidadLead.origen, actual.nombre)
            )
          );
      }
      return aDto(fila!);
    });
  } catch (err) {
    if (esDuplicado(err)) throw repetido(datos.nombre);
    throw err;
  }
}

/**
 * Borrar no toca las oportunidades: siguen mostrando el nombre (con el ícono
 * genérico). Make deja de poder mandarlo (422 `origen_desconocido`).
 */
export async function borrarOrigen(organizationId: string, id: string): Promise<void> {
  const lista = await listarOrigenes(organizationId);
  if (!lista.some((o) => o.id === id)) {
    throw new OrigenError(404, "not_found", "Ese origen no existe");
  }
  if (lista.length <= 1) {
    throw new OrigenError(409, "ultimo", "Tiene que quedar al menos un origen");
  }
  await getDb().delete(t).where(scoped(t.organizationId, organizationId, eq(t.id, id)));
  // Después de borrar la fila: si esto falla queda un archivo huérfano, no
  // un origen apuntando a una imagen que no está.
  await deleteMediaFile(organizationId, assetImagenOrigen(id)).catch(() => null);
}

/** Guarda la imagen propia de un origen (ya verificada por sus bytes). */
export async function ponerImagenOrigen(
  organizationId: string,
  id: string,
  bytes: Uint8Array,
  mime: string
): Promise<OrigenDto> {
  const [existe] = await getDb()
    .select({ id: t.id })
    .from(t)
    .where(scoped(t.organizationId, organizationId, eq(t.id, id)))
    .limit(1);
  if (!existe) throw new OrigenError(404, "not_found", "Ese origen no existe");
  await saveMediaFile(organizationId, assetImagenOrigen(id), bytes, mime);
  const [fila] = await getDb()
    .update(t)
    .set({ imagenMime: mime, imagenVersion: Date.now(), updatedAt: new Date() })
    .where(scoped(t.organizationId, organizationId, eq(t.id, id)))
    .returning();
  return aDto(fila!);
}

/** Vuelve al ícono de la librería. */
export async function quitarImagenOrigen(organizationId: string, id: string): Promise<OrigenDto> {
  const [fila] = await getDb()
    .update(t)
    .set({ imagenMime: null, imagenVersion: null, updatedAt: new Date() })
    .where(scoped(t.organizationId, organizationId, eq(t.id, id)))
    .returning();
  if (!fila) throw new OrigenError(404, "not_found", "Ese origen no existe");
  await deleteMediaFile(organizationId, assetImagenOrigen(id)).catch(() => null);
  return aDto(fila);
}

/** Para servirla: el tipo de la imagen, o null si no tiene. */
export async function mimeImagenOrigen(organizationId: string, id: string): Promise<string | null> {
  const [fila] = await getDb()
    .select({ mime: t.imagenMime })
    .from(t)
    .where(scoped(t.organizationId, organizationId, eq(t.id, id)))
    .limit(1);
  return fila?.mime ?? null;
}

/** El orden nuevo: los ids en el orden en que se ven. Los que falten van al final. */
export async function ordenarOrigenes(
  organizationId: string,
  ids: readonly string[]
): Promise<OrigenDto[]> {
  const lista = await listarOrigenes(organizationId);
  const conocidos = new Set(lista.map((o) => o.id));
  const pedidos = [...new Set(ids)].filter((id) => conocidos.has(id));
  const resto = lista.map((o) => o.id).filter((id) => !pedidos.includes(id));
  const final = [...pedidos, ...resto];
  await getDb().transaction(async (tx) => {
    for (const [i, id] of final.entries()) {
      await tx
        .update(t)
        .set({ orden: i })
        .where(scoped(t.organizationId, organizationId, eq(t.id, id)));
    }
  });
  return listarOrigenesConUsos(organizationId);
}

/** Para validar en Ventas: ¿existe este nombre exacto? */
export async function existeOrigen(organizationId: string, nombre: string): Promise<boolean> {
  const [fila] = await getDb()
    .select({ id: t.id })
    .from(t)
    .where(scoped(t.organizationId, organizationId, eq(t.nombre, nombre)))
    .limit(1);
  return Boolean(fila);
}

function esDuplicado(err: unknown): boolean {
  const code =
    (err as { code?: string })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
  return code === "23505";
}
