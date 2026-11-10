import type { TipoCampo } from "./config";

/**
 * Motor — valores de los registros. Puro: sin base.
 *
 * Cómo se convierte lo que llega (de la pantalla, del CSV o de una
 * integración) al valor que se guarda, y cómo se arman el título y los campos
 * calculados por suma.
 */

/** Lo que el servidor sabe de un campo (sale de `motor_campo`). */
export type CampoMeta = {
  clave: string;
  nombre: string;
  tipo: TipoCampo;
  columna: string | null;
  obligatorio: boolean;
  opciones: { valor: string; nombre: string }[] | null;
  calculo: CalculoMeta | null;
  visibleLista: boolean;
  visibleAgente: boolean;
  /** Galería, video, documento: `{ maxArchivos }` o `{ maxMb }`. */
  limites?: { maxArchivos?: number; maxMb?: number } | null;
};

export type CalculoMeta =
  | { suma: string[] }
  | {
      resumen: {
        relacion: string;
        campo?: string;
        operacion: "minimo" | "maximo" | "suma" | "cantidad" | "promedio";
        filtro?: Record<string, string[]>;
      };
    };

export type Valor = string | number | boolean | Date | string[] | null;

/** Id de un archivo del motor (`motor_archivo`). */
export const ID_ARCHIVO = /^arc_[A-Za-z0-9_-]{6,40}$/;

export type Conversion = { ok: true; valor: Valor } | { ok: false; error: string };

/** Minúsculas, sin acentos ni espacios de más: «Olazábal  2649» = «olazabal 2649». */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function vacio(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

/** «1.234,5», «1234.5» y «1234,5» → 1234.5. Devuelve null si no es un número. */
export function aNumero(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  let s = v.trim().replace(/\s/g, "").replace(/^\$/, "");
  if (!s) return null;
  const coma = s.lastIndexOf(",");
  const punto = s.lastIndexOf(".");
  if (coma > punto) s = s.replace(/\./g, "").replace(",", ".");
  else if (coma !== -1) s = s.replace(/,/g, "");
  // Solo puntos, en grupos de a tres: separador de miles, como se escribe en
  // Argentina («120.000», «1.250.000»). «6.5» sigue siendo decimal.
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const SI = new Set(["true", "si", "sí", "1", "x", "yes", "verdadero"]);
const NO = new Set(["false", "no", "0", "", "falso"]);

function opcionDe(campo: CampoMeta, v: string): string | null {
  const opciones = campo.opciones ?? [];
  const exacta = opciones.find((o) => o.valor === v);
  if (exacta) return exacta.valor;
  const n = normalizar(v);
  const porNombre = opciones.find((o) => normalizar(o.nombre) === n || normalizar(o.valor) === n);
  return porNombre?.valor ?? null;
}

/**
 * Convierte un valor de entrada al que se guarda. `moneda` va en centavos
 * (entero), como `departamento.valor_cents`.
 */
export function convertir(campo: CampoMeta, entrada: unknown): Conversion {
  if (campo.tipo === "calculado") return { ok: false, error: `«${campo.nombre}» es calculado` };
  if (vacio(entrada) || (Array.isArray(entrada) && entrada.length === 0)) {
    if (campo.obligatorio) return { ok: false, error: `«${campo.nombre}» es obligatorio` };
    return { ok: true, valor: null };
  }

  switch (campo.tipo) {
    case "texto":
    case "enlace":
    case "imagen": {
      if (typeof entrada !== "string" && typeof entrada !== "number") {
        return { ok: false, error: `«${campo.nombre}» tiene que ser texto` };
      }
      return { ok: true, valor: String(entrada).trim() };
    }
    case "numero": {
      const n = aNumero(entrada);
      return n === null ? { ok: false, error: `«${campo.nombre}» tiene que ser un número` } : { ok: true, valor: n };
    }
    case "moneda": {
      const n = aNumero(entrada);
      if (n === null || !Number.isInteger(n)) {
        return { ok: false, error: `«${campo.nombre}» tiene que ser un importe en centavos (entero)` };
      }
      return { ok: true, valor: n };
    }
    case "fecha": {
      const d = entrada instanceof Date ? entrada : new Date(String(entrada));
      return Number.isNaN(d.getTime())
        ? { ok: false, error: `«${campo.nombre}» tiene que ser una fecha` }
        : { ok: true, valor: d };
    }
    case "booleano": {
      if (typeof entrada === "boolean") return { ok: true, valor: entrada };
      const s = normalizar(String(entrada));
      if (SI.has(s)) return { ok: true, valor: true };
      if (NO.has(s)) return { ok: true, valor: false };
      return { ok: false, error: `«${campo.nombre}» tiene que ser sí o no` };
    }
    case "seleccion": {
      const v = opcionDe(campo, String(entrada));
      return v === null
        ? { ok: false, error: `«${campo.nombre}»: «${String(entrada)}» no es una opción` }
        : { ok: true, valor: v };
    }
    case "galeria": {
      const lista = Array.isArray(entrada) ? entrada : [entrada];
      const ids: string[] = [];
      for (const x of lista) {
        if (typeof x !== "string" || !ID_ARCHIVO.test(x)) return { ok: false, error: `«${campo.nombre}»: archivo no válido` };
        if (!ids.includes(x)) ids.push(x);
      }
      const max = campo.limites?.maxArchivos ?? 6;
      if (ids.length > max) return { ok: false, error: `«${campo.nombre}» admite hasta ${max} fotos` };
      return { ok: true, valor: ids.length ? ids : null };
    }
    case "video":
    case "documento": {
      if (typeof entrada !== "string" || !ID_ARCHIVO.test(entrada)) {
        return { ok: false, error: `«${campo.nombre}»: archivo no válido` };
      }
      return { ok: true, valor: entrada };
    }
    case "seleccion_multiple": {
      const lista = Array.isArray(entrada) ? entrada : String(entrada).split(/[;,]/);
      const valores: string[] = [];
      for (const item of lista) {
        if (vacio(item)) continue;
        const v = opcionDe(campo, String(item).trim());
        if (v === null) return { ok: false, error: `«${campo.nombre}»: «${String(item)}» no es una opción` };
        if (!valores.includes(v)) valores.push(v);
      }
      if (!valores.length && campo.obligatorio) return { ok: false, error: `«${campo.nombre}» es obligatorio` };
      return { ok: true, valor: valores.length ? valores : null };
    }
  }
  return { ok: false, error: `«${campo.nombre}»: tipo desconocido` };
}

/** Cómo se ve un valor dentro del título: «6» y no «6.0». */
function parteTitulo(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (Array.isArray(v)) return v.join(" ");
  return String(v).trim();
}

/** El nombre del registro: los campos del título pegados (piso 6 + B = «6B»). */
export function armarTitulo(titulo: string[], valores: Record<string, unknown>): string {
  return titulo.map((c) => parteTitulo(valores[c])).join("");
}

/** Suma de campos numéricos; null si ninguno tiene valor. */
export function calcularSuma(sumandos: string[], valores: Record<string, unknown>): number | null {
  let total = 0;
  let alguno = false;
  for (const s of sumandos) {
    const n = aNumero(valores[s]);
    if (n === null) continue;
    total += n;
    alguno = true;
  }
  return alguno ? total : null;
}

/** Igualdad para el historial: solo se anota lo que cambió de verdad. */
export function mismoValor(a: unknown, b: unknown): boolean {
  if (a instanceof Date || b instanceof Date) {
    const ta = a instanceof Date ? a.getTime() : a === null || a === undefined ? null : new Date(String(a)).getTime();
    const tb = b instanceof Date ? b.getTime() : b === null || b === undefined ? null : new Date(String(b)).getTime();
    return ta === tb;
  }
  if (Array.isArray(a) || Array.isArray(b)) return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  if ((a === null || a === undefined) && (b === null || b === undefined)) return true;
  if (typeof a === "number" || typeof b === "number") return aNumero(a) === aNumero(b);
  return a === b;
}
