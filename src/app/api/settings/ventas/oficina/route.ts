import { eq } from "drizzle-orm";
import { z } from "zod";
import { parseBody, withAdmin, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * 0058 — La dirección de la oficina: la ubicación de las reuniones formales
 * (reservas, boletos). La lee cualquiera del equipo al crear una reunión; la
 * cambia el admin en Ajustes → Ventas.
 */
async function leer(organizationId: string): Promise<string> {
  const [f] = await getDb()
    .select({ direccion: schema.ventasAjustes.direccionOficina })
    .from(schema.ventasAjustes)
    .where(eq(schema.ventasAjustes.organizationId, organizationId))
    .limit(1);
  return f?.direccion ?? "";
}

export const GET = withAuth(async (session) => {
  return Response.json({ direccion: await leer(session.organizationId) });
});

const schemaOficina = z.object({ direccion: z.string().trim().max(300) });

export const PUT = withAdmin(async (session, req: Request) => {
  const body = await parseBody(req, schemaOficina);
  if (!body.ok) return body.response;
  const valores = { direccionOficina: body.data.direccion, updatedAt: new Date() };
  await getDb()
    .insert(schema.ventasAjustes)
    .values({ organizationId: session.organizationId, ...valores })
    .onConflictDoUpdate({ target: schema.ventasAjustes.organizationId, set: valores });
  return Response.json({ direccion: body.data.direccion });
});
