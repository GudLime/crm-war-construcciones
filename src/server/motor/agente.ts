import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import {
  renderObjetosParaAgente,
  type ObjetoParaAgente,
  type RegistroParaAgente,
} from "@/lib/motor/agente";
import { getBranding } from "@/server/branding";
import { cargarMotor, type Motor, type ObjetoMeta } from "./metadatos";
import { listarRegistros } from "./registros";

/**
 * Motor — los objetos visibles para el agente, en texto, para sumar al
 * conocimiento que el CRM le pasa al cerebro (`GET /api/bot/profile`) y al
 * juez del Laboratorio. Nunca lanza: si algo falla, el agente sigue con el
 * resto de su conocimiento.
 */

/** Cuántos registros se leen por objeto (el texto igual se recorta antes). */
const LECTURA_MAXIMA = 1000;

function paraAgente(motor: Motor, o: ObjetoMeta): ObjetoParaAgente {
  return {
    clave: o.clave,
    nombre: o.nombre,
    nombrePlural: o.nombrePlural,
    titulo: o.titulo,
    agente: o.agente,
    campos: o.campos,
    padres: motor.relaciones
      .filter((r) => r.tipo === "uno_a_muchos" && r.columna && r.hacia === o.clave && motor.objetos.has(r.desde))
      .map((r) => ({ clave: r.clave, objeto: r.desde, nombre: r.nombreHacia })),
  };
}

export async function textoDeObjetosParaAgente(
  organizationId: string,
  opciones: { simular?: string[] } = {}
): Promise<string> {
  try {
    const motor = await cargarMotor(organizationId);
    // `simular`: la vista previa del administrador puede ver cómo quedaría con
    // objetos que todavía están apagados, sin prenderlos para el agente.
    const simular = new Set(opciones.simular ?? []);
    const visibles = [...motor.objetos.values()].filter((o) => o.visibleAgente || simular.has(o.clave));
    if (!visibles.length) return "";
    const registros = new Map<string, RegistroParaAgente[]>();
    for (const o of visibles) {
      const { registros: regs } = await listarRegistros(organizationId, o.clave, { limite: LECTURA_MAXIMA });
      registros.set(
        o.clave,
        regs.map((r) => ({ id: r.id, titulo: r.titulo, valores: r.valores, padres: r.padres }))
      );
    }
    const moneda = (await getBranding(organizationId)).currency;
    return renderObjetosParaAgente({
      objetos: visibles.map((o) => paraAgente(motor, o)),
      registros,
      moneda,
    });
  } catch (err) {
    console.error("[motor] no se pudieron leer los objetos para el agente:", err);
    return "";
  }
}

/**
 * WAR — la memoria de edificios de antes (`memoriaDeEdificios`) se apaga sola
 * cuando un objeto del motor que adopta `edificio` está visible para el
 * agente: así no le llega todo dos veces. `simular` cuenta como visible.
 */
export async function memoriaViejaReemplazada(
  organizationId: string,
  opciones: { simular?: string[] } = {}
): Promise<boolean> {
  try {
    const motor = await cargarMotor(organizationId);
    const simular = new Set(opciones.simular ?? []);
    return [...motor.objetos.values()].some(
      (o) => o.adoptada && o.tabla === "edificio" && (o.visibleAgente || simular.has(o.clave))
    );
  } catch {
    return false;
  }
}

/**
 * Prende o apaga lo que ve el agente: el objeto entero y/o columnas sueltas.
 * Solo el administrador (lo controla la ruta). Las claves que no existen se
 * ignoran: la estructura no se toca desde acá.
 */
export async function cambiarVisibilidadAgente(
  organizationId: string,
  objetoClave: string,
  cambio: { visible?: boolean; campos?: Record<string, boolean> }
): Promise<boolean> {
  const db = getDb();
  const [objeto] = await db
    .select({ id: schema.motorObjeto.id })
    .from(schema.motorObjeto)
    .where(
      scoped(
        schema.motorObjeto.organizationId,
        organizationId,
        and(eq(schema.motorObjeto.clave, objetoClave), eq(schema.motorObjeto.archivado, false))
      )
    )
    .limit(1);
  if (!objeto) return false;
  await db.transaction(async (tx) => {
    if (cambio.visible !== undefined) {
      await tx
        .update(schema.motorObjeto)
        .set({ visibleAgente: cambio.visible, updatedAt: new Date() })
        .where(scoped(schema.motorObjeto.organizationId, organizationId, eq(schema.motorObjeto.id, objeto.id)));
    }
    for (const valor of [true, false]) {
      const claves = Object.entries(cambio.campos ?? {})
        .filter(([, v]) => v === valor)
        .map(([k]) => k);
      if (!claves.length) continue;
      await tx
        .update(schema.motorCampo)
        .set({ visibleAgente: valor, updatedAt: new Date() })
        .where(
          scoped(
            schema.motorCampo.organizationId,
            organizationId,
            and(eq(schema.motorCampo.objetoId, objeto.id), inArray(schema.motorCampo.clave, claves))
          )
        );
    }
  });
  return true;
}
