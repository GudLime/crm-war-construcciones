import { z } from "zod";
import { STATUS_ERROR, type ObjetoDto, type ObjetoMenuDto, type RegistroDto } from "@/lib/motor/dto";
import { cargarMotor, type Motor, type ObjetoMeta } from "./metadatos";
import { MotorError, type Registro } from "./registros";

/**
 * Motor — de los metadatos y registros del servidor a lo que ven las
 * pantallas, y de los errores del motor a respuestas HTTP.
 */

export function describirObjeto(motor: Motor, objeto: ObjetoMeta): ObjetoDto {
  const unoAMuchos = motor.relaciones.filter((r) => r.tipo === "uno_a_muchos" && r.columna);
  return {
    clave: objeto.clave,
    nombre: objeto.nombre,
    nombrePlural: objeto.nombrePlural,
    icono: objeto.icono,
    titulo: objeto.titulo,
    visibleAgente: objeto.visibleAgente,
    campos: objeto.campos.map((c) => ({
      clave: c.clave,
      nombre: c.nombre,
      tipo: c.tipo,
      obligatorio: c.obligatorio,
      editable: c.columna !== null,
      opciones: c.opciones,
      visibleLista: c.visibleLista,
      visibleAgente: c.visibleAgente,
    })),
    padres: unoAMuchos
      .filter((r) => r.hacia === objeto.clave && motor.objetos.has(r.desde))
      .map((r) => ({ clave: r.clave, objeto: r.desde, nombre: r.nombreHacia, obligatoria: r.obligatoria })),
    hijos: unoAMuchos
      .filter((r) => r.desde === objeto.clave && motor.objetos.has(r.hacia))
      .map((r) => ({ clave: r.clave, objeto: r.hacia, nombre: r.nombreDesde, obligatoria: r.obligatoria })),
  };
}

export function aDto(r: Registro): RegistroDto {
  const valores: RegistroDto["valores"] = {};
  for (const [k, v] of Object.entries(r.valores)) valores[k] = v instanceof Date ? v.toISOString() : v;
  return {
    id: r.id,
    titulo: r.titulo,
    valores,
    padres: r.padres,
    creadoEn: r.creadoEn ? r.creadoEn.toISOString() : null,
  };
}

/** Los objetos de la organización, para el menú. Si algo falla, el menú sigue sin ellos. */
export async function objetosDelMenu(organizationId: string): Promise<ObjetoMenuDto[]> {
  try {
    const motor = await cargarMotor(organizationId);
    return [...motor.objetos.values()].map((o) => ({
      clave: o.clave,
      nombrePlural: o.nombrePlural,
      icono: o.icono,
    }));
  } catch (err) {
    console.error("[motor] no se pudo armar el menú de objetos:", err);
    return [];
  }
}

/** Un error del motor como respuesta; cualquier otro error se relanza. */
export function respuestaDeError(err: unknown): Response {
  if (err instanceof MotorError) {
    const status = STATUS_ERROR[err.codigo] ?? 422;
    return Response.json(
      { error: { code: err.codigo, message: err.message, detalles: err.detalles } },
      { status }
    );
  }
  throw err;
}

/** Lo que llega para crear o editar un registro. */
export const entradaSchema = z.object({
  valores: z.record(z.string(), z.unknown()).optional(),
  padres: z.record(z.string(), z.string().nullable()).optional(),
});

/** `padre=<relación>:<id>` → { relacion, id }. */
export function padreDeParametro(valor: string | null): { relacion: string; id: string } | undefined {
  if (!valor) return undefined;
  const corte = valor.indexOf(":");
  if (corte <= 0 || corte === valor.length - 1) return undefined;
  return { relacion: valor.slice(0, corte), id: valor.slice(corte + 1) };
}
