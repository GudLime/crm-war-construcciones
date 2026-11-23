import { z } from "zod";
import { parseBody, withAuth } from "@/lib/api";
import { esAdmin } from "@/lib/auth/roles";
import { datosEdificiosSchema, datosFechasSchema } from "@/lib/resultados";
import { crearPestana, listarPestanas } from "@/server/resultados-pestanas";

export const dynamic = "force-dynamic";

/** Resultados — las pestañas guardadas de fechas y de edificios, y la última de cada fila. */
export const GET = withAuth(async (session) => {
  return Response.json({ ...(await listarPestanas(session)), admin: esAdmin(session.role) });
});

const nueva = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("fechas"), nombre: z.string().trim().min(1).max(60), datos: datosFechasSchema, compartida: z.boolean().optional() }),
  z.object({
    tipo: z.literal("edificios"),
    nombre: z.string().trim().min(1).max(60),
    datos: datosEdificiosSchema,
    compartida: z.boolean().optional(),
  }),
]);

/** Guardar una pestaña. Del equipo, solo si la guarda un admin. */
export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, nueva);
  if (!body.ok) return body.response;
  const compartida = Boolean(body.data.compartida) && esAdmin(session.role);
  const p = await crearPestana(session, body.data.tipo, body.data.nombre, body.data.datos, compartida);
  return Response.json({ pestana: p }, { status: 201 });
});
