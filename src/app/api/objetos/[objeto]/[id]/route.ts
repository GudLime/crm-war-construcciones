import { parseBody, withAdmin, withAuth } from "@/lib/api";
import type { ObjetoDto, RegistroDto } from "@/lib/motor/dto";
import { aDto, describirObjeto, entradaSchema, respuestaDeError } from "@/server/motor/api";
import { recalcularPorRegistro } from "@/server/motor/interes";
import { cargarMotor } from "@/server/motor/metadatos";
import {
  actualizarRegistro,
  borrarRegistro,
  contarAsociados,
  historialRegistro,
  listarRegistros,
  MotorError,
  obtenerRegistro,
} from "@/server/motor/registros";

/**
 * Motor — un registro de un objeto personalizado.
 *
 * GET: el registro, sus padres (con nombre), sus hijos por relación, cuántos
 * asociados tiene (para la ventana de borrar) y su historial.
 * PATCH: edita lo que llega. DELETE `?modo=cascada|soltar`: con asociados,
 * hay que elegir qué hacer con ellos.
 */

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ objeto: string; id: string }> };

export const GET = withAuth(async (session, _req: Request, ctx: Params) => {
  const { objeto: clave, id } = await ctx.params;
  const org = session.organizationId;
  try {
    const motor = await cargarMotor(org);
    const objeto = motor.objetos.get(clave);
    if (!objeto) throw new MotorError("objeto_desconocido", `No existe el objeto «${clave}»`);
    const dto = describirObjeto(motor, objeto);
    const registro = await obtenerRegistro(org, clave, id);

    const padres: Record<string, { id: string; titulo: string; objeto: string } | null> = {};
    for (const p of dto.padres) {
      const padreId = registro.padres[p.clave];
      if (!padreId) {
        padres[p.clave] = null;
        continue;
      }
      const padre = await obtenerRegistro(org, p.objeto, padreId).catch(() => null);
      padres[p.clave] = padre ? { id: padre.id, titulo: padre.titulo, objeto: p.objeto } : null;
    }

    const hijos: { relacion: string; nombre: string; objeto: ObjetoDto; registros: RegistroDto[]; total: number }[] = [];
    for (const h of dto.hijos) {
      const hijo = motor.objetos.get(h.objeto);
      if (!hijo) continue;
      const lista = await listarRegistros(org, h.objeto, { padre: { relacion: h.clave, id }, limite: 500 });
      hijos.push({
        relacion: h.clave,
        nombre: h.nombre,
        objeto: describirObjeto(motor, hijo),
        registros: lista.registros.map(aDto),
        total: lista.total,
      });
    }

    return Response.json({
      objeto: dto,
      registro: aDto(registro),
      padres,
      hijos,
      asociados: await contarAsociados(org, clave, id),
      historial: await historialRegistro(org, clave, id),
    });
  } catch (err) {
    return respuestaDeError(err);
  }
});

export const PATCH = withAdmin(async (session, req: Request, ctx: Params) => {
  const { objeto: clave, id } = await ctx.params;
  const body = await parseBody(req, entradaSchema);
  if (!body.ok) return body.response;
  try {
    const registro = await actualizarRegistro(session.organizationId, clave, id, body.data, {
      tipo: "usuario",
      id: session.userId,
    });
    // El precio, los ambientes o el estado de una unidad cambian el Valor de
    // las oportunidades que la miran.
    await recalcularPorRegistro(session.organizationId, clave, id);
    return Response.json({ registro: aDto(registro) });
  } catch (err) {
    return respuestaDeError(err);
  }
});

export const DELETE = withAdmin(async (session, req: Request, ctx: Params) => {
  const { objeto: clave, id } = await ctx.params;
  const modo = new URL(req.url).searchParams.get("modo") === "cascada" ? "cascada" : "soltar";
  try {
    const borrados = await borrarRegistro(session.organizationId, clave, id, modo, {
      tipo: "usuario",
      id: session.userId,
    });
    return Response.json({ borrados });
  } catch (err) {
    return respuestaDeError(err);
  }
});
