import { parseCsvConVacias } from "@/lib/contact-import";
import type { CampoDto, ObjetoDto, RegistroDto } from "./dto";
import { aNumero, normalizar } from "./valores";

/**
 * Motor — CSV de cualquier objeto (paso 4). Puro: leer, reconocer columnas y
 * generar. Lo que se crea o actualiza lo decide el servidor
 * (`server/motor/importar.ts`).
 *
 * Reglas (las mismas del CSV de unidades, spec 069):
 * - Las columnas se reconocen por el nombre del campo o su clave, sin
 *   importar mayúsculas ni acentos. Las que no se reconocen se avisan y no se
 *   cargan: agregarlas es tarea de un administrador (desde el código).
 * - Una columna con el nombre de un padre («Edificio») se resuelve por el
 *   nombre del registro padre. El padre nunca se crea.
 * - Celda vacía = no cambiar (en un registro que ya existe).
 * - La moneda se escribe en unidades («120.000») y se guarda en centavos.
 * - Exportar genera las mismas columnas: se edita en Sheets y se vuelve a subir.
 */

export const CSV_MAX_FILAS = 2000;

export type Columna = { indice: number; encabezado: string } & (
  | { tipo: "campo"; clave: string }
  | { tipo: "padre"; relacion: string }
);

export type FilaCsv = {
  /** Número de fila en la planilla (1 = encabezado). */
  fila: number;
  /** Clave del campo → texto de la celda (solo las no vacías). */
  valores: Record<string, string>;
  /** Clave de la relación → nombre del padre. */
  padres: Record<string, string>;
};

export type LecturaCsv = {
  columnas: Columna[];
  /** Encabezados que no son ningún campo: no se cargan. */
  noReconocidas: string[];
  filas: FilaCsv[];
  errores: { fila: number; mensaje: string }[];
};

function camposImportables(objeto: ObjetoDto): CampoDto[] {
  return objeto.campos.filter((c) => c.editable);
}

/** Qué columna es qué campo o padre, por el encabezado. */
export function reconocerColumnas(objeto: ObjetoDto, encabezados: string[]): {
  columnas: Columna[];
  noReconocidas: string[];
} {
  const columnas: Columna[] = [];
  const noReconocidas: string[] = [];
  const usadas = new Set<string>();
  encabezados.forEach((crudo, indice) => {
    const h = normalizar(crudo);
    if (!h) return;
    const campo = camposImportables(objeto).find((c) => normalizar(c.nombre) === h || normalizar(c.clave) === h);
    if (campo && !usadas.has(`c:${campo.clave}`)) {
      usadas.add(`c:${campo.clave}`);
      columnas.push({ indice, encabezado: crudo, tipo: "campo", clave: campo.clave });
      return;
    }
    const padre = objeto.padres.find(
      (p) => normalizar(p.nombre) === h || normalizar(p.objeto) === h || normalizar(p.clave) === h
    );
    if (padre && !usadas.has(`p:${padre.clave}`)) {
      usadas.add(`p:${padre.clave}`);
      columnas.push({ indice, encabezado: crudo, tipo: "padre", relacion: padre.clave });
      return;
    }
    // Un calculado exportado vuelve en el archivo: se ignora sin avisar.
    if (objeto.campos.some((c) => !c.editable && normalizar(c.nombre) === h)) return;
    noReconocidas.push(crudo.trim());
  });
  return { columnas, noReconocidas };
}

export function leerCsv(objeto: ObjetoDto, texto: string): LecturaCsv {
  const tabla = parseCsvConVacias(texto);
  const encabezados = tabla[0] ?? [];
  const { columnas, noReconocidas } = reconocerColumnas(objeto, encabezados);
  const errores: { fila: number; mensaje: string }[] = [];
  const filas: FilaCsv[] = [];

  if (!columnas.some((c) => c.tipo === "campo")) {
    errores.push({ fila: 1, mensaje: `El encabezado no tiene ningún campo de «${objeto.nombre}»` });
    return { columnas, noReconocidas, filas, errores };
  }
  const datos = tabla.slice(1);
  if (datos.length > CSV_MAX_FILAS) {
    errores.push({ fila: 1, mensaje: `El archivo tiene más de ${CSV_MAX_FILAS} filas` });
    return { columnas, noReconocidas, filas, errores };
  }

  datos.forEach((celdas, i) => {
    if (!celdas.some((c) => c.trim())) return;
    const fila: FilaCsv = { fila: i + 2, valores: {}, padres: {} };
    for (const col of columnas) {
      const v = (celdas[col.indice] ?? "").trim();
      if (!v) continue;
      if (col.tipo === "campo") fila.valores[col.clave] = v;
      else fila.padres[col.relacion] = v;
    }
    filas.push(fila);
  });
  return { columnas, noReconocidas, filas, errores };
}

/** El texto de una celda → lo que recibe el servidor. Solo la moneda cambia: de unidades a centavos. */
export function valorDeCelda(campo: CampoDto, texto: string): unknown {
  if (campo.tipo === "moneda") {
    if (texto.trim() === "-") return null;
    const n = aNumero(texto);
    return n === null ? texto : Math.round(n * 100);
  }
  return texto;
}

function celdaCsv(v: string): string {
  return /[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function aTexto(campo: CampoDto, v: RegistroDto["valores"][string]): string {
  if (v === null || v === undefined) return "";
  switch (campo.tipo) {
    case "moneda":
      return typeof v === "number" ? String(v / 100) : "";
    case "booleano":
      return v ? "Sí" : "No";
    case "fecha":
      return String(v).slice(0, 10);
    case "seleccion":
      return campo.opciones?.find((o) => o.valor === v)?.nombre ?? String(v);
    case "seleccion_multiple":
      return (Array.isArray(v) ? v : [String(v)])
        .map((x) => campo.opciones?.find((o) => o.valor === x)?.nombre ?? x)
        .join("; ");
    default:
      return String(v);
  }
}

/**
 * Los registros como CSV, con las columnas que lee el importador: primero los
 * padres (por nombre), después los campos editables. `nombresPadres` resuelve
 * id del padre → nombre.
 */
export function generarCsv(
  objeto: ObjetoDto,
  registros: readonly RegistroDto[],
  nombresPadres: Record<string, Record<string, string>>
): string {
  const campos = camposImportables(objeto);
  const filas = [
    [...objeto.padres.map((p) => p.nombre), ...campos.map((c) => c.nombre)],
    ...registros.map((r) => [
      ...objeto.padres.map((p) => {
        const id = r.padres[p.clave];
        return id ? (nombresPadres[p.clave]?.[id] ?? "") : "";
      }),
      ...campos.map((c) => aTexto(c, r.valores[c.clave] ?? null)),
    ]),
  ];
  // BOM: Excel en Windows abre el archivo con los acentos bien.
  return "﻿" + filas.map((f) => f.map(celdaCsv).join(",")).join("\n") + "\n";
}
