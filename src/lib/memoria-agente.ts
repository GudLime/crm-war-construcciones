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

/**
 * Una unidad en UNA línea que se entiende sola.
 *
 * Nea mete todo el conocimiento en un único texto JSON (`json.dumps`), así
 * que los saltos de línea le llegan como `\n` dentro de una sola línea larga
 * y el modelo pierde de vista a qué encabezado pertenece cada fila. Por eso
 * cada línea repite edificio y tipología, lleva el precio sin rodeos, la nota
 * en la misma línea (en otra se le atribuía a la unidad de al lado) y el
 * código al final, para que no lo use como título de la unidad.
 */
export function lineaUnidad(u: UnidadParaMemoria, edificio?: string): string {
  const partes: string[] = [];
  if (edificio) partes.push(edificio);
  if (u.tipologia) partes.push(etiqueta(TIPOLOGIAS, u.tipologia).toLowerCase());
  if (u.piso != null) partes.push(u.piso === 0 ? "planta baja" : `piso ${u.piso}`);
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
  if (u.notasAgente?.trim()) partes.push(`nota: ${u.notasAgente.trim().replace(/\s*\n\s*/g, " ")}`);
  partes.push(`código ${u.unidad}`);
  return `- ${partes.join(" · ")}`;
}

/** Orden por tipología (el del catálogo) y, dentro de cada una, de la más barata a la más cara. */
function porTipologiaYPrecio(unidades: readonly UnidadParaMemoria[]): Map<string, UnidadParaMemoria[]> {
  const orden = TIPOLOGIAS.map((t) => t.value as string);
  const grupos = new Map<string, UnidadParaMemoria[]>();
  const ordenadas = [...unidades].sort((a, b) => {
    const ia = a.tipologia ? orden.indexOf(a.tipologia) : 99;
    const ib = b.tipologia ? orden.indexOf(b.tipologia) : 99;
    if (ia !== ib) return ia - ib;
    const pa = a.valorCents ?? Number.POSITIVE_INFINITY;
    const pb = b.valorCents ?? Number.POSITIVE_INFINITY;
    if (pa !== pb) return pa - pb;
    return (a.piso ?? 0) - (b.piso ?? 0);
  });
  for (const u of ordenadas) {
    const clave = u.tipologia ? etiqueta(TIPOLOGIAS, u.tipologia) : "Sin tipología";
    const lista = grupos.get(clave) ?? [];
    lista.push(u);
    grupos.set(clave, lista);
  }
  return grupos;
}

/**
 * Rangos por tipología, calculados acá y no por el modelo: precio mínimo y
 * máximo (y metros) entre las unidades ofrecibles con precio. El agente da
 * primero el rango de la tipología; si tiene que recorrer la lista y hacer la
 * cuenta, un modelo rápido mezcla filas parecidas (caso 6B/6C, nov 2026).
 */
export function rangosPorTipologia(unidades: readonly UnidadParaMemoria[]): string[] {
  const grupos = new Map<string, UnidadParaMemoria[]>();
  for (const u of unidades) {
    const clave = u.tipologia ? etiqueta(TIPOLOGIAS, u.tipologia) : "Sin tipología";
    const lista = grupos.get(clave) ?? [];
    lista.push(u);
    grupos.set(clave, lista);
  }
  const orden = TIPOLOGIAS.map((t) => t.label as string);
  const claves = [...grupos.keys()].sort((a, b) => {
    const ia = orden.indexOf(a);
    const ib = orden.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  return claves.map((clave) => {
    const lista = grupos.get(clave)!;
    const partes: string[] = [`- ${clave}: ${plural(lista.length, "disponible", "disponibles")}`];
    const conPrecio = lista.filter((u) => u.valorCents != null);
    if (conPrecio.length > 0) {
      const monedas = [...new Set(conPrecio.map((u) => (u.moneda ?? "").trim()))];
      const moneda = monedas.length === 1 ? monedas[0] : "";
      const valores = conPrecio.map((u) => u.valorCents! / 100);
      const min = Math.min(...valores);
      const max = Math.max(...valores);
      const precio = (n: number) => `${moneda} ${fmt(n)}`.trim();
      partes.push(min === max ? `precio ${precio(min)}` : `de ${precio(min)} a ${precio(max)}`);
    }
    if (conPrecio.length < lista.length) {
      partes.push(`${lista.length - conPrecio.length} con precio a consultar`);
    }
    const metros = lista
      .map((u) =>
        metrosTotales({
          cubiertos: u.metrosCubiertos,
          semicubiertos: u.metrosSemicubiertos,
          descubiertos: u.metrosDescubiertos,
        })
      )
      .filter((m): m is number => m != null);
    if (metros.length > 0) {
      const mMin = Math.min(...metros);
      const mMax = Math.max(...metros);
      partes.push(mMin === mMax ? `${fmt(mMin)} m² totales` : `de ${fmt(mMin)} a ${fmt(mMax)} m² totales`);
    }
    return partes.join(" · ");
  });
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
    lineas.push("Rangos por tipología (calculados por el CRM; para dar un rango, copialo de acá):");
    lineas.push(...rangosPorTipologia(ofrecibles));
    lineas.push(`Unidades disponibles (${resumen}). Cada línea es UNA unidad y se entiende sola: precio y metros se copian de su propia línea, sin mezclar con otra.`);
    for (const [tipologia, lista] of porTipologiaYPrecio(ofrecibles)) {
      lineas.push(`${tipologia} en ${e.nombre}, de la más barata a la más cara (${plural(lista.length, "unidad", "unidades")}):`);
      for (const u of lista) lineas.push(lineaUnidad(u, e.nombre));
    }
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
