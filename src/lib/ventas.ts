/**
 * Vocabulario de Ventas de la constructora. Vive en `lib/` para que la
 * pantalla y la API hablen de los mismos valores sin arrastrar la base.
 *
 * Los metros totales no se persisten: se calculan. Así un departamento no
 * puede mostrar un total que no cierre con sus tres superficies.
 */

export const ESTADOS_EDIFICIO = [
  { value: "en_construccion", label: "En construcción" },
  { value: "terminado", label: "Terminado" },
  { value: "en_pozo", label: "En pozo" },
  { value: "a_construir", label: "A construir" },
] as const;

export const ESTADOS_UNIDAD = [
  { value: "disponible", label: "Disponible" },
  { value: "consultar", label: "Consultar disponibilidad" },
  { value: "reservado", label: "Reservado" },
  { value: "vendido", label: "Vendido" },
] as const;

export const TIPOLOGIAS = [
  { value: "1_ambiente", label: "1 ambiente" },
  { value: "2_ambientes", label: "2 ambientes" },
  { value: "3_ambientes", label: "3 ambientes" },
  { value: "4_ambientes", label: "4 ambientes" },
  { value: "triplex", label: "Triplex" },
] as const;

/**
 * El origen de la oportunidad ya no es una lista fija: se configura en
 * Ajustes → Orígenes (nombre e ícono). Ver `src/lib/origenes.ts`.
 */

export const ESTADOS_OPORTUNIDAD = [
  { value: "recibido", label: "Recibido" },
  { value: "en_charlas", label: "En charlas" },
  { value: "conoce_informacion", label: "Conoce información" },
  { value: "visito", label: "Visitó" },
  { value: "reservo", label: "Reservó" },
  { value: "compro", label: "Compró" },
  { value: "no_calificado", label: "No calificado" },
  { value: "perdido", label: "Perdido" },
] as const;

export const TIPOS_OPORTUNIDAD = [
  { value: "venta", label: "Venta" },
  { value: "alquiler", label: "Alquiler" },
  { value: "inmobiliaria", label: "Inmobiliaria" },
] as const;

/**
 * War — Los motivos de cierre ahora son configurables (Ajustes → Motivos de
 * cierre, `src/lib/motivos-cierre.ts`). Esta es solo la lista con la que
 * arranca cada organización.
 */
export { MOTIVOS_POR_DEFECTO as MOTIVOS_CIERRE } from "./motivos-cierre";

/** Lo que una persona del equipo hace a mano. La IA no crea ni cierra estas. */
export const TIPOS_TAREA = [
  { value: "llamada", label: "Llamada" },
  { value: "visita", label: "Visita" },
  { value: "mensaje", label: "Mensaje" },
  { value: "reunion", label: "Reunión" },
  { value: "correo", label: "Correo" },
] as const;

export const ESTADOS_TAREA = [
  { value: "realizar", label: "Realizar" },
  { value: "no_responde", label: "No responde" },
  { value: "listo", label: "Listo" },
] as const;

export type EstadoEdificio = (typeof ESTADOS_EDIFICIO)[number]["value"];
export type EstadoUnidad = (typeof ESTADOS_UNIDAD)[number]["value"];
export type Tipologia = (typeof TIPOLOGIAS)[number]["value"];
export type EstadoOportunidad = (typeof ESTADOS_OPORTUNIDAD)[number]["value"];
export type TipoOportunidad = (typeof TIPOS_OPORTUNIDAD)[number]["value"];
export type TipoTarea = (typeof TIPOS_TAREA)[number]["value"];
export type EstadoTarea = (typeof ESTADOS_TAREA)[number]["value"];

const valores = <T extends readonly { value: string }[] | readonly string[]>(opciones: T) =>
  opciones.map((o) => (typeof o === "string" ? o : o.value));

export const VALORES_ESTADO_EDIFICIO = valores(ESTADOS_EDIFICIO);
export const VALORES_ESTADO_UNIDAD = valores(ESTADOS_UNIDAD);
export const VALORES_TIPOLOGIA = valores(TIPOLOGIAS);
export const VALORES_ESTADO_OPORTUNIDAD = valores(ESTADOS_OPORTUNIDAD);
export const VALORES_TIPO_OPORTUNIDAD = valores(TIPOS_OPORTUNIDAD);
export const VALORES_TIPO_TAREA = valores(TIPOS_TAREA);
export const VALORES_ESTADO_TAREA = valores(ESTADOS_TAREA);

export function etiqueta(
  opciones: readonly { value: string; label: string }[],
  value: string | null | undefined
): string {
  if (!value) return "—";
  return opciones.find((o) => o.value === value)?.label ?? value;
}

export type Superficies = {
  cubiertos: number | null;
  semicubiertos: number | null;
  descubiertos: number | null;
};

/** Suma las superficies cargadas. Sin ninguna, no hay total (no es cero). */
export function metrosTotales(m: Superficies): number | null {
  const partes = [m.cubiertos, m.semicubiertos, m.descubiertos].filter(
    (n): n is number => n != null && Number.isFinite(n)
  );
  if (partes.length === 0) return null;
  const suma = partes.reduce((a, b) => a + b, 0);
  return Math.round(suma * 100) / 100;
}

/**
 * El interés de una oportunidad es un edificio, un departamento, o ninguno.
 * Si hay departamento, el edificio es el suyo: no se puede interesar en una
 * unidad de otro edificio.
 */
export function resolverInteres(input: {
  edificioId: string | null;
  departamento: { id: string; edificioId: string } | null;
}): { ok: true; edificioId: string | null; departamentoId: string | null } | { ok: false; error: string } {
  if (input.departamento) {
    if (input.edificioId && input.edificioId !== input.departamento.edificioId) {
      return { ok: false, error: "El departamento no pertenece a ese edificio" };
    }
    return {
      ok: true,
      edificioId: input.departamento.edificioId,
      departamentoId: input.departamento.id,
    };
  }
  return { ok: true, edificioId: input.edificioId, departamentoId: null };
}

export function metrosTexto(n: number | null): string {
  if (n == null) return "—";
  return `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(n)} m²`;
}

/* ============================================================
 * 068 — Tipo de contacto y reglas de la oportunidad abierta
 * ============================================================ */

export const TIPOS_CONTACTO = [
  { value: "lead", label: "Lead" },
  { value: "comprador", label: "Comprador" },
  { value: "inmobiliaria", label: "Inmobiliaria" },
  { value: "proveedor", label: "Proveedor" },
  { value: "propio", label: "Propio de WAR" },
] as const;

export type TipoContacto = (typeof TIPOS_CONTACTO)[number]["value"];
export const VALORES_TIPO_CONTACTO = valores(TIPOS_CONTACTO) as TipoContacto[];

/** Solo un lead entra a la venta (oportunidades) y lo atiende la IA. */
export function tipoExcluyeDeVenta(tipo: TipoContacto | null | undefined): boolean {
  return tipo != null && tipo !== "lead";
}

/** Lo que la IA puede clasificar sola. `propio` es siempre manual. */
export const TIPOS_QUE_CLASIFICA_LA_IA: readonly TipoContacto[] = [
  "lead",
  "comprador",
  "inmobiliaria",
  "proveedor",
];

/** Abiertas = la oportunidad sigue viva (puede haber una por edificio). */
export const ESTADOS_ABIERTOS: readonly EstadoOportunidad[] = [
  "recibido",
  "en_charlas",
  "conoce_informacion",
  "visito",
  "reservo",
];

export function estaAbierta(estado: EstadoOportunidad): boolean {
  return ESTADOS_ABIERTOS.includes(estado);
}

/** El camino principal, en orden: lo que muestra el panel como pasos. */
export const CAMINO_OPORTUNIDAD: readonly EstadoOportunidad[] = [
  "recibido",
  "en_charlas",
  "conoce_informacion",
  "visito",
  "reservo",
  "compro",
];

/** Hasta dónde llega la IA sola, en orden. Lo demás lo marca una persona. */
export const ESTADOS_DE_LA_IA: readonly EstadoOportunidad[] = [
  "recibido",
  "en_charlas",
  "conoce_informacion",
];

/**
 * A qué etapas puede mover la IA una oportunidad que está en `actual`: solo
 * hacia adelante y dentro de las suyas. Desde una etapa que no es de la IA
 * (Visitó, No responde…) no mueve nada: ahí manda una persona.
 */
export function siguientesParaLaIA(actual: EstadoOportunidad): EstadoOportunidad[] {
  const i = ESTADOS_DE_LA_IA.indexOf(actual);
  if (i < 0) return [];
  return ESTADOS_DE_LA_IA.slice(i + 1);
}

function sinAcentos(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** El valor de un estado a partir de lo que mande el cerebro: clave o etiqueta. */
export function resolverEstadoOportunidad(pedido: string): EstadoOportunidad | null {
  const p = sinAcentos(pedido).replace(/\s+/g, "_");
  const hit = ESTADOS_OPORTUNIDAD.find(
    (e) => e.value === p || sinAcentos(e.label).replace(/\s+/g, "_") === p
  );
  return hit?.value ?? null;
}

/**
 * Tipo de contacto a partir de lo que escribe la IA en la ficha. Tolera
 * mayúsculas, acentos, plurales y sinónimos comunes; lo que no reconoce es
 * `null` (no clasifica: mejor sin clasificar que mal clasificado).
 */
export function normalizarTipoContacto(raw: unknown): TipoContacto | null {
  if (typeof raw !== "string") return null;
  const v = sinAcentos(raw).replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
  if (!v) return null;
  const sinonimos: [RegExp, TipoContacto][] = [
    [/^(lead|prospecto|interesado|cliente potencial|potencial)s?$/, "lead"],
    [/^(comprador|ya compro|cliente actual|propietario)(es|s)?$/, "comprador"],
    [/^(inmobiliaria|corredor|broker|martillero)s?$/, "inmobiliaria"],
    [/^(proveedor|contratista)(es|s)?$/, "proveedor"],
    [/^(propio|propio de war|interno|empleado)s?$/, "propio"],
  ];
  return sinonimos.find(([re]) => re.test(v))?.[1] ?? null;
}

/**
 * Tipologías a partir de texto libre ("2 ambientes, monoambiente", "tres
 * amb", "triplex"). Devuelve las reconocidas, sin repetir y en el orden del
 * catálogo.
 */
export function normalizarTipologias(raw: unknown): Tipologia[] {
  if (typeof raw !== "string") return [];
  const palabras: Record<string, number> = { un: 1, uno: 1, dos: 2, tres: 3, cuatro: 4 };
  const encontradas = new Set<Tipologia>();
  for (const parte of sinAcentos(raw).split(/[,;/]|\sy\s|\so\s/)) {
    const t = parte.trim();
    if (!t) continue;
    if (/tri ?plex/.test(t)) {
      encontradas.add("triplex");
      continue;
    }
    if (/mono ?ambiente/.test(t)) {
      encontradas.add("1_ambiente");
      continue;
    }
    const m = t.match(/(\d+|un|uno|dos|tres|cuatro)\s*(amb|ambiente|ambientes)\b/);
    if (!m) continue;
    const n = /^\d+$/.test(m[1]!) ? Number(m[1]) : palabras[m[1]!];
    if (n === 1) encontradas.add("1_ambiente");
    else if (n === 2) encontradas.add("2_ambientes");
    else if (n === 3) encontradas.add("3_ambientes");
    else if (n === 4) encontradas.add("4_ambientes");
  }
  return VALORES_TIPOLOGIA.filter((t): t is Tipologia =>
    encontradas.has(t as Tipologia)
  );
}

/**
 * Edificios a partir de texto libre: cada parte separada por coma se compara,
 * sin acentos, con el nombre y la dirección. Una parte puede ser solo la
 * calle ("Olazábal") o el número de calle ("Gallo 716").
 */
export function resolverEdificiosPorNombre<T extends { id: string; nombre: string; direccion: string | null }>(
  raw: unknown,
  edificios: readonly T[]
): T[] {
  if (typeof raw !== "string") return [];
  const elegidos = new Map<string, T>();
  for (const parte of raw.split(/[,;/]|\sy\s/)) {
    const p = sinAcentos(parte);
    if (p.length < 3) continue;
    for (const e of edificios) {
      const nombre = sinAcentos(e.nombre);
      const dir = sinAcentos(e.direccion ?? "");
      if (nombre.includes(p) || p.includes(nombre) || (dir && (dir.includes(p) || p.includes(dir)))) {
        elegidos.set(e.id, e);
      }
    }
  }
  return [...elegidos.values()];
}
