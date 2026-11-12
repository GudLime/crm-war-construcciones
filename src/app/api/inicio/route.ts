import { apiError, withAuth } from "@/lib/api";
import { esAdmin } from "@/lib/auth/roles";
import type { InicioDto } from "@/lib/inicio";
import { contadoresDeInicio, derivadasSinTomar, leadsCalientes, nuevasParaVos, tuDia } from "@/server/inicio";
import { listarResponsables, nombreDelAgente } from "@/server/responsables";

export const dynamic = "force-dynamic";

/**
 * Inicio del vendedor: los contadores de quien mira (`?usuario=me`, por
 * defecto). Un admin puede pedir los de otra persona del equipo (`?usuario=<id>`).
 */
export const GET = withAuth(async (session, req: Request) => {
  const org = session.organizationId;
  const admin = esAdmin(session.role);
  const pedido = new URL(req.url).searchParams.get("usuario");
  const userId = !pedido || pedido === "me" ? session.userId : pedido;
  if (userId !== session.userId && !admin) {
    return apiError(403, "forbidden", "Solo un admin puede ver el Inicio de otra persona");
  }
  const equipo = await listarResponsables(org);
  const persona = equipo.find((m) => m.userId === userId);
  if (!persona) return apiError(404, "not_found", "Esa persona no es del equipo");
  const [contadores, agente, derivadas, dia, nuevas, calientes] = await Promise.all([
    contadoresDeInicio(org, userId),
    nombreDelAgente(org),
    derivadasSinTomar(org),
    tuDia(org, userId),
    nuevasParaVos(org, userId),
    leadsCalientes(org, userId),
  ]);
  const dto: InicioDto = {
    usuario: { id: userId, nombre: persona.nombre },
    agente,
    admin,
    contadores,
    derivadas,
    tuDia: dia,
    nuevas,
    calientes,
  };
  return Response.json(dto);
});
