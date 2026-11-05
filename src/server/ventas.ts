import { asc, count, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import {
  metrosTotales,
  resolverInteres,
  VALORES_ESTADO_EDIFICIO,
  VALORES_ESTADO_OPORTUNIDAD,
  VALORES_ESTADO_TAREA,
  VALORES_ESTADO_UNIDAD,
  VALORES_MOTIVO,
  VALORES_ORIGEN,
  VALORES_TIPO_OPORTUNIDAD,
  VALORES_TIPO_TAREA,
  VALORES_TIPOLOGIA,
  type EstadoEdificio,
  type EstadoOportunidad,
  type EstadoTarea,
  type EstadoUnidad,
  type Tipologia,
  type TipoOportunidad,
  type TipoTarea,
} from "@/lib/ventas";
import { reemplazarInteres } from "@/server/oportunidades-war";
import {
  compararUnidades,
  generarCsvUnidades,
  leerUnidadesCsv,
  type Comparacion,
  type ValoresUnidad,
} from "@/lib/unidades-csv";
import { renderMemoriaAgente } from "@/lib/memoria-agente";

/**
 * Ventas de la constructora. Las rutas solo autentican y traducen el body;
 * acá se resuelve el interés, se calculan los metros y se exige el tenant.
 */

export class VentasError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

const estadoEdificio = z.enum(
  VALORES_ESTADO_EDIFICIO as [EstadoEdificio, ...EstadoEdificio[]]
);
const estadoUnidad = z.enum(VALORES_ESTADO_UNIDAD as [EstadoUnidad, ...EstadoUnidad[]]);
const tipologia = z.enum(VALORES_TIPOLOGIA as [Tipologia, ...Tipologia[]]);
const origen = z.enum(VALORES_ORIGEN as unknown as [string, ...string[]]);
const estadoOportunidad = z.enum(
  VALORES_ESTADO_OPORTUNIDAD as [EstadoOportunidad, ...EstadoOportunidad[]]
);
const tipoOportunidad = z.enum(
  VALORES_TIPO_OPORTUNIDAD as [TipoOportunidad, ...TipoOportunidad[]]
);
const motivo = z.enum(VALORES_MOTIVO as unknown as [string, ...string[]]);
const tipoTarea = z.enum(VALORES_TIPO_TAREA as [TipoTarea, ...TipoTarea[]]);
const estadoTarea = z.enum(VALORES_ESTADO_TAREA as [EstadoTarea, ...EstadoTarea[]]);

const texto = (max: number) => z.string().trim().max(max).nullable().optional();
const metros = z.number().min(0).max(999_999.99).nullable().optional();
const idOpcional = z.string().trim().min(1).max(40).nullable().optional();

export const edificioSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio").max(160),
  direccion: texto(400),
  estado: estadoEdificio.optional(),
  enVenta: texto(400),
  /** 0032 — Si no viene, no se cambia. */
  memoriaAgente: z.boolean().optional(),
  notasAgente: texto(4000),
});

/** Dormitorios, baños…: un entero chico, o nada. */
const cantidad = z.number().int().min(0).max(50).nullable().optional();

export const departamentoSchema = z.object({
  unidad: z.string().trim().min(1, "La unidad es obligatoria").max(40),
  orientacionEdificio: texto(80),
  orientacionGeo: texto(80),
  metrosCubiertos: metros,
  metrosSemicubiertos: metros,
  metrosDescubiertos: metros,
  valorCents: z.number().int().min(0).max(100_000_000_000).nullable().optional(),
  moneda: z.string().trim().length(3).nullable().optional(),
  estado: estadoUnidad.optional(),
  tipologia: tipologia.nullable().optional(),
  piso: z.number().int().min(-5).max(200).nullable().optional(),
  dormitorios: cantidad,
  banos: cantidad,
  toilette: cantidad,
  enSuite: cantidad,
  notasAgente: texto(1000),
});

export const oportunidadSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio").max(160),
  origen: origen.nullable().optional(),
  contactId: idOpcional,
  edificioId: idOpcional,
  departamentoId: idOpcional,
  /** 068 — Varios edificios de interés. Si viene, reemplaza los que había. */
  edificioIds: z.array(z.string().min(1)).max(50).optional(),
  /** 068 — Varias tipologías de interés. Si viene, reemplaza las que había. */
  tipologias: z.array(tipologia).max(5).optional(),
  estado: estadoOportunidad.optional(),
  tipo: tipoOportunidad.nullable().optional(),
  motivoCierre: motivo.nullable().optional(),
  valorCents: z.number().int().min(0).max(100_000_000_000).nullable().optional(),
  moneda: z.string().trim().length(3).nullable().optional(),
});

export const tareaSchema = z.object({
  titulo: z.string().trim().min(1, "El título es obligatorio").max(200),
  tipo: tipoTarea,
  estado: estadoTarea.optional(),
  /** `datetime-local` del navegador, o null si todavía no tiene día. */
  fecha: z.string().trim().max(40).nullable().optional(),
  comentarios: texto(4000),
  contactId: idOpcional,
  oportunidadId: idOpcional,
});

export type EdificioDto = {
  id: string;
  nombre: string;
  direccion: string | null;
  estado: EstadoEdificio;
  enVenta: string | null;
  departamentos: number;
  memoriaAgente: boolean;
  notasAgente: string | null;
};

export type DepartamentoDto = {
  id: string;
  edificioId: string;
  unidad: string;
  orientacionEdificio: string | null;
  orientacionGeo: string | null;
  metrosCubiertos: number | null;
  metrosSemicubiertos: number | null;
  metrosDescubiertos: number | null;
  metrosTotales: number | null;
  valorCents: number | null;
  moneda: string | null;
  estado: EstadoUnidad;
  tipologia: Tipologia | null;
  piso: number | null;
  dormitorios: number | null;
  banos: number | null;
  toilette: number | null;
  enSuite: number | null;
  notasAgente: string | null;
};

export type OportunidadDto = {
  id: string;
  nombre: string;
  origen: string | null;
  contactId: string | null;
  contactoNombre: string | null;
  edificioId: string | null;
  edificioNombre: string | null;
  departamentoId: string | null;
  unidad: string | null;
  estado: EstadoOportunidad;
  tipo: TipoOportunidad | null;
  motivoCierre: string | null;
  valorCents: number | null;
  moneda: string | null;
  /** 068 — Todos los edificios de interés (el `edificioId` de arriba es el principal). */
  edificios: { id: string; nombre: string }[];
  /** 068 — Tipologías de interés. */
  tipologias: Tipologia[];
  /** War — último formulario o mensaje del interesado (ISO). Ordena la lista. */
  ultimaInteraccion: string;
  /** War — cuántos formularios de anuncio o portal sumó esta oportunidad. */
  formularios: number;
};

export type TareaDto = {
  id: string;
  titulo: string;
  tipo: TipoTarea;
  estado: EstadoTarea;
  fecha: string | null;
  comentarios: string | null;
  contactId: string | null;
  contactoNombre: string | null;
  oportunidadId: string | null;
  oportunidadNombre: string | null;
};

function oNulo(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t.length ? t : null;
}

function num(v: number | null | undefined): string | null {
  if (v == null) return null;
  return v.toFixed(2);
}

function deNum(v: string | null): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function fechaDe(v: string | null | undefined): Date | null {
  if (v == null || v.trim() === "") return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) {
    throw new VentasError(422, "invalid_body", "La fecha no es válida");
  }
  return d;
}

function esDuplicado(err: unknown): boolean {
  const code =
    (err as { code?: string })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
  return code === "23505";
}

function aDepartamento(fila: typeof schema.departamento.$inferSelect): DepartamentoDto {
  const metrosCubiertos = deNum(fila.metrosCubiertos);
  const metrosSemicubiertos = deNum(fila.metrosSemicubiertos);
  const metrosDescubiertos = deNum(fila.metrosDescubiertos);
  return {
    id: fila.id,
    edificioId: fila.edificioId,
    unidad: fila.unidad,
    orientacionEdificio: fila.orientacionEdificio,
    orientacionGeo: fila.orientacionGeo,
    metrosCubiertos,
    metrosSemicubiertos,
    metrosDescubiertos,
    metrosTotales: metrosTotales({
      cubiertos: metrosCubiertos,
      semicubiertos: metrosSemicubiertos,
      descubiertos: metrosDescubiertos,
    }),
    valorCents: fila.valorCents,
    moneda: fila.moneda,
    estado: fila.estado,
    tipologia: fila.tipologia,
    piso: fila.piso,
    dormitorios: fila.dormitorios,
    banos: fila.banos,
    toilette: fila.toilette,
    enSuite: fila.enSuite,
    notasAgente: fila.notasAgente,
  };
}

function valoresDepartamento(datos: z.infer<typeof departamentoSchema>) {
  const valorCents = datos.valorCents ?? null;
  return {
    unidad: datos.unidad.trim(),
    orientacionEdificio: oNulo(datos.orientacionEdificio),
    orientacionGeo: oNulo(datos.orientacionGeo),
    metrosCubiertos: num(datos.metrosCubiertos),
    metrosSemicubiertos: num(datos.metrosSemicubiertos),
    metrosDescubiertos: num(datos.metrosDescubiertos),
    valorCents,
    moneda: valorCents == null ? null : oNulo(datos.moneda),
    estado: datos.estado ?? "disponible",
    tipologia: datos.tipologia ?? null,
    piso: datos.piso ?? null,
    dormitorios: datos.dormitorios ?? null,
    banos: datos.banos ?? null,
    toilette: datos.toilette ?? null,
    enSuite: datos.enSuite ?? null,
    notasAgente: oNulo(datos.notasAgente),
  } as const;
}

async function exigirEnOrganizacion(
  organizationId: string,
  tabla: "contact" | "oportunidad" | "edificio",
  id: string | null | undefined,
  mensaje: string
): Promise<void> {
  if (!id) return;
  const db = getDb();
  const columna =
    tabla === "contact"
      ? schema.contact
      : tabla === "edificio"
        ? schema.edificio
        : schema.oportunidad;
  const [fila] = await db
    .select({ id: columna.id })
    .from(columna)
    .where(scoped(columna.organizationId, organizationId, eq(columna.id, id)))
    .limit(1);
  if (!fila) throw new VentasError(422, "invalid_body", mensaje);
}

export async function listarEdificios(organizationId: string): Promise<EdificioDto[]> {
  const db = getDb();
  const filas = await db
    .select()
    .from(schema.edificio)
    .where(scoped(schema.edificio.organizationId, organizationId))
    .orderBy(asc(schema.edificio.nombre));
  const conteos = await db
    .select({
      edificioId: schema.departamento.edificioId,
      n: count(),
    })
    .from(schema.departamento)
    .where(scoped(schema.departamento.organizationId, organizationId))
    .groupBy(schema.departamento.edificioId);
  const porEdificio = new Map(conteos.map((c) => [c.edificioId, Number(c.n)]));
  return filas.map((f) => ({
    id: f.id,
    nombre: f.nombre,
    direccion: f.direccion,
    estado: f.estado,
    enVenta: f.enVenta,
    departamentos: porEdificio.get(f.id) ?? 0,
    memoriaAgente: f.memoriaAgente,
    notasAgente: f.notasAgente,
  }));
}

export async function obtenerEdificio(
  organizationId: string,
  id: string
): Promise<{ edificio: EdificioDto; departamentos: DepartamentoDto[] }> {
  const db = getDb();
  const [fila] = await db
    .select()
    .from(schema.edificio)
    .where(scoped(schema.edificio.organizationId, organizationId, eq(schema.edificio.id, id)))
    .limit(1);
  if (!fila) throw new VentasError(404, "not_found", "Ese edificio no existe");
  const unidades = await db
    .select()
    .from(schema.departamento)
    .where(
      scoped(
        schema.departamento.organizationId,
        organizationId,
        eq(schema.departamento.edificioId, id)
      )
    )
    .orderBy(asc(schema.departamento.piso), asc(schema.departamento.unidad));
  return {
    edificio: {
      id: fila.id,
      nombre: fila.nombre,
      direccion: fila.direccion,
      estado: fila.estado,
      enVenta: fila.enVenta,
      departamentos: unidades.length,
      memoriaAgente: fila.memoriaAgente,
      notasAgente: fila.notasAgente,
    },
    departamentos: unidades.map(aDepartamento),
  };
}

export async function crearEdificio(
  organizationId: string,
  datos: z.infer<typeof edificioSchema>
): Promise<EdificioDto> {
  const [fila] = await getDb()
    .insert(schema.edificio)
    .values({
      id: newId("edificio"),
      organizationId,
      nombre: datos.nombre.trim(),
      direccion: oNulo(datos.direccion),
      estado: datos.estado ?? "en_construccion",
      enVenta: oNulo(datos.enVenta),
      memoriaAgente: datos.memoriaAgente ?? false,
      notasAgente: oNulo(datos.notasAgente),
    })
    .returning();
  return {
    id: fila!.id,
    nombre: fila!.nombre,
    direccion: fila!.direccion,
    estado: fila!.estado,
    enVenta: fila!.enVenta,
    departamentos: 0,
    memoriaAgente: fila!.memoriaAgente,
    notasAgente: fila!.notasAgente,
  };
}

export async function editarEdificio(
  organizationId: string,
  id: string,
  datos: z.infer<typeof edificioSchema>
): Promise<EdificioDto> {
  const [fila] = await getDb()
    .update(schema.edificio)
    .set({
      nombre: datos.nombre.trim(),
      direccion: oNulo(datos.direccion),
      estado: datos.estado ?? "en_construccion",
      enVenta: oNulo(datos.enVenta),
      ...(datos.memoriaAgente !== undefined ? { memoriaAgente: datos.memoriaAgente } : {}),
      ...(datos.notasAgente !== undefined ? { notasAgente: oNulo(datos.notasAgente) } : {}),
      updatedAt: new Date(),
    })
    .where(scoped(schema.edificio.organizationId, organizationId, eq(schema.edificio.id, id)))
    .returning();
  if (!fila) throw new VentasError(404, "not_found", "Ese edificio no existe");
  const actual = await obtenerEdificio(organizationId, id);
  return actual.edificio;
}

export async function borrarEdificio(organizationId: string, id: string): Promise<void> {
  const [fila] = await getDb()
    .delete(schema.edificio)
    .where(scoped(schema.edificio.organizationId, organizationId, eq(schema.edificio.id, id)))
    .returning({ id: schema.edificio.id });
  if (!fila) throw new VentasError(404, "not_found", "Ese edificio no existe");
}

export async function crearDepartamento(
  organizationId: string,
  edificioId: string,
  datos: z.infer<typeof departamentoSchema>
): Promise<DepartamentoDto> {
  await exigirEnOrganizacion(organizationId, "edificio", edificioId, "Ese edificio no existe");
  try {
    const [fila] = await getDb()
      .insert(schema.departamento)
      .values({
        id: newId("departamento"),
        organizationId,
        edificioId,
        ...valoresDepartamento(datos),
      })
      .returning();
    return aDepartamento(fila!);
  } catch (err) {
    if (esDuplicado(err)) {
      throw new VentasError(409, "duplicado", `Ya hay una unidad ${datos.unidad.trim()} en este edificio`);
    }
    throw err;
  }
}

export async function editarDepartamento(
  organizationId: string,
  id: string,
  datos: z.infer<typeof departamentoSchema>
): Promise<DepartamentoDto> {
  try {
    const [fila] = await getDb()
      .update(schema.departamento)
      .set({ ...valoresDepartamento(datos), updatedAt: new Date() })
      .where(
        scoped(schema.departamento.organizationId, organizationId, eq(schema.departamento.id, id))
      )
      .returning();
    if (!fila) throw new VentasError(404, "not_found", "Ese departamento no existe");
    return aDepartamento(fila);
  } catch (err) {
    if (err instanceof VentasError) throw err;
    if (esDuplicado(err)) {
      throw new VentasError(409, "duplicado", `Ya hay una unidad ${datos.unidad.trim()} en este edificio`);
    }
    throw err;
  }
}

export async function borrarDepartamento(organizationId: string, id: string): Promise<void> {
  const [fila] = await getDb()
    .delete(schema.departamento)
    .where(scoped(schema.departamento.organizationId, organizationId, eq(schema.departamento.id, id)))
    .returning({ id: schema.departamento.id });
  if (!fila) throw new VentasError(404, "not_found", "Ese departamento no existe");
}

async function interesDe(
  organizationId: string,
  edificioId: string | null | undefined,
  departamentoId: string | null | undefined
) {
  const db = getDb();
  let departamento: { id: string; edificioId: string } | null = null;
  if (departamentoId) {
    const [fila] = await db
      .select({ id: schema.departamento.id, edificioId: schema.departamento.edificioId })
      .from(schema.departamento)
      .where(
        scoped(
          schema.departamento.organizationId,
          organizationId,
          eq(schema.departamento.id, departamentoId)
        )
      )
      .limit(1);
    if (!fila) throw new VentasError(422, "invalid_body", "Ese departamento no existe");
    departamento = fila;
  }
  if (edificioId) {
    await exigirEnOrganizacion(organizationId, "edificio", edificioId, "Ese edificio no existe");
  }
  const resuelto = resolverInteres({ edificioId: edificioId ?? null, departamento });
  if (!resuelto.ok) throw new VentasError(422, "invalid_body", resuelto.error);
  return resuelto;
}

type InteresOportunidad = { edificios: { id: string; nombre: string }[]; tipologias: Tipologia[] };

/** 068 — El interés (edificios y tipologías) de varias oportunidades en dos consultas. */
async function interesDeOportunidades(
  organizationId: string,
  ids: readonly string[]
): Promise<Map<string, InteresOportunidad>> {
  const mapa = new Map<string, InteresOportunidad>();
  for (const id of ids) mapa.set(id, { edificios: [], tipologias: [] });
  if (ids.length === 0) return mapa;
  const db = getDb();
  const [edificios, tipologias] = await Promise.all([
    db
      .select({
        oportunidadId: schema.oportunidadEdificio.oportunidadId,
        id: schema.edificio.id,
        nombre: schema.edificio.nombre,
      })
      .from(schema.oportunidadEdificio)
      .innerJoin(schema.edificio, eq(schema.edificio.id, schema.oportunidadEdificio.edificioId))
      .where(
        scoped(
          schema.oportunidadEdificio.organizationId,
          organizationId,
          inArray(schema.oportunidadEdificio.oportunidadId, [...ids])
        )
      )
      .orderBy(asc(schema.edificio.nombre)),
    db
      .select({
        oportunidadId: schema.oportunidadTipologia.oportunidadId,
        tipologia: schema.oportunidadTipologia.tipologia,
      })
      .from(schema.oportunidadTipologia)
      .where(
        scoped(
          schema.oportunidadTipologia.organizationId,
          organizationId,
          inArray(schema.oportunidadTipologia.oportunidadId, [...ids])
        )
      ),
  ]);
  for (const e of edificios) {
    mapa.get(e.oportunidadId)?.edificios.push({ id: e.id, nombre: e.nombre });
  }
  for (const t of tipologias) mapa.get(t.oportunidadId)?.tipologias.push(t.tipologia);
  for (const v of mapa.values()) {
    const set = new Set(v.tipologias);
    v.tipologias = (VALORES_TIPOLOGIA as Tipologia[]).filter((t) => set.has(t));
  }
  return mapa;
}

function aOportunidad(
  fila: typeof schema.oportunidad.$inferSelect,
  extra: { contactoNombre: string | null; edificioNombre: string | null; unidad: string | null },
  interes: InteresOportunidad = { edificios: [], tipologias: [] },
  formularios = 0
): OportunidadDto {
  return {
    id: fila.id,
    nombre: fila.nombre,
    origen: fila.origen,
    contactId: fila.contactId,
    contactoNombre: extra.contactoNombre,
    edificioId: fila.edificioId,
    edificioNombre: extra.edificioNombre,
    departamentoId: fila.departamentoId,
    unidad: extra.unidad,
    estado: fila.estado,
    tipo: fila.tipo,
    motivoCierre: fila.motivoCierre,
    valorCents: fila.valorCents,
    moneda: fila.moneda,
    edificios: interes.edificios,
    tipologias: interes.tipologias,
    ultimaInteraccion: fila.ultimaInteraccion.toISOString(),
    formularios,
  };
}

/** War — Formularios recibidos por oportunidad. */
async function formulariosDeOportunidades(
  organizationId: string,
  ids: readonly string[]
): Promise<Map<string, number>> {
  if (!ids.length) return new Map();
  const filas = await getDb()
    .select({ oportunidadId: schema.oportunidadLead.oportunidadId, n: count() })
    .from(schema.oportunidadLead)
    .where(
      scoped(
        schema.oportunidadLead.organizationId,
        organizationId,
        inArray(schema.oportunidadLead.oportunidadId, [...ids])
      )
    )
    .groupBy(schema.oportunidadLead.oportunidadId);
  return new Map(filas.map((f) => [f.oportunidadId, Number(f.n)]));
}

export async function listarOportunidades(organizationId: string): Promise<OportunidadDto[]> {
  const filas = await getDb()
    .select({
      op: schema.oportunidad,
      contactoNombre: schema.contact.name,
      edificioNombre: schema.edificio.nombre,
      unidad: schema.departamento.unidad,
    })
    .from(schema.oportunidad)
    .leftJoin(schema.contact, eq(schema.contact.id, schema.oportunidad.contactId))
    .leftJoin(schema.edificio, eq(schema.edificio.id, schema.oportunidad.edificioId))
    .leftJoin(schema.departamento, eq(schema.departamento.id, schema.oportunidad.departamentoId))
    .where(scoped(schema.oportunidad.organizationId, organizationId))
    // War: lo que tuvo movimiento del interesado (formulario o WhatsApp) arriba.
    .orderBy(desc(schema.oportunidad.ultimaInteraccion), desc(schema.oportunidad.updatedAt));
  const ids = filas.map((f) => f.op.id);
  const [intereses, formularios] = await Promise.all([
    interesDeOportunidades(organizationId, ids),
    formulariosDeOportunidades(organizationId, ids),
  ]);
  return filas.map((f) =>
    aOportunidad(
      f.op,
      {
        contactoNombre: f.contactoNombre,
        edificioNombre: f.edificioNombre,
        unidad: f.unidad,
      },
      intereses.get(f.op.id),
      formularios.get(f.op.id) ?? 0
    )
  );
}

async function valoresOportunidad(
  organizationId: string,
  datos: z.infer<typeof oportunidadSchema>
) {
  await exigirEnOrganizacion(
    organizationId,
    "contact",
    datos.contactId,
    "Ese contacto no existe"
  );
  // 068 — Varios edificios: el principal (`edificio_id`) es el del
  // departamento si hay uno, si no el primero de la lista.
  const lista = datos.edificioIds ?? (datos.edificioId ? [datos.edificioId] : []);
  const interes = await interesDe(organizationId, null, datos.departamentoId);
  const principal = interes.edificioId ?? lista[0] ?? null;
  if (principal && !interes.edificioId) {
    await exigirEnOrganizacion(organizationId, "edificio", principal, "Ese edificio no existe");
  }
  const valorCents = datos.valorCents ?? null;
  return {
    nombre: datos.nombre.trim(),
    origen: datos.origen ?? null,
    contactId: datos.contactId ?? null,
    edificioId: principal,
    departamentoId: interes.departamentoId,
    estado: datos.estado ?? "recibido",
    tipo: datos.tipo ?? null,
    motivoCierre: datos.motivoCierre ?? null,
    valorCents,
    moneda: valorCents == null ? null : oNulo(datos.moneda),
  };
}

async function oportunidadConNombres(
  organizationId: string,
  id: string
): Promise<OportunidadDto> {
  const [fila] = await getDb()
    .select({
      op: schema.oportunidad,
      contactoNombre: schema.contact.name,
      edificioNombre: schema.edificio.nombre,
      unidad: schema.departamento.unidad,
    })
    .from(schema.oportunidad)
    .leftJoin(schema.contact, eq(schema.contact.id, schema.oportunidad.contactId))
    .leftJoin(schema.edificio, eq(schema.edificio.id, schema.oportunidad.edificioId))
    .leftJoin(schema.departamento, eq(schema.departamento.id, schema.oportunidad.departamentoId))
    .where(scoped(schema.oportunidad.organizationId, organizationId, eq(schema.oportunidad.id, id)))
    .limit(1);
  if (!fila) throw new VentasError(404, "not_found", "Esa oportunidad no existe");
  const [intereses, formularios] = await Promise.all([
    interesDeOportunidades(organizationId, [id]),
    formulariosDeOportunidades(organizationId, [id]),
  ]);
  return aOportunidad(
    fila.op,
    {
      contactoNombre: fila.contactoNombre,
      edificioNombre: fila.edificioNombre,
      unidad: fila.unidad,
    },
    intereses.get(id),
    formularios.get(id) ?? 0
  );
}

/** 068 — El índice único parcial frena una segunda oportunidad abierta. */
function esSegundaAbierta(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "23505"
  );
}

const SEGUNDA_ABIERTA =
  "Ese contacto ya tiene una oportunidad abierta: cerrala (Compró, Perdido o No calificado) antes de abrir otra";

/** 068 — Lo que se guarda como interés: la lista nueva, o el edificio único heredado. */
function interesPedido(datos: z.infer<typeof oportunidadSchema>, principal: string | null) {
  const edificioIds =
    datos.edificioIds ?? (datos.edificioId !== undefined ? (principal ? [principal] : []) : undefined);
  const conPrincipal =
    edificioIds && principal && !edificioIds.includes(principal)
      ? [principal, ...edificioIds]
      : edificioIds;
  return { edificioIds: conPrincipal, tipologias: datos.tipologias };
}

export async function crearOportunidad(
  organizationId: string,
  datos: z.infer<typeof oportunidadSchema>
): Promise<OportunidadDto> {
  const valores = await valoresOportunidad(organizationId, datos);
  let fila: { id: string } | undefined;
  try {
    [fila] = await getDb()
      .insert(schema.oportunidad)
      .values({ id: newId("oportunidad"), organizationId, ...valores })
      .returning({ id: schema.oportunidad.id });
  } catch (err) {
    if (esSegundaAbierta(err)) throw new VentasError(409, "ya_tiene_abierta", SEGUNDA_ABIERTA);
    throw err;
  }
  await reemplazarInteres(organizationId, fila!.id, interesPedido(datos, valores.edificioId));
  return oportunidadConNombres(organizationId, fila!.id);
}

export async function editarOportunidad(
  organizationId: string,
  id: string,
  datos: z.infer<typeof oportunidadSchema>
): Promise<OportunidadDto> {
  const valores = await valoresOportunidad(organizationId, datos);
  let fila: { id: string } | undefined;
  try {
    [fila] = await getDb()
      .update(schema.oportunidad)
      .set({ ...valores, updatedAt: new Date() })
      .where(scoped(schema.oportunidad.organizationId, organizationId, eq(schema.oportunidad.id, id)))
      .returning({ id: schema.oportunidad.id });
  } catch (err) {
    if (esSegundaAbierta(err)) throw new VentasError(409, "ya_tiene_abierta", SEGUNDA_ABIERTA);
    throw err;
  }
  if (!fila) throw new VentasError(404, "not_found", "Esa oportunidad no existe");
  await reemplazarInteres(organizationId, id, interesPedido(datos, valores.edificioId));
  return oportunidadConNombres(organizationId, id);
}

export async function borrarOportunidad(organizationId: string, id: string): Promise<void> {
  const [fila] = await getDb()
    .delete(schema.oportunidad)
    .where(scoped(schema.oportunidad.organizationId, organizationId, eq(schema.oportunidad.id, id)))
    .returning({ id: schema.oportunidad.id });
  if (!fila) throw new VentasError(404, "not_found", "Esa oportunidad no existe");
}

function aTarea(
  fila: typeof schema.tareaVenta.$inferSelect,
  extra: { contactoNombre: string | null; oportunidadNombre: string | null }
): TareaDto {
  return {
    id: fila.id,
    titulo: fila.titulo,
    tipo: fila.tipo,
    estado: fila.estado,
    fecha: fila.fecha ? fila.fecha.toISOString() : null,
    comentarios: fila.comentarios,
    contactId: fila.contactId,
    contactoNombre: extra.contactoNombre,
    oportunidadId: fila.oportunidadId,
    oportunidadNombre: extra.oportunidadNombre,
  };
}

export async function listarTareas(
  organizationId: string,
  estado?: EstadoTarea
): Promise<TareaDto[]> {
  const filas = await getDb()
    .select({
      tarea: schema.tareaVenta,
      contactoNombre: schema.contact.name,
      oportunidadNombre: schema.oportunidad.nombre,
    })
    .from(schema.tareaVenta)
    .leftJoin(schema.contact, eq(schema.contact.id, schema.tareaVenta.contactId))
    .leftJoin(schema.oportunidad, eq(schema.oportunidad.id, schema.tareaVenta.oportunidadId))
    .where(
      scoped(
        schema.tareaVenta.organizationId,
        organizationId,
        estado ? eq(schema.tareaVenta.estado, estado) : undefined
      )
    )
    .orderBy(asc(schema.tareaVenta.fecha), desc(schema.tareaVenta.createdAt));
  return filas.map((f) =>
    aTarea(f.tarea, {
      contactoNombre: f.contactoNombre,
      oportunidadNombre: f.oportunidadNombre,
    })
  );
}

async function valoresTarea(organizationId: string, datos: z.infer<typeof tareaSchema>) {
  await exigirEnOrganizacion(organizationId, "contact", datos.contactId, "Ese contacto no existe");
  await exigirEnOrganizacion(
    organizationId,
    "oportunidad",
    datos.oportunidadId,
    "Esa oportunidad no existe"
  );
  return {
    titulo: datos.titulo.trim(),
    tipo: datos.tipo,
    estado: datos.estado ?? "realizar",
    fecha: fechaDe(datos.fecha),
    comentarios: oNulo(datos.comentarios),
    contactId: datos.contactId ?? null,
    oportunidadId: datos.oportunidadId ?? null,
  };
}

async function tareaConNombres(organizationId: string, id: string): Promise<TareaDto> {
  const [fila] = await getDb()
    .select({
      tarea: schema.tareaVenta,
      contactoNombre: schema.contact.name,
      oportunidadNombre: schema.oportunidad.nombre,
    })
    .from(schema.tareaVenta)
    .leftJoin(schema.contact, eq(schema.contact.id, schema.tareaVenta.contactId))
    .leftJoin(schema.oportunidad, eq(schema.oportunidad.id, schema.tareaVenta.oportunidadId))
    .where(scoped(schema.tareaVenta.organizationId, organizationId, eq(schema.tareaVenta.id, id)))
    .limit(1);
  if (!fila) throw new VentasError(404, "not_found", "Esa tarea no existe");
  return aTarea(fila.tarea, {
    contactoNombre: fila.contactoNombre,
    oportunidadNombre: fila.oportunidadNombre,
  });
}

export async function crearTarea(
  organizationId: string,
  datos: z.infer<typeof tareaSchema>
): Promise<TareaDto> {
  const valores = await valoresTarea(organizationId, datos);
  const [fila] = await getDb()
    .insert(schema.tareaVenta)
    .values({ id: newId("tareaVenta"), organizationId, ...valores })
    .returning({ id: schema.tareaVenta.id });
  return tareaConNombres(organizationId, fila!.id);
}

export async function editarTarea(
  organizationId: string,
  id: string,
  datos: z.infer<typeof tareaSchema>
): Promise<TareaDto> {
  const valores = await valoresTarea(organizationId, datos);
  const [fila] = await getDb()
    .update(schema.tareaVenta)
    .set({ ...valores, updatedAt: new Date() })
    .where(scoped(schema.tareaVenta.organizationId, organizationId, eq(schema.tareaVenta.id, id)))
    .returning({ id: schema.tareaVenta.id });
  if (!fila) throw new VentasError(404, "not_found", "Esa tarea no existe");
  return tareaConNombres(organizationId, id);
}

export async function borrarTarea(organizationId: string, id: string): Promise<void> {
  const [fila] = await getDb()
    .delete(schema.tareaVenta)
    .where(scoped(schema.tareaVenta.organizationId, organizationId, eq(schema.tareaVenta.id, id)))
    .returning({ id: schema.tareaVenta.id });
  if (!fila) throw new VentasError(404, "not_found", "Esa tarea no existe");
}

export function esEstadoTarea(v: string | null): v is EstadoTarea {
  return !!v && (VALORES_ESTADO_TAREA as readonly string[]).includes(v);
}

/* ============================================================
 * Lista de precios en CSV (importar / exportar unidades)
 * ============================================================ */

export type ImportacionUnidades = Comparacion & {
  /** Solo al aplicar: lo que se escribió. */
  aplicado?: { creadas: number; modificadas: number };
  moneda: string;
};

/** Pasa los valores leídos del CSV a columnas de la tabla. Solo lo que vino. */
function columnasDesdeCsv(v: ValoresUnidad, moneda: string) {
  const set: Partial<typeof schema.departamento.$inferInsert> = {};
  if (v.piso !== undefined) set.piso = v.piso;
  if (v.tipologia !== undefined) set.tipologia = v.tipologia;
  if (v.metrosCubiertos !== undefined) set.metrosCubiertos = num(v.metrosCubiertos);
  if (v.metrosSemicubiertos !== undefined) set.metrosSemicubiertos = num(v.metrosSemicubiertos);
  if (v.metrosDescubiertos !== undefined) set.metrosDescubiertos = num(v.metrosDescubiertos);
  if (v.valorCents !== undefined) {
    set.valorCents = v.valorCents;
    set.moneda = v.valorCents == null ? null : moneda;
  }
  if (v.estado !== undefined) set.estado = v.estado;
  if (v.dormitorios !== undefined) set.dormitorios = v.dormitorios;
  if (v.banos !== undefined) set.banos = v.banos;
  if (v.toilette !== undefined) set.toilette = v.toilette;
  if (v.enSuite !== undefined) set.enSuite = v.enSuite;
  return set;
}

/**
 * Lee la lista de precios y la compara con las unidades del edificio. Con
 * `aplicar`, además crea las nuevas y actualiza las que cambiaron, todo en una
 * transacción. El servidor recalcula siempre desde el CSV: nunca aplica una
 * vista previa que mandó el navegador. Las filas con error se saltean; las
 * unidades que no vienen en el archivo no se tocan.
 */
export async function importarUnidadesCsv(input: {
  organizationId: string;
  edificioId: string;
  csv: string;
  /** La moneda del negocio, si el archivo no dice USD. */
  monedaNegocio: string;
  aplicar: boolean;
}): Promise<ImportacionUnidades> {
  const { organizationId, edificioId } = input;
  const { departamentos } = await obtenerEdificio(organizationId, edificioId);
  const lectura = leerUnidadesCsv(input.csv);
  const comparacion = compararUnidades(departamentos, lectura);
  const moneda = lectura.monedaDetectada ?? input.monedaNegocio;
  if (!input.aplicar) return { ...comparacion, moneda };

  await getDb().transaction(async (tx) => {
    if (comparacion.nuevas.length) {
      await tx.insert(schema.departamento).values(
        comparacion.nuevas.map((n) => ({
          id: newId("departamento"),
          organizationId,
          edificioId,
          unidad: n.unidad,
          estado: "disponible" as const,
          ...columnasDesdeCsv(n.valores, moneda),
        }))
      );
    }
    for (const m of comparacion.modificadas) {
      await tx
        .update(schema.departamento)
        .set({ ...columnasDesdeCsv(m.valores, moneda), updatedAt: new Date() })
        .where(
          scoped(
            schema.departamento.organizationId,
            organizationId,
            eq(schema.departamento.id, m.id)
          )
        );
    }
  });
  return {
    ...comparacion,
    moneda,
    aplicado: { creadas: comparacion.nuevas.length, modificadas: comparacion.modificadas.length },
  };
}

/** La lista del edificio como CSV (mismas columnas que lee el importador). */
export async function exportarUnidadesCsv(
  organizationId: string,
  edificioId: string
): Promise<{ nombre: string; csv: string }> {
  const { edificio, departamentos } = await obtenerEdificio(organizationId, edificioId);
  return { nombre: edificio.nombre, csv: generarCsvUnidades(departamentos) };
}

/* ============================================================
 * Memoria del agente (edificios con el interruptor prendido)
 * ============================================================ */

/**
 * Los edificios con «Memoria del agente» prendido, en texto, para sumarlos al
 * conocimiento del cerebro y del juez del Laboratorio. Nunca lanza: si la
 * lectura falla, el agente sigue con el resto de su conocimiento.
 */
export async function memoriaDeEdificios(organizationId: string): Promise<string> {
  try {
    const db = getDb();
    const edificios = await db
      .select()
      .from(schema.edificio)
      .where(
        scoped(
          schema.edificio.organizationId,
          organizationId,
          eq(schema.edificio.memoriaAgente, true)
        )
      )
      .orderBy(asc(schema.edificio.nombre));
    if (edificios.length === 0) return "";
    const unidades = await db
      .select()
      .from(schema.departamento)
      .where(
        scoped(
          schema.departamento.organizationId,
          organizationId,
          inArray(
            schema.departamento.edificioId,
            edificios.map((e) => e.id)
          )
        )
      )
      .orderBy(asc(schema.departamento.piso), asc(schema.departamento.unidad));
    const porEdificio = new Map<string, DepartamentoDto[]>();
    for (const u of unidades) {
      const lista = porEdificio.get(u.edificioId) ?? [];
      lista.push(aDepartamento(u));
      porEdificio.set(u.edificioId, lista);
    }
    return renderMemoriaAgente(
      edificios.map((e) => ({
        nombre: e.nombre,
        direccion: e.direccion,
        estado: e.estado,
        enVenta: e.enVenta,
        notasAgente: e.notasAgente,
        unidades: porEdificio.get(e.id) ?? [],
      }))
    );
  } catch (err) {
    console.error("[memoria] no se pudieron leer los edificios", err);
    return "";
  }
}
