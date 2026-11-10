import { z } from "zod";
import { apiError, withAuth } from "@/lib/api";
import { ArchivoError, subirArchivo } from "@/server/motor/archivos";
import { cargarMotor } from "@/server/motor/metadatos";

export const dynamic = "force-dynamic";

/**
 * Motor — subir un archivo para un campo galería (foto JPG), video (MP4) o
 * documento (PDF). Multipart: `archivo`, `tipo` (imagen | video | documento) y,
 * para respetar el tope del campo, `objeto` + `campo`. Devuelve el id que
 * después se guarda en el registro. Cualquiera del equipo puede subir: es
 * cargar datos, no cambiar la estructura.
 */
const tipoSchema = z.enum(["imagen", "video", "documento"]);

export const POST = withAuth(async (session, req: Request) => {
  const form = await req.formData().catch(() => null);
  const archivo = form?.get("archivo");
  const tipo = tipoSchema.safeParse(form?.get("tipo"));
  if (!(archivo instanceof File) || !tipo.success) {
    return apiError(422, "invalid_body", "Falta el archivo o el tipo");
  }
  // El tope del campo (video y documento), si se dice cuál es.
  let maxMb: number | null = null;
  const objeto = form?.get("objeto");
  const campo = form?.get("campo");
  if (typeof objeto === "string" && typeof campo === "string") {
    const motor = await cargarMotor(session.organizationId);
    maxMb = motor.objetos.get(objeto)?.campos.find((c) => c.clave === campo)?.limites?.maxMb ?? null;
  }
  try {
    const dto = await subirArchivo(session.organizationId, {
      datos: Buffer.from(await archivo.arrayBuffer()),
      nombre: archivo.name || null,
      esperado: tipo.data,
      maxMb,
    });
    return Response.json({ archivo: dto }, { status: 201 });
  } catch (err) {
    if (err instanceof ArchivoError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});
