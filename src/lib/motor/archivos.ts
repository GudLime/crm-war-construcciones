import { LIMITES_ARCHIVO, MAX_MB_FOTO } from "./config";

/** Motor — qué archivo es cada uno (por su contenido) y cuánto puede pesar. Puro. */

export type TipoArchivoGuardado = "imagen" | "video" | "documento";

const MB = 1024 * 1024;

/** Qué es el archivo por sus primeros bytes, o null si no es uno de los admitidos. */
export function reconocerArchivo(buf: Uint8Array): { tipo: TipoArchivoGuardado; mime: string; ext: string } | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { tipo: "imagen", mime: "image/jpeg", ext: "jpg" };
  }
  // MP4: «ftyp» en el byte 4.
  if (buf.length >= 12 && buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) {
    return { tipo: "video", mime: "video/mp4", ext: "mp4" };
  }
  if (buf.length >= 5 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46 && buf[4] === 0x2d) {
    return { tipo: "documento", mime: "application/pdf", ext: "pdf" };
  }
  return null;
}

/** Tope en bytes según lo que se sube (y el campo, si dice otro). */
export function topeBytes(tipo: TipoArchivoGuardado, maxMb?: number | null): number {
  if (tipo === "imagen") return MAX_MB_FOTO * MB;
  const def = tipo === "video" ? LIMITES_ARCHIVO.video : LIMITES_ARCHIVO.documento;
  return Math.min(maxMb ?? def.maxMb, def.maxMbTope) * MB;
}

