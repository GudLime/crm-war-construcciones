import { conMemoria } from "@/lib/memoria-agente";
import { textoPlantillasParaAgente } from "@/lib/plantillas-agente";
import { plantillasDelAgente } from "@/server/quick-replies";
import { memoriaViejaReemplazada, textoDeObjetosParaAgente } from "@/server/motor/agente";
import { memoriaDeEdificios } from "@/server/ventas";
import { enZona } from "@/lib/reservas";
import { textoDeReservasParaAgente } from "@/lib/reservas-agente";
import { getBranding } from "@/server/branding";
import { reservasEnabled } from "@/server/reservas/flag";
import { leerConfiguracion } from "@/server/reservas/servicio";

/** 071 — Los datos del restaurante de Ajustes → Reservas, si el módulo está encendido. */
async function datosDelRestaurante(organizationId: string): Promise<string> {
  if (!reservasEnabled()) return "";
  const [config, branding] = await Promise.all([leerConfiguracion(organizationId), getBranding(organizationId)]);
  return textoDeReservasParaAgente({
    nombre: branding.name,
    ajustes: config.ajustes,
    horarios: config.horarios,
    cierres: config.cierres,
    hoy: enZona(new Date(), config.ajustes.zonaHoraria).fecha,
  });
}

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
  const [reemplazada, motor, restaurante, plantillas] = await Promise.all([
    memoriaViejaReemplazada(organizationId, opciones),
    textoDeObjetosParaAgente(organizationId, opciones),
    datosDelRestaurante(organizationId),
    // v7 — Las plantillas marcadas para el agente.
    plantillasDelAgente(organizationId)
      .then(textoPlantillasParaAgente)
      .catch(() => ""),
  ]);
  const memoriaVieja = reemplazada ? "" : await memoriaDeEdificios(organizationId);
  return {
    texto: conMemoria(conMemoria(conMemoria(conMemoria(kbRenderizado, memoriaVieja), motor), restaurante), plantillas),
    memoriaVieja,
    motor,
  };
}
