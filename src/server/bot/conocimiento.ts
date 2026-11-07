import { conMemoria } from "@/lib/memoria-agente";
import { memoriaViejaReemplazada, textoDeObjetosParaAgente } from "@/server/motor/agente";
import { memoriaDeEdificios } from "@/server/ventas";

/**
 * Lo que el agente lee además de su base de conocimiento: la memoria de
 * edificios de antes (WAR) y los objetos del motor visibles para él. Un solo
 * lugar para el perfil del cerebro, el juez del Laboratorio y la vista previa
 * del administrador: los tres ven exactamente lo mismo.
 *
 * Cuando Edificio pasa al motor y se prende para el agente, la memoria vieja
 * se apaga sola (no se manda dos veces).
 */
export type Conocimiento = {
  texto: string;
  memoriaVieja: string;
  motor: string;
};

export async function conocimientoDelAgente(
  organizationId: string,
  kbRenderizado: string,
  opciones: { simular?: string[] } = {}
): Promise<Conocimiento> {
  const [reemplazada, motor] = await Promise.all([
    memoriaViejaReemplazada(organizationId, opciones),
    textoDeObjetosParaAgente(organizationId, opciones),
  ]);
  const memoriaVieja = reemplazada ? "" : await memoriaDeEdificios(organizationId);
  return { texto: conMemoria(conMemoria(kbRenderizado, memoriaVieja), motor), memoriaVieja, motor };
}
