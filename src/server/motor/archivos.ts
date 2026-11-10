import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { reconocerArchivo, topeBytes, type TipoArchivoGuardado } from "@/lib/motor/archivos";
import { borrarMedia, guardarMedia, leerMedia } from "@/lib/storage/medios";

/**
 * Motor — archivos de los campos galería (fotos JPG), video (MP4) y documento
 * (PDF). El binario va al volumen de medios (o al bucket, si la instancia lo
 * usa: `lib/storage/medios`); `motor_archivo` dice qué es cada uno. El
 * registro guarda solo los ids.
 *
 * Se valida el contenido, no la extensión: los primeros bytes tienen que ser
 * de un JPG, un MP4 o un PDF. Las fotos llegan ya achicadas desde el
 * navegador; el tope del servidor es la red de seguridad.
 */

export { reconocerArchivo, topeBytes, type TipoArchivoGuardado } from "@/lib/motor/archivos";

export type ArchivoDto = {
  id: string;
  tipo: TipoArchivoGuardado;
  mime: string;
  nombre: string | null;
  bytes: number;
};

export class ArchivoError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

const MB = 1024 * 1024;

const ESPERADO: Record<TipoArchivoGuardado, string> = {
  imagen: "una foto JPG",
  video: "un video MP4",
  documento: "un PDF",
};

export async function subirArchivo(
  organizationId: string,
  entrada: { datos: Buffer; nombre: string | null; esperado: TipoArchivoGuardado; maxMb?: number | null }
): Promise<ArchivoDto> {
  const reconocido = reconocerArchivo(entrada.datos);
  if (!reconocido || reconocido.tipo !== entrada.esperado) {
    throw new ArchivoError(422, "tipo_no_admitido", `Tiene que ser ${ESPERADO[entrada.esperado]}`);
  }
  const tope = topeBytes(reconocido.tipo, entrada.maxMb);
  if (entrada.datos.byteLength > tope) {
    throw new ArchivoError(413, "muy_grande", `Es muy pesado: el máximo es ${Math.round(tope / MB)} MB`);
  }
  const id = newId("motorArchivo");
  const ruta = await guardarMedia(organizationId, `${id}.${reconocido.ext}`, entrada.datos, reconocido.mime);
  const nombre = entrada.nombre?.replace(/[\\/\0]/g, "").slice(0, 200) || null;
  await getDb().insert(schema.motorArchivo).values({
    id,
    organizationId,
    tipo: reconocido.tipo,
    mime: reconocido.mime,
    nombre,
    bytes: entrada.datos.byteLength,
    ruta,
  });
  return { id, tipo: reconocido.tipo, mime: reconocido.mime, nombre, bytes: entrada.datos.byteLength };
}

export async function metaDeArchivos(organizationId: string, ids: string[]): Promise<Map<string, ArchivoDto & { ruta: string }>> {
  const unicos = [...new Set(ids)];
  if (!unicos.length) return new Map();
  const filas = await getDb()
    .select()
    .from(schema.motorArchivo)
    .where(scoped(schema.motorArchivo.organizationId, organizationId, inArray(schema.motorArchivo.id, unicos)));
  return new Map(
    filas.map((f) => [f.id, { id: f.id, tipo: f.tipo, mime: f.mime, nombre: f.nombre, bytes: f.bytes, ruta: f.ruta }])
  );
}

export async function leerArchivo(organizationId: string, id: string): Promise<{ datos: Buffer; meta: ArchivoDto & { ruta: string } } | null> {
  const meta = (await metaDeArchivos(organizationId, [id])).get(id);
  if (!meta) return null;
  const nombre = meta.ruta.split("/").pop()!;
  return { datos: await leerMedia(organizationId, nombre), meta };
}

/** Borra archivos que ya nadie usa (del disco y de la tabla). Nunca lanza. */
export async function borrarArchivos(organizationId: string, ids: string[]): Promise<void> {
  if (!ids.length) return;
  try {
    const metas = await metaDeArchivos(organizationId, ids);
    for (const m of metas.values()) {
      await borrarMedia(organizationId, m.ruta.split("/").pop()!).catch(() => undefined);
    }
    await getDb()
      .delete(schema.motorArchivo)
      .where(and(eq(schema.motorArchivo.organizationId, organizationId), inArray(schema.motorArchivo.id, [...metas.keys()])));
  } catch (err) {
    console.error("[motor] no se pudieron borrar archivos:", err);
  }
}

/** Los ids de archivos de un conjunto de valores (según el tipo de cada campo). */
export function idsDeArchivos(
  campos: { clave: string; tipo: string }[],
  valores: Record<string, unknown>
): { clave: string; tipo: "galeria" | "video" | "documento"; ids: string[] }[] {
  const out: { clave: string; tipo: "galeria" | "video" | "documento"; ids: string[] }[] = [];
  for (const c of campos) {
    if (c.tipo !== "galeria" && c.tipo !== "video" && c.tipo !== "documento") continue;
    if (!(c.clave in valores)) continue;
    const v = valores[c.clave];
    const ids = Array.isArray(v) ? v.map(String) : typeof v === "string" && v ? [v] : [];
    out.push({ clave: c.clave, tipo: c.tipo, ids });
  }
  return out;
}

const TIPO_GUARDADO = { galeria: "imagen", video: "video", documento: "documento" } as const;

/** Que cada archivo exista, sea de la organización y del tipo del campo. */
export async function verificarArchivos(
  organizationId: string,
  porCampo: ReturnType<typeof idsDeArchivos>,
  nombreDe: (clave: string) => string
): Promise<string | null> {
  const metas = await metaDeArchivos(
    organizationId,
    porCampo.flatMap((p) => p.ids)
  );
  for (const p of porCampo) {
    for (const id of p.ids) {
      const m = metas.get(id);
      if (!m || m.tipo !== TIPO_GUARDADO[p.tipo]) return `«${nombreDe(p.clave)}»: un archivo no existe o no es del tipo correcto`;
    }
  }
  return null;
}
