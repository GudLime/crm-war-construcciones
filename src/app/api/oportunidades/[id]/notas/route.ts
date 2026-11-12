import { apiError, parseBody, withAuth } from "@/lib/api";
import { canConfigure } from "@/lib/auth/roles";
import {
  crearNotaDeOportunidad,
  listarNotasDeOportunidad,
  NotaError,
  notaSchema,
} from "@/server/notas";
import { alcanceDe, noEncontrado, puedeVerOportunidad } from "@/server/acceso";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** War — Las notas de una oportunidad (solo las suyas). */
export const GET = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  if (!(await puedeVerOportunidad(alcanceDe(session), id))) return noEncontrado("Esa oportunidad");
  try {
    const quien = { ...session, configura: canConfigure(session.role) };
    return Response.json({ notas: await listarNotasDeOportunidad(quien, id) });
  } catch (err) {
    if (err instanceof NotaError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});

/** Escribir una nota desde la oportunidad: también se ve en el chat del contacto. */
export const POST = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  if (!(await puedeVerOportunidad(alcanceDe(session), id))) return noEncontrado("Esa oportunidad");
  const body = await parseBody(req, notaSchema);
  if (!body.ok) return body.response;
  try {
    const quien = { ...session, configura: canConfigure(session.role) };
    return Response.json(
      { nota: await crearNotaDeOportunidad(quien, id, body.data.texto) },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof NotaError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});
