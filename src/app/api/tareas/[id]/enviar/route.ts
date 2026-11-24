import { withAuth } from "@/lib/api";
import { accesoATarea, alcanceDe, noEncontrado, prohibido } from "@/server/acceso";
import { enviarTarea } from "@/server/tareas-envio";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * v3 — «Enviar ahora» el WhatsApp de una tarea. Si no puede salir (la ventana
 * cerrada, una conversación de prueba…) la tarea queda Pendiente con el aviso
 * y la respuesta lo cuenta: `{ enviado: false, aviso }`.
 */
export const POST = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const acceso = await accesoATarea(alcanceDe(session), id);
  if (acceso === null) return noEncontrado("Esa tarea");
  if (acceso === "leer") return prohibido("Esa tarea es de otra persona: la podés ver, no cambiar");
  return Response.json(await enviarTarea(session.organizationId, id));
});
