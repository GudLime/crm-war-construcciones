import { apiError, parseBody, withAuth } from "@/lib/api";
import { canConfigure } from "@/lib/auth/roles";
import { crearNota, listarNotas, NotaError, notaSchema } from "@/server/notas";
import { alcanceDe, noEncontrado, puedeVerConversacion } from "@/server/acceso";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** 050 — Las notas internas de la conversación, por hora. */
export const GET = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  if (!(await puedeVerConversacion(alcanceDe(session), id))) return noEncontrado("Esa conversación");
  try {
    const quien = { ...session, configura: canConfigure(session.role) };
    return Response.json({ notas: await listarNotas(quien, id) });
  } catch (err) {
    if (err instanceof NotaError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});

/** Escribir una nota: cualquiera del equipo. No envía nada al cliente. */
export const POST = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  if (!(await puedeVerConversacion(alcanceDe(session), id))) return noEncontrado("Esa conversación");
  const body = await parseBody(req, notaSchema);
  if (!body.ok) return body.response;
  try {
    const quien = { ...session, configura: canConfigure(session.role) };
    return Response.json({ nota: await crearNota(quien, id, body.data.texto) }, { status: 201 });
  } catch (err) {
    if (err instanceof NotaError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});
