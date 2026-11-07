import { formatMoneyCents } from "@/lib/money";
import type { AgenteObjeto } from "@/lib/db/motor-tables";
import { aNumero, type CampoMeta, type Valor } from "./valores";

/**
 * Motor — lo que el agente lee de los objetos personalizados. Puro: sin base.
 *
 * Entran solo los objetos con «visible para el agente» prendido y, de cada
 * uno, solo las columnas con el ícono de IA prendido (el título va siempre:
 * es el nombre del registro). Lo decide el administrador desde la tabla.
 *
 * Cada registro va en UNA línea que se entiende sola: repite el nombre de sus
 * padres («Olazábal 2649») porque el cerebro recibe todo el conocimiento como
 * un único texto y pierde de vista a qué encabezado pertenece cada fila.
 *
 * Con `agente` en la configuración del objeto:
 * - `filtro`: solo se listan los registros que lo cumplen; los demás se
 *   cuentan por el valor del primer campo del filtro («3 Reservado»). Si un
 *   padre quedó afuera por su filtro, sus hijos tampoco entran.
 * - `agruparPor` + `rangos`: un resumen por grupo con mínimo y máximo, para
 *   que el agente copie el rango en vez de hacer la cuenta. Las líneas van
 *   ordenadas por grupo y, dentro, de menor a mayor por el primer rango.
 */

/** Tope de líneas por objeto: el conocimiento no crece sin límite. */
export const MAX_LINEAS_AGENTE = 400;

export type ObjetoParaAgente = {
  clave: string;
  nombre: string;
  nombrePlural: string;
  titulo: string[];
  agente: AgenteObjeto | null;
  campos: CampoMeta[];
  /** Relaciones uno a muchos que llegan a este objeto (sus padres). */
  padres: { clave: string; objeto: string; nombre: string }[];
};

export type RegistroParaAgente = {
  id: string;
  titulo: string;
  valores: Record<string, Valor>;
  padres: Record<string, string | null>;
};

export type DatosParaAgente = {
  /** En orden de presentación (padres antes que hijos). */
  objetos: ObjetoParaAgente[];
  registros: Map<string, RegistroParaAgente[]>;
  /** Moneda del negocio, para los campos de moneda. */
  moneda: string;
};

const fmt = (n: number) => new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(n);

/** Un valor como lo lee el agente; `null` si no hay nada que decir. */
export function valorParaAgente(campo: CampoMeta, valor: Valor | undefined, moneda: string): string | null {
  if (valor === null || valor === undefined || valor === "") return null;
  if (Array.isArray(valor) && valor.length === 0) return null;
  switch (campo.tipo) {
    case "moneda": {
      const n = typeof valor === "number" ? valor : aNumero(valor);
      return n === null ? String(valor) : formatMoneyCents(n, moneda, "es-AR");
    }
    case "numero":
    case "calculado": {
      const n = typeof valor === "number" ? valor : aNumero(valor);
      return n === null ? String(valor) : fmt(n);
    }
    case "booleano":
      return valor === true || valor === "true" ? "sí" : "no";
    case "fecha": {
      const d = valor instanceof Date ? valor : new Date(String(valor));
      return Number.isNaN(d.getTime()) ? String(valor) : new Intl.DateTimeFormat("es-AR", { timeZone: "UTC" }).format(d);
    }
    case "seleccion":
      return campo.opciones?.find((o) => o.valor === valor)?.nombre ?? String(valor);
    case "seleccion_multiple":
      return (Array.isArray(valor) ? valor : [String(valor)])
        .map((v) => campo.opciones?.find((o) => o.valor === v)?.nombre ?? v)
        .join(", ");
    case "imagen":
      return null;
    default:
      return String(valor).replace(/\s+/g, " ").trim() || null;
  }
}

/** Si el registro cumple el filtro del objeto (sin filtro, siempre). */
export function cumpleFiltro(objeto: ObjetoParaAgente, r: RegistroParaAgente): boolean {
  for (const [clave, aceptados] of Object.entries(objeto.agente?.filtro ?? {})) {
    const v = r.valores[clave];
    const lista = Array.isArray(v) ? v : v === null || v === undefined ? [] : [String(v)];
    if (!lista.some((x) => aceptados.includes(String(x)))) return false;
  }
  return true;
}

function numero(v: Valor | undefined): number | null {
  return typeof v === "number" ? v : aNumero(v);
}

function plural(n: number, uno: string, varios: string) {
  return `${n} ${n === 1 ? uno.toLowerCase() : varios.toLowerCase()}`;
}

/** Ids de los registros que entran, objeto por objeto (respeta filtros de los padres). */
function incluidos(datos: DatosParaAgente): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const pendientes = [...datos.objetos];
  // Padres primero: un hijo mira si su padre entró. Los objetos sin datos
  // del padre (padre no visible) no se filtran por él.
  for (let vuelta = 0; pendientes.length && vuelta < 20; vuelta++) {
    for (let i = pendientes.length - 1; i >= 0; i--) {
      const o = pendientes[i]!;
      const padresVisibles = o.padres.filter((p) => datos.registros.has(p.objeto) && p.objeto !== o.clave);
      if (padresVisibles.some((p) => !out.has(p.objeto))) continue;
      const set = new Set<string>();
      for (const r of datos.registros.get(o.clave) ?? []) {
        if (!cumpleFiltro(o, r)) continue;
        const padreAfuera = padresVisibles.some((p) => {
          const pid = r.padres[p.clave];
          return pid ? !out.get(p.objeto)?.has(pid) : false;
        });
        if (!padreAfuera) set.add(r.id);
      }
      out.set(o.clave, set);
      pendientes.splice(i, 1);
    }
  }
  return out;
}

/** Los registros que quedaron afuera por el filtro, contados por el primer campo del filtro. */
function contarExcluidos(o: ObjetoParaAgente, excluidos: RegistroParaAgente[], moneda: string): string | null {
  if (!excluidos.length) return null;
  const clave = Object.keys(o.agente?.filtro ?? {})[0];
  const campo = clave ? o.campos.find((c) => c.clave === clave) : undefined;
  // Por estado («3 reservado») solo si es una selección; un booleano («1 no») no le dice nada.
  if (!campo || (campo.tipo !== "seleccion" && campo.tipo !== "seleccion_multiple")) {
    return `Además hay ${plural(excluidos.length, o.nombre, o.nombrePlural)} que no ${excluidos.length === 1 ? "se ofrece" : "se ofrecen"}.`;
  }
  const conteo = new Map<string, number>();
  for (const r of excluidos) {
    const k = valorParaAgente(campo, r.valores[campo.clave], moneda) ?? "sin dato";
    conteo.set(k, (conteo.get(k) ?? 0) + 1);
  }
  const partes = [...conteo.entries()].map(([k, n]) => `${n} ${k.toLowerCase()}`);
  return `No se ofrecen (solo para tu referencia): ${partes.join(", ")}.`;
}

/** El padre que encabeza los grupos (el edificio de cada unidad), si se lista. */
type PadreDe = (r: RegistroParaAgente) => string | null;

/** Clave de grupo y su nombre: padre (si hay) + valor del campo de agrupar. */
function grupoDe(o: ObjetoParaAgente, r: RegistroParaAgente, moneda: string, padreDe?: PadreDe) {
  const agrupar = o.agente?.agruparPor ? o.campos.find((c) => c.clave === o.agente?.agruparPor) : undefined;
  const padre = padreDe?.(r) ?? null;
  const valor = agrupar ? (valorParaAgente(agrupar, r.valores[agrupar.clave], moneda) ?? `Sin ${agrupar.nombre.toLowerCase()}`) : null;
  const crudo = agrupar ? numero(r.valores[agrupar.clave]) : null;
  const partes = [padre, agrupar && valor ? `${agrupar.nombre} ${valor}` : null].filter(Boolean);
  return { clave: `${padre ?? ""}\u0000${valor ?? ""}`, nombre: partes.join(" · ") || o.nombrePlural, padre: padre ?? "", valor: valor ?? "", crudo };
}

/** Orden de grupos: por padre y, dentro, por el valor (numérico si se puede). */
function compararGrupos(a: ReturnType<typeof grupoDe>, b: ReturnType<typeof grupoDe>): number {
  const p = a.padre.localeCompare(b.padre, "es");
  if (p) return p;
  if (a.crudo !== null && b.crudo !== null) return a.crudo - b.crudo;
  if (a.crudo !== null) return -1;
  if (b.crudo !== null) return 1;
  return a.valor.localeCompare(b.valor, "es");
}

function resumenPorGrupo(o: ObjetoParaAgente, lista: RegistroParaAgente[], moneda: string, padreDe?: PadreDe): string[] {
  const agrupar = o.agente?.agruparPor ? o.campos.find((c) => c.clave === o.agente?.agruparPor) : undefined;
  const rangos = (o.agente?.rangos ?? [])
    .map((k) => o.campos.find((c) => c.clave === k))
    // Una columna oculta para el agente tampoco se filtra por el resumen.
    .filter((c): c is CampoMeta => Boolean(c?.visibleAgente));
  if (!agrupar && !rangos.length) return [];
  const grupos = new Map<string, { g: ReturnType<typeof grupoDe>; regs: RegistroParaAgente[] }>();
  for (const r of lista) {
    const g = grupoDe(o, r, moneda, padreDe);
    const actual = grupos.get(g.clave) ?? { g, regs: [] };
    actual.regs.push(r);
    grupos.set(g.clave, actual);
  }
  const lineas = [`Resumen${agrupar ? ` por ${agrupar.nombre.toLowerCase()}` : ""} (copiá estos rangos tal cual, no hagas cuentas):`];
  for (const { g, regs } of [...grupos.values()].sort((a, b) => compararGrupos(a.g, b.g))) {
    const partes = [`- ${g.nombre}: ${regs.length}`];
    for (const c of rangos) {
      const nums = regs.map((r) => numero(r.valores[c.clave])).filter((n): n is number => n !== null);
      if (nums.length) {
        const min = valorParaAgente(c, Math.min(...nums), moneda);
        const max = valorParaAgente(c, Math.max(...nums), moneda);
        partes.push(min === max ? `${c.nombre.toLowerCase()} ${min}` : `${c.nombre.toLowerCase()} de ${min} a ${max}`);
      }
      if (nums.length < regs.length) partes.push(`${regs.length - nums.length} sin ${c.nombre.toLowerCase()}`);
    }
    lineas.push(partes.join("; "));
  }
  return lineas;
}

function ordenar(o: ObjetoParaAgente, lista: RegistroParaAgente[], moneda: string, padreDe?: PadreDe): RegistroParaAgente[] {
  const primerRango = o.agente?.rangos?.[0];
  const agrupa = Boolean(o.agente?.agruparPor || padreDe);
  return [...lista].sort((a, b) => {
    const g = agrupa ? compararGrupos(grupoDe(o, a, moneda, padreDe), grupoDe(o, b, moneda, padreDe)) : 0;
    if (g || !primerRango) return g;
    const na = numero(a.valores[primerRango]);
    const nb = numero(b.valores[primerRango]);
    if (na === null) return nb === null ? 0 : 1;
    if (nb === null) return -1;
    return na - nb;
  });
}

/** Una línea por registro: título, padres y las columnas visibles para el agente. */
export function lineaRegistro(
  o: ObjetoParaAgente,
  r: RegistroParaAgente,
  titulosPadre: (objeto: string, id: string) => string | null,
  moneda: string
): string {
  const partes = [`${o.nombre} ${r.titulo || "(sin nombre)"}`];
  for (const p of o.padres) {
    const pid = r.padres[p.clave];
    const t = pid ? titulosPadre(p.objeto, pid) : null;
    if (t) partes.push(`${p.nombre}: ${t}`);
  }
  for (const c of o.campos) {
    if (!c.visibleAgente || o.titulo.includes(c.clave)) continue;
    const v = valorParaAgente(c, r.valores[c.clave], moneda);
    if (v !== null) partes.push(`${c.nombre}: ${v}`);
  }
  return `- ${partes.join(" · ")}`;
}

/** Todo lo que el agente lee de los objetos; vacío si no hay ninguno visible. */
export function renderObjetosParaAgente(datos: DatosParaAgente): string {
  if (!datos.objetos.length) return "";
  const entran = incluidos(datos);
  const titulos = new Map<string, Map<string, string>>();
  for (const [clave, regs] of datos.registros) titulos.set(clave, new Map(regs.map((r) => [r.id, r.titulo])));
  const tituloPadre = (objeto: string, id: string) =>
    entran.get(objeto)?.has(id) ? (titulos.get(objeto)?.get(id) ?? null) : null;

  const secciones: string[] = [];
  for (const o of datos.objetos) {
    const todos = datos.registros.get(o.clave) ?? [];
    const set = entran.get(o.clave) ?? new Set<string>();
    // Con un padre que también se lista (el edificio de cada unidad), los
    // resúmenes y el orden van por padre: un rango no mezcla edificios.
    const principal = o.padres.find((p) => p.objeto !== o.clave && datos.registros.has(p.objeto));
    const padreDe: PadreDe | undefined = principal
      ? (r) => {
          const pid = r.padres[principal.clave];
          return pid ? tituloPadre(principal.objeto, pid) : null;
        }
      : undefined;
    const lista = ordenar(o, todos.filter((r) => set.has(r.id)), datos.moneda, padreDe);
    const excluidos = todos.filter((r) => !set.has(r.id) && !cumpleFiltro(o, r));
    const lineas = [`### ${o.nombrePlural}`];
    if (o.agente?.indicacion) lineas.push(o.agente.indicacion);
    if (!lista.length) {
      lineas.push(`No hay ${o.nombrePlural.toLowerCase()} para ofrecer en este momento.`);
    } else {
      lineas.push(...resumenPorGrupo(o, lista, datos.moneda, padreDe));
      lineas.push(`${plural(lista.length, o.nombre, o.nombrePlural)}. Cada línea es UN registro y se entiende sola: los datos se copian de su propia línea, sin mezclar con otra.`);
      for (const r of lista.slice(0, MAX_LINEAS_AGENTE)) lineas.push(lineaRegistro(o, r, tituloPadre, datos.moneda));
      if (lista.length > MAX_LINEAS_AGENTE) {
        lineas.push(`(y ${lista.length - MAX_LINEAS_AGENTE} más que no entran acá; si te preguntan por uno que no ves, derivá a una persona)`);
      }
    }
    const fuera = contarExcluidos(o, excluidos, datos.moneda);
    if (fuera) lineas.push(fuera);
    secciones.push(lineas.join("\n"));
  }
  return [
    "## Datos del negocio (del CRM, actualizados)",
    "Esta es la información vigente. Usala para responder; no inventes registros, precios ni datos que no estén acá.",
    ...secciones,
  ].join("\n\n");
}
