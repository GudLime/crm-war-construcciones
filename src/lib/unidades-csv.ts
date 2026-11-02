/**
 * Lista de precios de un edificio en CSV: leerla, compararla con las unidades
 * que ya están en el CRM y volver a generarla. Puro: lo usan la API (que
 * aplica) y los tests (con una planilla de ejemplo con la forma de las reales).
 *
 * Reglas (acordadas con Sebastián, 02/11/2026):
 * - Se empareja por unidad. Si la columna Unidad es solo la letra, se le
 *   antepone el piso: piso 1 + "A" = "1A".
 * - Celda vacía = no cambiar. "-" en VALOR = sin precio.
 * - La columna Estado manda. INVERSOR se toma como Disponible. Si VALOR dice
 *   otro estado (VENDIDO, RESERVADO), no hay precio y se avisa.
 * - La terraza se suma a los metros descubiertos.
 * - Las unidades del CRM que no vienen en el archivo no se tocan: se avisan.
 */

import { parseCsv } from "@/lib/contact-import";
import {
  ESTADOS_UNIDAD,
  TIPOLOGIAS,
  etiqueta,
  normalizarTipologias,
  type EstadoUnidad,
  type Tipologia,
} from "@/lib/ventas";

export const UNIDADES_CSV_MAX_FILAS = 2000;

export type CampoUnidad =
  | "piso"
  | "tipologia"
  | "metrosCubiertos"
  | "metrosSemicubiertos"
  | "metrosDescubiertos"
  | "valorCents"
  | "estado"
  | "dormitorios"
  | "banos"
  | "toilette"
  | "enSuite";

export const CAMPOS_UNIDAD: readonly CampoUnidad[] = [
  "piso",
  "tipologia",
  "metrosCubiertos",
  "metrosSemicubiertos",
  "metrosDescubiertos",
  "valorCents",
  "estado",
  "dormitorios",
  "banos",
  "toilette",
  "enSuite",
];

export const ETIQUETA_CAMPO: Record<CampoUnidad, string> = {
  piso: "Piso",
  tipologia: "Tipología",
  metrosCubiertos: "Sup. cubierta",
  metrosSemicubiertos: "Sup. semicubierta",
  metrosDescubiertos: "Sup. descubierta",
  valorCents: "Valor",
  estado: "Estado",
  dormitorios: "Dormitorios",
  banos: "Baños",
  toilette: "Toilette",
  enSuite: "En suite",
};

/** `undefined` = el archivo no dice nada (no cambiar); `null` = vaciar. */
export type ValoresUnidad = {
  piso?: number | null;
  tipologia?: Tipologia | null;
  metrosCubiertos?: number | null;
  metrosSemicubiertos?: number | null;
  metrosDescubiertos?: number | null;
  valorCents?: number | null;
  estado?: EstadoUnidad;
  dormitorios?: number | null;
  banos?: number | null;
  toilette?: number | null;
  enSuite?: number | null;
};

export type UnidadCsv = { fila: number; unidad: string; valores: ValoresUnidad };
export type ProblemaCsv = { fila: number; unidad?: string; mensaje: string };

export type LecturaCsv = {
  unidades: UnidadCsv[];
  errores: ProblemaCsv[];
  avisos: ProblemaCsv[];
  /** Las columnas que se reconocieron, para mostrarlas en la vista previa. */
  columnas: string[];
  /** USD si el archivo lo dice (encabezados o precios con USD / U$S). */
  monedaDetectada: string | null;
};

/** Lo que el CRM ya tiene de una unidad, para comparar. */
export type UnidadActual = {
  id: string;
  unidad: string;
} & { [K in CampoUnidad]: K extends "estado" ? EstadoUnidad : K extends "tipologia" ? Tipologia | null : number | null };

export type Cambio = { campo: CampoUnidad; antes: string; despues: string };

export type Comparacion = {
  nuevas: UnidadCsv[];
  modificadas: { id: string; unidad: string; fila: number; valores: ValoresUnidad; cambios: Cambio[] }[];
  sinCambios: string[];
  /** Están en el CRM y no vienen en el archivo: no se tocan. */
  faltantes: string[];
  errores: ProblemaCsv[];
  avisos: ProblemaCsv[];
  columnas: string[];
  monedaDetectada: string | null;
};

/* ------------------------------------------------------------------ */

function plano(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9/ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Clave para emparejar unidades: "1°A", "1 A" y "1a" son la misma. */
export function claveUnidad(unidad: string): string {
  return unidad.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[\s°º.\-]/g, "").toUpperCase();
}

type Columnas = Partial<Record<CampoUnidad | "unidad" | "terraza" | "valorTexto", number[]>>;

/** Qué columna es cuál, por el encabezado. Las que no reconoce se ignoran. */
function detectarColumnas(encabezados: string[]): { columnas: Columnas; nombres: string[] } {
  const columnas: Columnas = {};
  const nombres: string[] = [];
  const agregar = (campo: keyof Columnas, i: number, nombre: string) => {
    (columnas[campo] ??= []).push(i);
    if (columnas[campo]!.length === 1) nombres.push(nombre);
  };
  encabezados.forEach((crudo, i) => {
    const h = plano(crudo);
    if (!h) return;
    if (h === "piso") agregar("piso", i, "Piso");
    else if (/^(unidad|depto|departamento|uf|dpto)$/.test(h)) agregar("unidad", i, "Unidad");
    else if (/^(amb|ambientes|tipologia)$/.test(h)) agregar("tipologia", i, "Ambientes");
    else if (h.includes("semicub")) agregar("metrosSemicubiertos", i, "Sup. semicubierta");
    else if (h.includes("descub")) agregar("metrosDescubiertos", i, "Sup. descubierta");
    else if (h.includes("cubiert")) agregar("metrosCubiertos", i, "Sup. cubierta");
    else if (h.includes("terraza")) agregar("terraza", i, "Terraza");
    else if ((h.startsWith("valor") || h.startsWith("precio")) && !h.includes("valorad")) {
      agregar("valorCents", i, "Valor");
    } else if (h === "estado") agregar("estado", i, "Estado");
    else if (h.startsWith("dormitorio")) agregar("dormitorios", i, "Dormitorios");
    else if (h === "banos" || h === "bano") agregar("banos", i, "Baños");
    else if (h.startsWith("toilet")) agregar("toilette", i, "Toilette");
    else if (h.includes("suite")) agregar("enSuite", i, "En suite");
  });
  return { columnas, nombres };
}

/** La primera celda no vacía entre las columnas de un campo (hay planillas con columnas repetidas). */
function celda(fila: string[], indices: number[] | undefined): string | undefined {
  if (!indices) return undefined;
  for (const i of indices) {
    const v = (fila[i] ?? "").trim();
    if (v) return v;
  }
  return undefined;
}

const ERROR_PLANILLA = /^#(value|ref|div\/0|n\/a|name|num|null)!?\??$/i;

/**
 * Número en formato argentino o inglés: "273.000" (miles), "60,6" (decimal),
 * "1.234,5", "USD 150.000". Devuelve `undefined` si la celda está vacía,
 * `null` si es "-" o un error de planilla (#VALUE!), y NaN si no se entiende.
 */
export function leerNumero(texto: string | undefined): number | null | undefined {
  if (texto == null) return undefined;
  let t = texto.trim();
  if (!t) return undefined;
  if (/^-+$/.test(t) || ERROR_PLANILLA.test(t)) return null;
  t = t.replace(/usd|u\$s|us\$|\$|ars|\s/gi, "");
  if (!t) return Number.NaN;
  if (t.includes(".") && t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (t.includes(",")) t = t.replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  const n = Number(t);
  return Number.isFinite(n) ? n : Number.NaN;
}

const ESTADOS_TEXTO: Record<string, EstadoUnidad> = {
  disponible: "disponible",
  inversor: "disponible",
  vendido: "vendido",
  vendida: "vendido",
  reservado: "reservado",
  reservada: "reservado",
  consultar: "consultar",
  "consultar disponibilidad": "consultar",
};

function leerEstado(texto: string | undefined): EstadoUnidad | null | undefined {
  if (texto == null || !texto.trim()) return undefined;
  return ESTADOS_TEXTO[plano(texto)] ?? null;
}

function leerTipologia(texto: string | undefined): Tipologia | null | undefined {
  if (texto == null || !texto.trim()) return undefined;
  const n = leerNumero(texto);
  if (typeof n === "number" && Number.isInteger(n)) {
    return (
      ({ 1: "1_ambiente", 2: "2_ambientes", 3: "3_ambientes", 4: "4_ambientes" } as const)[
        n as 1 | 2 | 3 | 4
      ] ?? null
    );
  }
  return normalizarTipologias(texto)[0] ?? null;
}

function leerEntero(texto: string | undefined): number | null | undefined | "invalido" {
  const n = leerNumero(texto);
  if (n === undefined || n === null) return n;
  if (!Number.isInteger(n) || n < 0 || n > 50) return "invalido";
  return n;
}

/** Lee la planilla. No toca la base: solo interpreta y junta errores y avisos. */
export function leerUnidadesCsv(texto: string): LecturaCsv {
  const tabla = parseCsv(texto);
  const errores: ProblemaCsv[] = [];
  const avisos: ProblemaCsv[] = [];
  const unidades: UnidadCsv[] = [];
  const encabezados = tabla[0] ?? [];
  const { columnas, nombres } = detectarColumnas(encabezados);

  const vacio: LecturaCsv = { unidades, errores, avisos, columnas: nombres, monedaDetectada: null };
  if (!columnas.unidad) {
    errores.push({ fila: 1, mensaje: "No encuentro la columna «Unidad» en el encabezado" });
    return vacio;
  }
  const filas = tabla.slice(1);
  if (filas.length > UNIDADES_CSV_MAX_FILAS) {
    errores.push({ fila: 1, mensaje: `El archivo tiene más de ${UNIDADES_CSV_MAX_FILAS} filas` });
    return vacio;
  }

  const usdEnEncabezado = encabezados.some((h) => /usd|u\$s/i.test(h));
  let usdEnPrecios = false;
  const vistas = new Map<string, number>();

  filas.forEach((fila, idx) => {
    const n = idx + 2; // fila 1 = encabezado
    const unidadCruda = celda(fila, columnas.unidad);
    if (!unidadCruda) {
      if (fila.some((c) => c.trim())) errores.push({ fila: n, mensaje: "Fila sin unidad: se ignora" });
      return;
    }
    const pisoTexto = celda(fila, columnas.piso);
    const unidad =
      /^[a-z]{1,2}$/i.test(unidadCruda) && pisoTexto
        ? `${pisoTexto.toUpperCase()}${unidadCruda.toUpperCase()}`
        : unidadCruda;
    const clave = claveUnidad(unidad);
    if (vistas.has(clave)) {
      errores.push({
        fila: n,
        unidad,
        mensaje: `La unidad ${unidad} está repetida (ya vino en la fila ${vistas.get(clave)}): se ignora esta`,
      });
      return;
    }
    vistas.set(clave, n);

    const valores: ValoresUnidad = {};
    const avisar = (mensaje: string) => avisos.push({ fila: n, unidad, mensaje });

    // Piso: número, o PB = 0.
    if (pisoTexto) {
      if (/^pb$/i.test(pisoTexto)) valores.piso = 0;
      else {
        const p = leerNumero(pisoTexto);
        if (typeof p === "number" && Number.isInteger(p)) valores.piso = p;
        else avisar(`Piso «${pisoTexto}» no se entiende: no se cambia`);
      }
    }

    const tip = leerTipologia(celda(fila, columnas.tipologia));
    if (tip === null) avisar(`Ambientes «${celda(fila, columnas.tipologia)}» no se reconoce: no se cambia`);
    else if (tip !== undefined) valores.tipologia = tip;

    const metros = (campo: "metrosCubiertos" | "metrosSemicubiertos" | "metrosDescubiertos" | "terraza") => {
      const crudo = celda(fila, columnas[campo]);
      const m = leerNumero(crudo);
      if (m === null) return undefined; // "-" o #VALUE!: sin dato, no cambia
      if (typeof m === "number" && (Number.isNaN(m) || m < 0)) {
        avisar(`«${crudo}» no es una superficie: no se cambia`);
        return undefined;
      }
      return m;
    };
    const cub = metros("metrosCubiertos");
    const semi = metros("metrosSemicubiertos");
    const desc = metros("metrosDescubiertos");
    const terraza = metros("terraza");
    if (cub !== undefined) valores.metrosCubiertos = cub;
    if (semi !== undefined) valores.metrosSemicubiertos = semi;
    // La terraza va dentro de los descubiertos.
    if (desc !== undefined || terraza !== undefined) {
      valores.metrosDescubiertos = Math.round(((desc ?? 0) + (terraza ?? 0)) * 100) / 100;
    }

    // Estado: la columna Estado manda.
    const estadoTexto = celda(fila, columnas.estado);
    const estado = leerEstado(estadoTexto);
    if (estado === null) avisar(`Estado «${estadoTexto}» no se reconoce: no se cambia`);
    else if (estado !== undefined) valores.estado = estado;

    // Valor: un número, "-" (sin precio) o un estado escrito (sin precio).
    const valorTexto = celda(fila, columnas.valorCents);
    if (valorTexto !== undefined) {
      const comoEstado = leerEstado(valorTexto);
      if (comoEstado) {
        valores.valorCents = null;
        if (estado && comoEstado !== estado) {
          avisar(
            `VALOR dice «${valorTexto.trim()}» y Estado dice «${estadoTexto?.trim()}»: se toma Estado (${etiqueta(ESTADOS_UNIDAD, estado)}). Revisalo en el Excel.`
          );
        }
      } else {
        const v = leerNumero(valorTexto);
        if (v === null) valores.valorCents = null;
        else if (v === undefined) {
          /* vacío: no cambia */
        } else if (Number.isNaN(v) || v < 0) avisar(`Valor «${valorTexto}» no se entiende: no se cambia`);
        else {
          valores.valorCents = Math.round(v * 100);
          if (/usd|u\$s|us\$/i.test(valorTexto)) usdEnPrecios = true;
        }
      }
    }

    for (const campo of ["dormitorios", "banos", "toilette", "enSuite"] as const) {
      const crudo = celda(fila, columnas[campo]);
      const e = leerEntero(crudo);
      if (e === "invalido") avisar(`${ETIQUETA_CAMPO[campo]} «${crudo}» no es una cantidad: no se cambia`);
      else if (e !== undefined) valores[campo] = e;
    }

    unidades.push({ fila: n, unidad, valores });
  });

  return {
    unidades,
    errores,
    avisos,
    columnas: nombres,
    monedaDetectada: usdEnEncabezado || usdEnPrecios ? "USD" : null,
  };
}

function mostrar(campo: CampoUnidad, v: unknown): string {
  if (v == null) return "—";
  if (campo === "estado") return etiqueta(ESTADOS_UNIDAD, v as string);
  if (campo === "tipologia") return etiqueta(TIPOLOGIAS, v as string);
  if (campo === "valorCents") {
    return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format((v as number) / 100);
  }
  if (campo.startsWith("metros")) {
    return `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(v as number)} m²`;
  }
  return String(v);
}

function iguales(campo: CampoUnidad, a: unknown, b: unknown): boolean {
  if (a == null || b == null) return a == null && b == null;
  if (typeof a === "number" && typeof b === "number") {
    return campo.startsWith("metros") ? Math.abs(a - b) < 0.005 : a === b;
  }
  return a === b;
}

/** Compara lo leído con lo que hay en el CRM: qué se crea, qué cambia y qué falta. */
export function compararUnidades(
  actuales: readonly UnidadActual[],
  lectura: LecturaCsv
): Comparacion {
  const porClave = new Map(actuales.map((u) => [claveUnidad(u.unidad), u]));
  const vistas = new Set<string>();
  const out: Comparacion = {
    nuevas: [],
    modificadas: [],
    sinCambios: [],
    faltantes: [],
    errores: [...lectura.errores],
    avisos: [...lectura.avisos],
    columnas: lectura.columnas,
    monedaDetectada: lectura.monedaDetectada,
  };

  for (const fila of lectura.unidades) {
    const clave = claveUnidad(fila.unidad);
    const actual = porClave.get(clave);
    if (!actual) {
      out.nuevas.push(fila);
      continue;
    }
    vistas.add(clave);
    const cambios: Cambio[] = [];
    for (const campo of CAMPOS_UNIDAD) {
      const nuevo = fila.valores[campo];
      if (nuevo === undefined) continue;
      const antes = actual[campo];
      if (iguales(campo, antes, nuevo)) continue;
      cambios.push({ campo, antes: mostrar(campo, antes), despues: mostrar(campo, nuevo) });
    }
    const nuevoEstado = fila.valores.estado;
    if (
      nuevoEstado === "disponible" &&
      (actual.estado === "vendido" || actual.estado === "reservado")
    ) {
      out.avisos.push({
        fila: fila.fila,
        unidad: actual.unidad,
        mensaje: `Pasa de ${etiqueta(ESTADOS_UNIDAD, actual.estado)} a Disponible`,
      });
    }
    if (cambios.length) {
      out.modificadas.push({ id: actual.id, unidad: actual.unidad, fila: fila.fila, valores: fila.valores, cambios });
    } else {
      out.sinCambios.push(actual.unidad);
    }
  }
  for (const u of actuales) {
    if (!vistas.has(claveUnidad(u.unidad))) out.faltantes.push(u.unidad);
  }
  return out;
}

/* ------------------------------------------------------------------ */

function csvCelda(v: string): string {
  return /[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

const AMB_DE_TIPOLOGIA: Record<Tipologia, string> = {
  "1_ambiente": "1",
  "2_ambientes": "2",
  "3_ambientes": "3",
  "4_ambientes": "4",
  triplex: "Triplex",
};

/**
 * La lista del edificio como CSV, con las mismas columnas que lee el
 * importador: se descarga, se edita en Excel o Sheets y se vuelve a subir.
 * La unidad sale completa ("1A"), así el emparejamiento no depende del piso.
 */
export function generarCsvUnidades(unidades: readonly UnidadActual[]): string {
  const f = (n: number | null, dec = 2) =>
    n == null ? "" : new Intl.NumberFormat("es-AR", { maximumFractionDigits: dec, useGrouping: dec === 0 }).format(n);
  const filas = [
    [
      "Piso",
      "Unidad",
      "AMB",
      "Sup. Cubierta",
      "Sup. Semicubierta",
      "Sup. Descub.",
      "VALOR",
      "Estado",
      "DORMITORIOS",
      "BANOS",
      "TOILETTE",
      "EN SUITE",
    ],
    ...unidades.map((u) => [
      u.piso == null ? "" : String(u.piso),
      u.unidad,
      u.tipologia ? AMB_DE_TIPOLOGIA[u.tipologia] : "",
      f(u.metrosCubiertos),
      f(u.metrosSemicubiertos),
      f(u.metrosDescubiertos),
      u.valorCents == null ? "-" : f(u.valorCents / 100, 0),
      etiqueta(ESTADOS_UNIDAD, u.estado).toUpperCase(),
      u.dormitorios == null ? "" : String(u.dormitorios),
      u.banos == null ? "" : String(u.banos),
      u.toilette == null ? "" : String(u.toilette),
      u.enSuite == null ? "" : String(u.enSuite),
    ]),
  ];
  return filas.map((r) => r.map(csvCelda).join(",")).join("\n") + "\n";
}

/**
 * Texto del archivo: UTF-8 si lo es (Google Sheets), si no Windows-1252
 * (Excel en Windows guarda así los CSV y los acentos llegan rotos en UTF-8).
 */
export function decodificarArchivo(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}
