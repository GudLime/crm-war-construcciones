import { z } from "zod";
import { parseBody, withAdmin } from "@/lib/api";
import { noEncontrado } from "@/server/acceso";
import { activarPlantilla, borrarPlantilla, editarPlantilla, plantillaSchema } from "@/server/plantillas-tareas";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Guardar cambios de una plantilla (todo) o solo prenderla/pausarla (`{ activa }`). */
const cambio = z.union([plantillaSchema, z.object({ activa: z.boolean() }).strict()]);

export const PATCH = withAdmin(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, cambio);
  if (!body.ok) return body.response;
  if (!("nombre" in body.data)) {
    if (!(await activarPlantilla(session.organizationId, id, body.data.activa))) return noEncontrado("Esa plantilla");
    return Response.json({ ok: true });
  }
  const p = await editarPlantilla(session.organizationId, id, body.data);
  if (!p) return noEncontrado("Esa plantilla");
  return Response.json({ plantilla: p });
});

export const DELETE = withAdmin(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  if (!(await borrarPlantilla(session.organizationId, id))) return noEncontrado("Esa plantilla");
  return Response.json({ ok: true });
});
