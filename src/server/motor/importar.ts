import { newId } from "@/lib/db/ids";
import { leerCsv, valorDeCelda, generarCsv } from "@/lib/motor/csv";
import type { ObjetoDto } from "@/lib/motor/dto";
import { armarTitulo, convertir, mismoValor, normalizar, type Valor } from "@/lib/motor/valores";
import { aDto, describirObjeto } from "./api";
import { cargarMotor, type Motor, type ObjetoMeta } from "./metadatos";
import {
  actualizarRegistro,
  crearRegistro,
  listarRegistros,
  MotorError,
  type Entrada,
  type OpcionesListado,
  type Registro,
} from "./registros";

/**
 * Motor — importar y exportar CSV de cualquier objeto (paso 4).
 *
 * Importar es en dos tiempos: primero un plan (qué filas crean, cuáles
 * actualizan, cuáles no cambian y cuáles tienen errores) que se muestra antes
 * de confirmar; después, el mismo plan aplicado. Cada fila se guarda por su
 * cuenta: una fila con error no frena al resto. Todo lo aplicado comparte un
 * lote en el historial.
 *
 * Una fila se empareja con un registro existente por su nombre (normalizado)
 * y, si el objeto lo pide, dentro de su padre: «6B» de Olazábal no es «6B» de
 * Lavalle. Nunca se crean padres: si «Edificio» dice algo que no existe, esa
 * fila no se carga.
 */

export type AccionFila = "crear" | "actualizar" | "sin_cambios" | "error";

export type FilaPlan = {
  fila: number;
  titulo: string;
  accion: AccionFila;
  /** Qué cambia («Valor: 120000 → 125000»), en una actualización. */
  cambios: string[];
  mensaje?: string;
};

export type ResultadoImportacion = {
  columnas: string[];
  noReconocidas: string[];
  filas: FilaPlan[];
  resumen: Record<AccionFila, number>;
  aplicado: boolean;
};

type Plan = ResultadoImportacion & {
  operaciones: { fila: number; registroId: string | null; entrada: Entrada }[];
};

/** Todos los registros (por páginas de 1000). */
async function todos(organizationId: string, clave: string, op: OpcionesListado = {}): Promise<Registro[]> {
  const out: Registro[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { registros, total } = await listarRegistros(organizationId, clave, { ...op, limite: 1000, desde });
    out.push(...registros);
    if (out.length >= total || registros.length === 0) return out;
  }
}

function objetoDe(motor: Motor, clave: string): ObjetoMeta {
  const o = motor.objetos.get(clave);
  if (!o) throw new MotorError("objeto_desconocido", `No existe el objeto «${clave}»`);
  return o;
}

async function planificar(
  organizationId: string,
  clave: string,
  texto: string,
  padreFijo: { relacion: string; id: string } | undefined
): Promise<Plan> {
  const motor = await cargarMotor(organizationId);
  const objeto = objetoDe(motor, clave);
  const dto: ObjetoDto = describirObjeto(motor, objeto);
  if (padreFijo && !dto.padres.some((p) => p.clave === padreFijo.relacion)) {
    throw new MotorError("invalido", `«${padreFijo.relacion}» no es un padre de «${objeto.nombre}»`);
  }
  const lectura = leerCsv(dto, texto);
  const vacio: Plan = {
    columnas: lectura.columnas.map((c) => c.encabezado.trim()),
    noReconocidas: lectura.noReconocidas,
    filas: lectura.errores.map((e) => ({ fila: e.fila, titulo: "", accion: "error", cambios: [], mensaje: e.mensaje })),
    resumen: { crear: 0, actualizar: 0, sin_cambios: 0, error: lectura.errores.length },
    aplicado: false,
    operaciones: [],
  };
  if (lectura.errores.length) return vacio;

  // Padres por nombre. Un nombre repetido es ambiguo: no se usa.
  const padresPorNombre = new Map<string, Map<string, string | null>>();
  for (const p of dto.padres) {
    const mapa = new Map<string, string | null>();
    for (const r of await todos(organizationId, p.objeto)) {
      const k = normalizar(r.titulo);
      mapa.set(k, mapa.has(k) ? null : r.id);
    }
    padresPorNombre.set(p.clave, mapa);
  }

  // Registros existentes, por nombre (y padre, si el nombre es único dentro de él).
  const relacionUnica = objeto.tituloUnicoDentroDe;
  const claveDe = (titulo: string, padres: Record<string, string | null>) =>
    `${relacionUnica ? `${padres[relacionUnica] ?? ""}|` : ""}${normalizar(titulo)}`;
  const existentes = new Map<string, Registro>();
  for (const r of await todos(organizationId, clave, padreFijo ? { padre: padreFijo } : {})) {
    existentes.set(claveDe(r.titulo, r.padres), r);
  }

  const plan = vacio;
  const vistas = new Set<string>();
  for (const f of lectura.filas) {
    const errores: string[] = [];

    const padres: Record<string, string | null> = {};
    if (padreFijo) padres[padreFijo.relacion] = padreFijo.id;
    for (const [relacion, nombre] of Object.entries(f.padres)) {
      if (padreFijo?.relacion === relacion) continue;
      const rel = dto.padres.find((p) => p.clave === relacion);
      const id = padresPorNombre.get(relacion)?.get(normalizar(nombre));
      if (id === undefined) errores.push(`No existe «${nombre}» en ${rel?.nombre ?? relacion}`);
      else if (id === null) errores.push(`Hay más de un «${nombre}» en ${rel?.nombre ?? relacion}`);
      else padres[relacion] = id;
    }

    const valoresEntrada: Record<string, unknown> = {};
    const tipados: Record<string, Valor> = {};
    for (const [k, texto] of Object.entries(f.valores)) {
      const campo = objeto.campos.find((c) => c.clave === k);
      const campoDto = dto.campos.find((c) => c.clave === k);
      if (!campo || !campoDto) continue;
      const v = valorDeCelda(campoDto, texto);
      const r = convertir(campo, v);
      if (!r.ok) errores.push(r.error);
      else {
        valoresEntrada[k] = v;
        tipados[k] = r.valor;
      }
    }

    // El nombre: con lo que trae la fila (y, si falta algo, con lo del registro existente).
    const tituloFila = armarTitulo(objeto.titulo, tipados);
    const k = claveDe(tituloFila, padres);
    const existente = existentes.get(k);
    const titulo = existente ? existente.titulo : tituloFila;

    if (!errores.length && !tituloFila.trim()) errores.push("La fila no tiene nombre");
    if (!errores.length && vistas.has(k)) errores.push(`«${titulo}» está repetido en el archivo`);
    vistas.add(k);

    if (errores.length) {
      plan.filas.push({ fila: f.fila, titulo, accion: "error", cambios: [], mensaje: errores.join(" · ") });
      plan.resumen.error++;
      continue;
    }

    if (existente) {
      const cambios: string[] = [];
      const entrada: Entrada = { valores: {}, padres: {} };
      for (const [clave2, nuevo] of Object.entries(tipados)) {
        if (mismoValor(existente.valores[clave2], nuevo)) continue;
        const campo = objeto.campos.find((c) => c.clave === clave2);
        (entrada.valores as Record<string, unknown>)[clave2] = valoresEntrada[clave2];
        cambios.push(`${campo?.nombre ?? clave2}: ${mostrar(existente.valores[clave2])} → ${mostrar(nuevo)}`);
      }
      for (const [relacion, id] of Object.entries(padres)) {
        if ((existente.padres[relacion] ?? null) === id) continue;
        (entrada.padres as Record<string, string | null>)[relacion] = id;
        cambios.push(`${dto.padres.find((p) => p.clave === relacion)?.nombre ?? relacion}: cambia`);
      }
      const accion: AccionFila = cambios.length ? "actualizar" : "sin_cambios";
      plan.filas.push({ fila: f.fila, titulo, accion, cambios });
      plan.resumen[accion]++;
      if (cambios.length) plan.operaciones.push({ fila: f.fila, registroId: existente.id, entrada });
      continue;
    }

    const faltan = [
      ...objeto.campos.filter((c) => c.columna && c.obligatorio && !(c.clave in valoresEntrada)).map((c) => c.nombre),
      ...dto.padres.filter((p) => p.obligatoria && !padres[p.clave]).map((p) => p.nombre),
    ];
    if (faltan.length) {
      plan.filas.push({ fila: f.fila, titulo, accion: "error", cambios: [], mensaje: `Falta: ${faltan.join(", ")}` });
      plan.resumen.error++;
      continue;
    }
    plan.filas.push({ fila: f.fila, titulo, accion: "crear", cambios: [] });
    plan.resumen.crear++;
    plan.operaciones.push({ fila: f.fila, registroId: null, entrada: { valores: valoresEntrada, padres } });
  }
  return plan;
}

function mostrar(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}

function sinOperaciones(plan: Plan): ResultadoImportacion {
  return {
    columnas: plan.columnas,
    noReconocidas: plan.noReconocidas,
    filas: plan.filas,
    resumen: plan.resumen,
    aplicado: plan.aplicado,
  };
}

/** El plan, sin tocar nada: para mostrar antes de confirmar. */
export async function previsualizarImportacion(
  organizationId: string,
  clave: string,
  texto: string,
  padreFijo?: { relacion: string; id: string }
): Promise<ResultadoImportacion> {
  return sinOperaciones(await planificar(organizationId, clave, texto, padreFijo));
}

/** Aplica el plan. Las filas que fallan al guardar quedan como error; el resto se guarda. */
export async function aplicarImportacion(
  organizationId: string,
  clave: string,
  texto: string,
  usuarioId: string,
  padreFijo?: { relacion: string; id: string }
): Promise<ResultadoImportacion & { lote: string }> {
  const plan = await planificar(organizationId, clave, texto, padreFijo);
  const lote = newId("lote");
  const actor = { tipo: "importacion" as const, id: usuarioId, loteId: lote };
  for (const op of plan.operaciones) {
    try {
      if (op.registroId) await actualizarRegistro(organizationId, clave, op.registroId, op.entrada, actor);
      else await crearRegistro(organizationId, clave, op.entrada, actor);
    } catch (err) {
      if (!(err instanceof MotorError)) throw err;
      const fila = plan.filas.find((f) => f.fila === op.fila);
      if (fila) {
        plan.resumen[fila.accion]--;
        fila.accion = "error";
        fila.mensaje = err.message;
        plan.resumen.error++;
      }
    }
  }
  return { ...sinOperaciones(plan), aplicado: true, lote };
}

/** Los registros como CSV (con los filtros de la lista), listos para editar y volver a subir. */
export async function exportarCsv(
  organizationId: string,
  clave: string,
  op: OpcionesListado = {}
): Promise<{ nombre: string; csv: string }> {
  const motor = await cargarMotor(organizationId);
  const objeto = objetoDe(motor, clave);
  const dto = describirObjeto(motor, objeto);
  const registros = await todos(organizationId, clave, op);
  const nombresPadres: Record<string, Record<string, string>> = {};
  for (const p of dto.padres) {
    const mapa: Record<string, string> = {};
    for (const r of await todos(organizationId, p.objeto)) mapa[r.id] = r.titulo;
    nombresPadres[p.clave] = mapa;
  }
  return { nombre: objeto.nombrePlural, csv: generarCsv(dto, registros.map(aDto), nombresPadres) };
}
