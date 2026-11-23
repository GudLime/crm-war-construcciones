import type { BloqueInicio, ConfigCliente, PantallaMenu } from "@/lib/motor/config";
import {
  CAMINO_OPORTUNIDAD,
  ESTADOS_ABIERTOS,
  ESTADOS_ABIERTOS_LISTA,
  ESTADOS_OPORTUNIDAD,
  MOTIVOS_CIERRE,
  type EstadoOportunidad,
} from "@/lib/ventas";

/**
 * 071 — El vocabulario de la oportunidad en esta instancia: cómo se llama,
 * qué etapas se ven y con qué nombre, qué motivos de cierre se ofrecen y si
 * lo inmobiliario existe.
 *
 * Las etapas siguen siendo las del núcleo: un restaurante llama «Confirmada»
 * a `recibido` y «Llegó» a `compro`. Así el historial, las estadísticas, las
 * reglas de etapa y el contrato con el cerebro no cambian; cambia lo que se
 * ve y lo que se puede elegir.
 *
 * Es puro y viaja al navegador: el servidor lo arma una vez desde
 * `CLIENTE_CONFIG` (`server/vocabulario.ts`) y lo baja por el layout.
 */
export type Vocabulario = {
  /** «Oportunidad», «Reserva». */
  singular: string;
  /** «Oportunidades», «Reservas». */
  plural: string;
  /** Título del grupo del menú. */
  grupoMenu: string;
  /** Las etapas que se ven, en orden, con su nombre en esta instancia. */
  estados: { value: EstadoOportunidad; label: string }[];
  /** El camino de la barra de avance y del Pipeline: las visibles, en el orden del núcleo. */
  camino: EstadoOportunidad[];
  /** Las que la lista cuenta como «Abiertas». */
  abiertosLista: EstadoOportunidad[];
  /** Las de cierre (las que no son abiertas), en el orden de `estados`. */
  cierres: EstadoOportunidad[];
  motivos: string[];
  /** El botón que abre el cierre en la barra de avance. */
  etiquetaCerrar: string;
  inmobiliario: boolean;
  cierrePorSinRespuesta: boolean;
  /** El menú de este cliente: orden de Trabajo, nombres y pantallas apagadas. */
  menu: {
    trabajo: PantallaMenu[] | null;
    nombres: Partial<Record<PantallaMenu, string>>;
    ocultas: PantallaMenu[];
  };
  /** Cambios 23/11 — Los bloques del Inicio; null = el de siempre. */
  inicio: { bloques: BloqueInicio[] | null };
};

export const VOCABULARIO_POR_DEFECTO: Vocabulario = {
  singular: "Oportunidad",
  plural: "Oportunidades",
  grupoMenu: "Ventas",
  estados: ESTADOS_OPORTUNIDAD.map((e) => ({ value: e.value, label: e.label })),
  camino: [...CAMINO_OPORTUNIDAD],
  abiertosLista: [...ESTADOS_ABIERTOS_LISTA],
  cierres: ESTADOS_OPORTUNIDAD.map((e) => e.value).filter((e) => !ESTADOS_ABIERTOS.includes(e)),
  motivos: [...MOTIVOS_CIERRE],
  etiquetaCerrar: "Perdida",
  inmobiliario: true,
  cierrePorSinRespuesta: true,
  menu: { trabajo: null, nombres: {}, ocultas: [] },
  inicio: { bloques: null },
};

/** Arma el vocabulario a partir del archivo del cliente. Sin archivo, el de siempre. */
export function vocabularioDe(
  config:
    | (Pick<ConfigCliente, "oportunidad" | "inmobiliario"> & Partial<Pick<ConfigCliente, "menu" | "inicio">>)
    | null
    | undefined
): Vocabulario {
  const inmobiliario = config?.inmobiliario ?? true;
  const menu = {
    trabajo: config?.menu?.trabajo ? [...new Set(config.menu.trabajo)] : null,
    nombres: { ...(config?.menu?.nombres ?? {}) },
    ocultas: [...new Set(config?.menu?.ocultar ?? [])] as PantallaMenu[],
  };
  const inicio = { bloques: config?.inicio?.bloques ? [...new Set(config.inicio.bloques)] : null };
  const o = config?.oportunidad;
  if (!o) return { ...VOCABULARIO_POR_DEFECTO, inmobiliario, menu, inicio };
  const estados = o.estados.map((e) => ({ value: e.estado, label: e.nombre }));
  const visibles = new Set(estados.map((e) => e.value));
  return {
    singular: o.nombre,
    plural: o.nombrePlural,
    grupoMenu: o.grupoMenu ?? VOCABULARIO_POR_DEFECTO.grupoMenu,
    estados,
    camino: CAMINO_OPORTUNIDAD.filter((e) => visibles.has(e)),
    abiertosLista: ESTADOS_ABIERTOS_LISTA.filter((e) => visibles.has(e)),
    cierres: estados.map((e) => e.value).filter((e) => !ESTADOS_ABIERTOS.includes(e)),
    motivos: o.motivosCierre ?? [...MOTIVOS_CIERRE],
    etiquetaCerrar: "Cerrar",
    inmobiliario,
    cierrePorSinRespuesta: o.cierrePorSinRespuesta,
    menu,
    inicio,
  };
}

/** ¿Esta pantalla está apagada en esta instancia? */
export function pantallaOculta(v: Vocabulario, p: PantallaMenu): boolean {
  return v.menu.ocultas.includes(p);
}

/** El nombre de una pantalla del menú en esta instancia. */
export function nombrePantalla(v: Vocabulario, p: PantallaMenu, porDefecto: string): string {
  return v.menu.nombres[p] ?? porDefecto;
}

const RUTA: Record<PantallaMenu, string> = {
  inicio: "/inicio",
  inbox: "/inbox",
  pipeline: "/pipeline",
  contacts: "/contacts",
  bookings: "/bookings",
  oportunidades: "/oportunidades",
  tareas: "/tareas",
  results: "/results",
};

/** A dónde se entra al abrir el CRM: Inicio, o sin Inicio la primera pantalla de Trabajo. */
export function rutaDeEntrada(v: Vocabulario): string {
  if (!pantallaOculta(v, "inicio")) return RUTA.inicio;
  const primera = (v.menu.trabajo ?? ["inbox"]).find((p) => !pantallaOculta(v, p) && p !== "bookings");
  return RUTA[primera ?? "inbox"];
}

/** El nombre de una etapa en esta instancia. Una oculta conserva el del núcleo. */
export function nombreEstado(v: Vocabulario, estado: string | null | undefined): string {
  if (!estado) return "—";
  return (
    v.estados.find((e) => e.value === estado)?.label ??
    ESTADOS_OPORTUNIDAD.find((e) => e.value === estado)?.label ??
    estado
  );
}

export function estadoVisible(v: Vocabulario, estado: string): boolean {
  return v.estados.some((e) => e.value === estado);
}

/** «oportunidad», «reserva»: para el medio de una frase. */
export function enFrase(palabra: string): string {
  return palabra.charAt(0).toLowerCase() + palabra.slice(1);
}

/**
 * Qué tiene de malo un cambio pedido por una persona: una etapa que esta
 * instancia no usa o un motivo que no ofrece. `null` si está bien. Lo que
 * escribe el sistema (el cierre por silencio, la reapertura) no pasa por acá.
 */
export function problemaDeVocabulario(
  v: Vocabulario,
  pedido: { estado?: string | null; motivoCierre?: string | null },
  /** Lo que ya tiene guardado: dejarlo como está nunca es un error. */
  actual?: { estado?: string | null; motivoCierre?: string | null }
): string | null {
  if (pedido.estado && pedido.estado !== actual?.estado && !estadoVisible(v, pedido.estado)) {
    return `«${pedido.estado}» no es una etapa de ${enFrase(v.plural)} en este CRM`;
  }
  if (
    pedido.motivoCierre &&
    pedido.motivoCierre !== actual?.motivoCierre &&
    !v.motivos.includes(pedido.motivoCierre)
  ) {
    return `«${pedido.motivoCierre}» no es un motivo de cierre de este CRM`;
  }
  return null;
}

/**
 * Todas las etapas del núcleo con el nombre de esta instancia: para MOSTRAR
 * una etapa (una oportunidad vieja puede estar en una que ya no se usa). Para
 * ELEGIR, `v.estados`.
 */
export function opcionesEstado(v: Vocabulario): { value: EstadoOportunidad; label: string }[] {
  return ESTADOS_OPORTUNIDAD.map((e) => ({ value: e.value, label: nombreEstado(v, e.value) }));
}

type GrupoConEtapas = {
  embudo: { estado: string; nombre: string; llegaron: number; avance: unknown }[];
  tiempos: { estado: string; nombre: string }[];
};

/**
 * Las estadísticas vienen con el camino del núcleo. Para esta instancia: solo
 * las etapas que usa, con su nombre, y el avance recalculado entre las que
 * quedan (de Confirmada a Llegó, sin las del medio).
 */
export function etapasDeLaInstancia<G extends GrupoConEtapas>(
  v: Vocabulario,
  grupo: G,
  avance: (llegaron: number, de: number) => G["embudo"][number]["avance"]
): G {
  const embudo = grupo.embudo.filter((e) => v.camino.includes(e.estado as EstadoOportunidad));
  return {
    ...grupo,
    embudo: embudo.map((e, i) => ({
      ...e,
      nombre: nombreEstado(v, e.estado),
      avance: i < embudo.length - 1 ? avance(embudo[i + 1]!.llegaron, e.llegaron) : null,
    })),
    tiempos: grupo.tiempos
      .filter((t) => v.camino.includes(t.estado as EstadoOportunidad))
      .map((t) => ({ ...t, nombre: nombreEstado(v, t.estado) })),
  };
}
