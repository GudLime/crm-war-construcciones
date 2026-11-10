import { apiError, withAuth } from "@/lib/api";
import { leerArchivo } from "@/server/motor/archivos";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Motor — ver un archivo de un campo galería, video o documento (con sesión). */
export const GET = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const leido = await leerArchivo(session.organizationId, id).catch(() => null);
  if (!leido) return apiError(404, "not_found", "Archivo no encontrado");
  const nombre = (leido.meta.nombre ?? id).replace(/["\r\n]/g, "");
  return new Response(new Uint8Array(leido.datos), {
    headers: {
      "content-type": leido.meta.mime,
      "content-length": String(leido.datos.byteLength),
      "content-disposition": `inline; filename="${nombre}"`,
      // El id no cambia nunca: el contenido de un archivo tampoco.
      "cache-control": "private, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
});
