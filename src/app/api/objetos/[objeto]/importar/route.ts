import { z } from "zod";
import { parseBody, withAuth } from "@/lib/api";
import { CSV_MAX_FILAS } from "@/lib/motor/csv";
import { respuestaDeError } from "@/server/motor/api";
import { aplicarImportacion, previsualizarImportacion } from "@/server/motor/importar";

/**
 * Motor — importar un CSV a un objeto. Con `aplicar: false` devuelve el plan
 * (qué se crea, qué cambia, qué tiene errores) sin tocar nada; con
 * `aplicar: true`, lo guarda. `padre` fija la relación (importar las unidades
 * desde la página de su edificio).
 */

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ objeto: string }> };

const cuerpoSchema = z.object({
  // Holgado: CSV_MAX_FILAS filas de unos cientos de caracteres.
  texto: z.string().min(1).max(CSV_MAX_FILAS * 2000),
  padre: z.object({ relacion: z.string().min(1), id: z.string().min(1) }).optional(),
  aplicar: z.boolean().default(false),
});

export const POST = withAuth(async (session, req: Request, ctx: Params) => {
  const { objeto: clave } = await ctx.params;
  const body = await parseBody(req, cuerpoSchema);
  if (!body.ok) return body.response;
  const { texto, padre, aplicar } = body.data;
  try {
    const resultado = aplicar
      ? await aplicarImportacion(session.organizationId, clave, texto, session.userId, padre)
      : await previsualizarImportacion(session.organizationId, clave, texto, padre);
    return Response.json(resultado);
  } catch (err) {
    return respuestaDeError(err);
  }
});
