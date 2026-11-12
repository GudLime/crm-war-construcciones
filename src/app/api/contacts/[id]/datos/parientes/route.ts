import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import {
  agregarPariente,
  DatosContactoError,
  leerDatosContacto,
  parienteSchema,
  quitarPariente,
} from "@/server/datos-contacto";
import { alcanceDe, noEncontrado, puedeVerContacto } from "@/server/acceso";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** War — Sumar un pariente `{ contactId, relacion? }`; se ve desde los dos contactos. */
export const POST = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  if (!(await puedeVerContacto(alcanceDe(session), id))) return noEncontrado("Ese contacto");
  const body = await parseBody(req, parienteSchema);
  if (!body.ok) return body.response;
  try {
    await agregarPariente(session.organizationId, id, body.data.contactId, body.data.relacion ?? null);
    return Response.json({ datos: await leerDatosContacto(session.organizationId, id) });
  } catch (err) {
    if (err instanceof DatosContactoError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});

/** Quitar el vínculo `{ contactId }`. */
export const DELETE = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  if (!(await puedeVerContacto(alcanceDe(session), id))) return noEncontrado("Ese contacto");
  const body = await parseBody(req, z.object({ contactId: z.string().min(1).max(40) }));
  if (!body.ok) return body.response;
  try {
    await quitarPariente(session.organizationId, id, body.data.contactId);
    return Response.json({ datos: await leerDatosContacto(session.organizationId, id) });
  } catch (err) {
    if (err instanceof DatosContactoError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});
