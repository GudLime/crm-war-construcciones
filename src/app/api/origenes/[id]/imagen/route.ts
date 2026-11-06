import { apiError, withAuth } from "@/lib/api";
import { canConfigure } from "@/lib/auth/roles";
import { sniffFaviconMime } from "@/lib/favicon";
import { assetImagenOrigen, MAX_IMAGEN_ORIGEN_BYTES } from "@/lib/origenes";
import {
  mimeImagenOrigen,
  OrigenError,
  ponerImagenOrigen,
  quitarImagenOrigen,
} from "@/server/origenes";
import { readMediaFile } from "@/server/whatsapp/media";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * War — La imagen propia de un origen (el logo de Zonaprop, de MercadoLibre…).
 * Mismo criterio que el icono de la marca: el tipo sale de los bytes, y se
 * sirve con una CSP que deja a un SVG sin nada que ejecutar.
 */
export const GET = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const mime = await mimeImagenOrigen(session.organizationId, id);
  if (!mime) return apiError(404, "not_found", "Ese origen no tiene imagen");
  let buf: Buffer;
  try {
    buf = await readMediaFile(session.organizationId, assetImagenOrigen(id));
  } catch {
    return apiError(404, "not_found", "No se encontró el archivo de la imagen");
  }
  const cacheable = new URL(req.url).searchParams.has("v");
  return new Response(new Uint8Array(buf), {
    headers: {
      "content-type": mime,
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
      "x-content-type-options": "nosniff",
      // La URL lleva `?v=` y cambia con cada subida. Privada: necesita sesión.
      "cache-control": cacheable ? "private, max-age=31536000, immutable" : "private, max-age=60",
    },
  });
});

/** Subir: el cuerpo va crudo con su `content-type`. Solo quien configura. */
export const PUT = withAuth(async (session, req: Request, ctx: Params) => {
  if (!canConfigure(session.role)) {
    return apiError(403, "forbidden", "Solo quien administra cambia los orígenes");
  }
  const { id } = await ctx.params;
  const buf = new Uint8Array(await req.arrayBuffer());
  if (buf.byteLength === 0) return apiError(422, "empty", "No llegó ningún archivo");
  if (buf.byteLength > MAX_IMAGEN_ORIGEN_BYTES) {
    return apiError(
      413,
      "too_large",
      `La imagen no puede pasar de ${Math.round(MAX_IMAGEN_ORIGEN_BYTES / 1024)} KB`
    );
  }
  const mime = sniffFaviconMime(buf);
  if (!mime) {
    return apiError(422, "unsupported", "Formato no reconocido. Usá PNG, SVG, JPEG o WebP.");
  }
  try {
    return Response.json({ origen: await ponerImagenOrigen(session.organizationId, id, buf, mime) });
  } catch (err) {
    if (err instanceof OrigenError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});

/** Quitar la imagen y volver al ícono de la librería. */
export const DELETE = withAuth(async (session, _req: Request, ctx: Params) => {
  if (!canConfigure(session.role)) {
    return apiError(403, "forbidden", "Solo quien administra cambia los orígenes");
  }
  const { id } = await ctx.params;
  try {
    return Response.json({ origen: await quitarImagenOrigen(session.organizationId, id) });
  } catch (err) {
    if (err instanceof OrigenError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});
