import { withAuth } from "@/lib/api";
import { padreDeParametro, respuestaDeError } from "@/server/motor/api";
import { exportarCsv } from "@/server/motor/importar";

/**
 * Motor — los registros de un objeto como CSV, con los mismos filtros de la
 * lista (`q`, `padre`, `f.<campo>`). Las columnas son las que lee el
 * importador: se edita en Sheets y se vuelve a subir.
 */

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ objeto: string }> };

export const GET = withAuth(async (session, req: Request, ctx: Params) => {
  const { objeto: clave } = await ctx.params;
  const url = new URL(req.url);
  const filtros: Record<string, string[]> = {};
  for (const [k, v] of url.searchParams) {
    if (k.startsWith("f.") && v) filtros[k.slice(2)] = v.split(",").filter(Boolean);
  }
  try {
    const { nombre, csv } = await exportarCsv(session.organizationId, clave, {
      busqueda: url.searchParams.get("q") ?? undefined,
      filtros,
      padre: padreDeParametro(url.searchParams.get("padre")),
    });
    const archivo = `${nombre.toLowerCase().replace(/[^a-z0-9]+/gi, "-")}.csv`;
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${archivo}"`,
      },
    });
  } catch (err) {
    return respuestaDeError(err);
  }
});
