import { apiError, parseBody, withAuth } from "@/lib/api";
import { DatosContactoError, datosSchema, guardarDatosContacto, leerDatosContacto } from "@/server/datos-contacto";
import { alcanceDe, noEncontrado, puedeVerContacto } from "@/server/acceso";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** War — Datos personales del contacto (DNI, CUIL, nacimiento, dirección…) y sus parientes. */
export const GET = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  if (!(await puedeVerContacto(alcanceDe(session), id))) return noEncontrado("Ese contacto");
  try {
    return Response.json({ datos: await leerDatosContacto(session.organizationId, id) });
  } catch (err) {
    if (err instanceof DatosContactoError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});

/** Guardar: solo las claves que vienen; `null` borra. */
export const PATCH = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  if (!(await puedeVerContacto(alcanceDe(session), id))) return noEncontrado("Ese contacto");
  const body = await parseBody(req, datosSchema);
  if (!body.ok) return body.response;
  try {
    await guardarDatosContacto(session.organizationId, id, body.data);
    return Response.json({ datos: await leerDatosContacto(session.organizationId, id) });
  } catch (err) {
    if (err instanceof DatosContactoError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});
