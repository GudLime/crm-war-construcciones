import { z } from "zod";
import { apiError, parseBody, withAdmin, withAuth } from "@/lib/api";
import { guardarResponsableDerivaciones, leerResponsableDerivaciones } from "@/server/derivaciones";
import { listarResponsables } from "@/server/responsables";

export const dynamic = "force-dynamic";

/** Cambios 23/11 — A quién van las tareas que crea la IA al derivar (null = sin asignar). */
export const GET = withAuth(async (session) => {
  return Response.json({ userId: await leerResponsableDerivaciones(session.organizationId) });
});

export const PUT = withAdmin(async (session, req: Request) => {
  const body = await parseBody(req, z.object({ userId: z.string().min(1).max(60).nullable() }));
  if (!body.ok) return body.response;
  const { userId } = body.data;
  if (userId && !(await listarResponsables(session.organizationId)).some((r) => r.userId === userId)) {
    return apiError(422, "persona_desconocida", "Esa persona no es del equipo");
  }
  await guardarResponsableDerivaciones(session.organizationId, userId);
  return Response.json({ userId });
});
