import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { recalcularTodos } from "@/server/motor/interes";
import { exportarUnidadesCsv, importarUnidadesCsv, VentasError } from "@/server/ventas";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Descarga la lista de precios del edificio en CSV. */
export const GET = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  try {
    const { nombre, csv } = await exportarUnidadesCsv(session.organizationId, id);
    const archivo = `unidades-${nombre.normalize("NFD").replace(/[^\w-]+/g, "-").toLowerCase()}.csv`;
    // BOM: así Excel abre bien los acentos.
    return new Response(`﻿${csv}`, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${archivo}"`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof VentasError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});

const bodySchema = z.object({
  /** El texto del CSV (el navegador lee el archivo). ~1 MB alcanza para miles de unidades. */
  csv: z.string().min(1, "El archivo está vacío").max(1_000_000, "El archivo es demasiado grande"),
  /** false = vista previa (no escribe nada); true = aplica. */
  aplicar: z.boolean().default(false),
  /** La moneda del negocio, para cuando el archivo no dice USD. */
  moneda: z.string().trim().length(3).default("USD"),
});

/**
 * Importa la lista de precios: crea las unidades nuevas y actualiza las que
 * cambiaron. Primero se llama con `aplicar: false` para la vista previa.
 */
export const POST = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;
  try {
    const resultado = await importarUnidadesCsv({
      organizationId: session.organizationId,
      edificioId: id,
      csv: body.data.csv,
      monedaNegocio: body.data.moneda.toUpperCase(),
      aplicar: body.data.aplicar,
    });
    // Una lista de precios nueva cambia el Valor de las oportunidades.
    if (body.data.aplicar) await recalcularTodos(session.organizationId);
    return Response.json(resultado);
  } catch (err) {
    if (err instanceof VentasError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});
