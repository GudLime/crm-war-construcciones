/**
 * Memoria del agente: los edificios con el interruptor «Memoria del agente»
 * prendido, en texto, para sumar al conocimiento que el CRM le pasa al
 * cerebro (`GET /api/bot/profile` → `kb`) y al juez del Laboratorio.
 *
 * Qué entra: datos del edificio, sus notas para el agente y las unidades que
 * se pueden ofrecer (Disponible y Consultar disponibilidad), con sus notas.
 * Las reservadas y vendidas no se listan: solo se cuentan. Así el agente no
 * ofrece lo que no hay y la memoria no crece con unidades que ya no importan.
 *
 * Puro: se prueba sin base.
 */

import {
  ESTADOS_EDIFICIO,
  TIPOLOGIAS,
  etiqueta,
  metrosTotales,
  type EstadoEdificio,
  type EstadoUnidad,
  type Tipologia,
} from "@/lib/ventas";

export type UnidadParaMemoria = {
  unidad: string;
  piso: number | null;
  tipologia: Tipologia | null;
  metrosCubiertos: number | null;
  metrosSemicubiertos: number | null;
  metrosDescubiertos: number | null;
  valorCents: number | null;
  moneda: string | null;
  estado: EstadoUnidad;
  dormitorios: number | null;
  banos: number | null;
  toilette: number | null;
  enSuite: number | null;
  notasAgente: string | null;
};

export type EdificioParaMemoria = {
  nombre: string;
  direccion: string | null;
  estado: EstadoEdificio;
  enVenta: string | null;
  notasAgente: string | null;
  unidades: UnidadParaMemoria[];
};

const OFRECIBLES: readonly EstadoUnidad[] = ["disponible", "consultar"];

const fmt = (n: number) => new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(n);

function plural(n: number, uno: string, varios: string) {
  return `${n} ${n === 1 ? uno : varios}`;
}

function lineaUnidad(u: UnidadParaMemoria): string {
  const partes: string[] = [`Unidad ${u.unidad}`];
  if (u.piso != null) partes.push(u.piso === 0 ? "planta baja" : `piso ${u.piso}`);
  if (u.tipologia) partes.push(etiqueta(TIPOLOGIAS, u.tipologia).toLowerCase());
  if (u.dormitorios != null) partes.push(plural(u.dormitorios, "dormitorio", "dormitorios"));
  if (u.banos != null) {
    let b = plural(u.banos, "baño", "baños");
    if (u.enSuite) b += ` (${u.enSuite} en suite)`;
    partes.push(b);
  }
  if (u.toilette) partes.push("toilette");
  const total = metrosTotales({
    cubiertos: u.metrosCubiertos,
    semicubiertos: u.metrosSemicubiertos,
    descubiertos: u.metrosDescubiertos,
  });
  if (total != null) {
    const detalle = [
      u.metrosCubiertos ? `${fmt(u.metrosCubiertos)} cubiertos` : null,
      u.metrosSemicubiertos ? `${fmt(u.metrosSemicubiertos)} semicubiertos` : null,
      u.metrosDescubiertos ? `${fmt(u.metrosDescubiertos)} descubiertos` : null,
    ].filter(Boolean);
    partes.push(`${fmt(total)} m² totales${detalle.length > 1 ? ` (${detalle.join(" + ")})` : ""}`);
  }
  partes.push(
    u.valorCents != null
      ? `precio ${u.moneda ?? ""} ${fmt(u.valorCents / 100)}`.replace(/\s+/g, " ")
      : "precio a consultar"
  );
  if (u.estado === "consultar") partes.push("disponibilidad a confirmar con el equipo");
  let linea = `- ${partes.join(" · ")}`;
  if (u.notasAgente?.trim()) linea += `\n  Nota: ${u.notasAgente.trim()}`;
  return linea;
}

/** Un edificio en texto. */
export function renderEdificioParaMemoria(e: EdificioParaMemoria): string {
  const lineas: string[] = [`### Edificio ${e.nombre}`];
  if (e.direccion) lineas.push(`Dirección: ${e.direccion}`);
  lineas.push(`Estado de obra: ${etiqueta(ESTADOS_EDIFICIO, e.estado)}`);
  if (e.enVenta?.trim()) lineas.push(`En venta: ${e.enVenta.trim()}`);
  if (e.notasAgente?.trim()) lineas.push(`Notas: ${e.notasAgente.trim()}`);

  const ofrecibles = e.unidades.filter((u) => OFRECIBLES.includes(u.estado));
  const reservadas = e.unidades.filter((u) => u.estado === "reservado").length;
  const vendidas = e.unidades.filter((u) => u.estado === "vendido").length;
  const resumen = [
    `${ofrecibles.length} disponibles de ${e.unidades.length}`,
    reservadas ? plural(reservadas, "reservada", "reservadas") : null,
    vendidas ? plural(vendidas, "vendida", "vendidas") : null,
  ]
    .filter(Boolean)
    .join(", ");
  if (e.unidades.length === 0) {
    lineas.push("Unidades: todavía no están cargadas.");
  } else if (ofrecibles.length === 0) {
    lineas.push(`Unidades: no quedan disponibles (${resumen}).`);
  } else {
    lineas.push(`Unidades disponibles (${resumen}):`);
    for (const u of ofrecibles) lineas.push(lineaUnidad(u));
  }
  return lineas.join("\n");
}

/** Todos los edificios en memoria, con un encabezado; vacío si no hay ninguno. */
export function renderMemoriaAgente(edificios: readonly EdificioParaMemoria[]): string {
  if (edificios.length === 0) return "";
  return [
    "## Edificios de la constructora (datos del CRM, actualizados)",
    "Esta es la información vigente de cada edificio. Usala para responder; no inventes unidades, precios ni metros que no estén acá.",
    ...edificios.map(renderEdificioParaMemoria),
  ].join("\n\n");
}

/** El conocimiento del negocio más la memoria de edificios. */
export function conMemoria(kbRenderizado: string, memoria: string): string {
  if (!memoria) return kbRenderizado;
  if (!kbRenderizado.trim() || kbRenderizado.trim() === "(knowledge base vacío)") return memoria;
  return `${kbRenderizado}\n\n${memoria}`;
}
