import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import {
  VOCABULARIO_POR_DEFECTO,
  problemaDeVocabulario,
  vocabularioDe,
  type Vocabulario,
} from "@/lib/vocabulario";
import { leerConfigCliente } from "@/server/motor/sincronizar";

/**
 * 071 — El vocabulario de esta instancia, leído de `CLIENTE_CONFIG` una sola
 * vez por proceso (el archivo viene dentro de la imagen y no cambia sin un
 * despliegue). Un archivo con errores no tumba nada: se usa el de siempre y
 * el motor ya lista los errores en el log al arrancar.
 */
let cache: Promise<Vocabulario> | null = null;

export function vocabulario(): Promise<Vocabulario> {
  cache ??= leerConfigCliente()
    .then((r) => (r.estado === "ok" ? vocabularioDe(r.config) : VOCABULARIO_POR_DEFECTO))
    .catch(() => VOCABULARIO_POR_DEFECTO);
  return cache;
}

/** 071 — Una página apagada en el menú de este cliente: no existe. */
export async function pantallaApagada(p: "inicio" | "pipeline" | "tareas"): Promise<boolean> {
  return (await vocabulario()).menu.ocultas.includes(p);
}

/** Para las pruebas: vuelve a leer el archivo la próxima vez. */
export function olvidarVocabulario(): void {
  cache = null;
}

/**
 * Revisa un cambio pedido por una persona contra el vocabulario, comparando
 * con lo que la oportunidad ya tiene (dejarlo igual siempre vale). Devuelve
 * el problema o `null`.
 */
export async function revisarCambio(
  organizationId: string,
  oportunidadId: string | null,
  pedido: { estado?: string | null; motivoCierre?: string | null }
): Promise<string | null> {
  if (!pedido.estado && !pedido.motivoCierre) return null;
  const v = await vocabulario();
  let actual: { estado: string; motivoCierre: string | null } | undefined;
  if (oportunidadId) {
    [actual] = await getDb()
      .select({ estado: schema.oportunidad.estado, motivoCierre: schema.oportunidad.motivoCierre })
      .from(schema.oportunidad)
      .where(scoped(schema.oportunidad.organizationId, organizationId, eq(schema.oportunidad.id, oportunidadId)))
      .limit(1);
  }
  return problemaDeVocabulario(v, pedido, actual);
}
