import { parseBody, withAuth } from "@/lib/api";
import { aDto, describirObjeto, entradaSchema, padreDeParametro, respuestaDeError } from "@/server/motor/api";
import { cargarMotor } from "@/server/motor/metadatos";
import { crearRegistro, listarRegistros, MotorError } from "@/server/motor/registros";

/**
 * Motor — registros de un objeto personalizado.
 *
 * GET: el objeto (campos, padres, hijos) y sus registros. Parámetros:
 * `q` (busca en el nombre), `padre=<relación>:<id>`, `f.<campo>=a,b`
 * (filtros), `limite`, `desde`.
 * POST: crea un registro. Cualquier usuario de la organización: el cliente
 * carga registros; la estructura no se toca desde acá.
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
    const motor = await cargarMotor(session.organizationId);
    const objeto = motor.objetos.get(clave);
    if (!objeto) throw new MotorError("objeto_desconocido", `No existe el objeto «${clave}»`);
    const { registros, total } = await listarRegistros(session.organizationId, clave, {
      busqueda: url.searchParams.get("q") ?? undefined,
      filtros,
      padre: padreDeParametro(url.searchParams.get("padre")),
      limite: Number(url.searchParams.get("limite")) || undefined,
      desde: Number(url.searchParams.get("desde")) || undefined,
    });
    return Response.json({ objeto: describirObjeto(motor, objeto), registros: registros.map(aDto), total });
  } catch (err) {
    return respuestaDeError(err);
  }
});

export const POST = withAuth(async (session, req: Request, ctx: Params) => {
  const { objeto: clave } = await ctx.params;
  const body = await parseBody(req, entradaSchema);
  if (!body.ok) return body.response;
  try {
    const registro = await crearRegistro(session.organizationId, clave, body.data, {
      tipo: "usuario",
      id: session.userId,
    });
    return Response.json({ registro: aDto(registro) }, { status: 201 });
  } catch (err) {
    return respuestaDeError(err);
  }
});
