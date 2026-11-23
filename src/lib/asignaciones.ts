import { z } from "zod";
import { ASIGNAR_A_IA, destinoPorEdificio } from "@/lib/asignacion";

/**
 * Asignaciones (spec `claude/asignaciones.md`) — lo puro: la carga de cada
 * vendedor, quién recibe y con qué tecla, y la sugerencia de a quién darle
 * cada oportunidad. La parte con base vive en `server/asignaciones.ts`.
 */

/** Tope de carga: oportunidades abiertas por vendedor. Fijo por ahora (22/11), sin ajuste. */
export const TOPE_CARGA = 30;
/** Desde acá la carga es «alta» (ámbar) y desde acá «saturada» (rojo; no recibe sugerencias). */
export const CARGA_ALTA = 0.65;
export const CARGA_SATURADA = 0.85;
/** «Asignadas automáticamente»: las de las últimas 24 h (decidido 22/11). */
export const HORAS_AUTOMATICAS = 24;
/** Teclas 1–9: a lo sumo nueve carriles con número. */
export const MAX_TECLAS = 9;
/** Cuántas se asignan o se deshacen en una sola operación. */
export const MAX_LOTE = 300;

export type NivelCarga = "normal" | "alta" | "saturada";

export function cargaDe(abiertas: number, tope = TOPE_CARGA): { pct: number; nivel: NivelCarga } {
  const r = tope > 0 ? abiertas / tope : 1;
  return {
    pct: Math.round(r * 100),
    nivel: r >= CARGA_SATURADA ? "saturada" : r >= CARGA_ALTA ? "alta" : "normal",
  };
}

export const NOMBRE_NIVEL: Record<NivelCarga, string> = { normal: "normal", alta: "alta", saturada: "saturada" };

/* ------------------------------------------------------------------
 * Quién recibe
 * ------------------------------------------------------------------ */

export type ConfigVendedor = { userId: string; recibe: boolean };

export const configVendedoresSchema = z
  .array(z.object({ userId: z.string().min(1).max(60), recibe: z.boolean() }))
  .max(200);

export type Miembro = { userId: string; nombre: string; role: string };

/**
 * Los vendedores de la mesa, en orden. Lo guardado en Ajustes manda (orden y
 * quién recibe); quien no está ahí entra al final, por nombre, y recibe si su
 * rol es de vendedor (`member`). Sin ningún `member`, reciben todos.
 */
export function vendedoresDeLaMesa(
  miembros: readonly Miembro[],
  config: readonly ConfigVendedor[]
): (Miembro & { recibe: boolean; tecla: number | null })[] {
  const porId = new Map(miembros.map((m) => [m.userId, m]));
  const hayVendedores = miembros.some((m) => m.role === "member");
  const recibePorRol = (m: Miembro) => !hayVendedores || m.role === "member";
  const vistos = new Set<string>();
  const ordenados: (Miembro & { recibe: boolean })[] = [];
  for (const c of config) {
    const m = porId.get(c.userId);
    if (!m || vistos.has(m.userId)) continue;
    vistos.add(m.userId);
    ordenados.push({ ...m, recibe: c.recibe });
  }
  const resto = miembros
    .filter((m) => !vistos.has(m.userId))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
    .map((m) => ({ ...m, recibe: recibePorRol(m) }));
  let tecla = 0;
  return [...ordenados, ...resto].map((m) => ({
    ...m,
    tecla: m.recibe && tecla < MAX_TECLAS ? ++tecla : null,
  }));
}

/* ------------------------------------------------------------------
 * Sugerencia
 * ------------------------------------------------------------------ */

export type Sugerencia = { userId: string; nombre: string; porque: string; regla: "edificio" | "carga" };

type ParaSugerir = { id: string; edificioIds: readonly string[] };
type VendedorParaSugerir = { userId: string; nombre: string; abiertas: number };

/**
 * A quién darle cada oportunidad, en el orden dado (la más vieja primero):
 * 1) la regla por edificio de la asignación automática, si apunta a alguien
 *    que recibe; 2) si no, el de menos carga, salteando a los saturados.
 * Cada sugerencia suma una a la carga de quien la recibe, así «Aceptar todas»
 * reparte en vez de cargarle todo al mismo.
 */
export function sugerir(
  ops: readonly ParaSugerir[],
  vendedores: readonly VendedorParaSugerir[],
  porEdificio: Readonly<Record<string, string>>,
  nombreEdificio: (id: string) => string | null = () => null,
  tope = TOPE_CARGA
): Map<string, Sugerencia | null> {
  const carga = new Map(vendedores.map((v) => [v.userId, v.abiertas]));
  const porId = new Map(vendedores.map((v) => [v.userId, v]));
  const out = new Map<string, Sugerencia | null>();
  for (const op of ops) {
    let s: Sugerencia | null = null;
    // La regla: el primer edificio mapeado decide (igual que la automática).
    const conRegla = op.edificioIds.filter((e) => porEdificio[e] && porEdificio[e] !== ASIGNAR_A_IA);
    const destino = destinoPorEdificio(porEdificio, conRegla);
    const v = destino ? porId.get(destino) : undefined;
    if (v) {
      const edificio = conRegla.find((e) => porEdificio[e] === destino);
      const nombre = edificio ? nombreEdificio(edificio) : null;
      s = {
        userId: v.userId,
        nombre: v.nombre,
        regla: "edificio",
        porque: `${nombre ? `${nombre} → ` : ""}${v.nombre} (regla por edificio)`,
      };
    } else {
      let mejor: VendedorParaSugerir | null = null;
      for (const c of vendedores) {
        const n = carga.get(c.userId) ?? 0;
        if (cargaDe(n, tope).nivel === "saturada") continue;
        if (!mejor || n < (carga.get(mejor.userId) ?? 0)) mejor = c;
      }
      if (mejor) {
        s = { userId: mejor.userId, nombre: mejor.nombre, regla: "carga", porque: `${mejor.nombre} (el de menos carga)` };
      }
    }
    if (s) carga.set(s.userId, (carga.get(s.userId) ?? 0) + 1);
    out.set(op.id, s);
  }
  return out;
}

/* ------------------------------------------------------------------
 * Contratos
 * ------------------------------------------------------------------ */

export type EdificioCorto = { id: string; nombre: string; color: string | null };

export type TarjetaAsignacion = {
  id: string;
  nombre: string;
  tipo: string | null;
  edificio: EdificioCorto | null;
  origen: string | null;
  ambientes: number[];
  telefono: string | null;
  /** El último mensaje del cliente, en una línea. */
  ultimoMensaje: string | null;
  creadaAt: string;
  /** Minutos desde que entró. */
  esperaMin: number;
  sugerencia: Sugerencia | null;
};

export type TarjetaAutomatica = TarjetaAsignacion & {
  asignadaAt: string;
  /** A quién la mandó la regla. */
  auto: { userId: string | null; ia: boolean; nombre: string };
  /** Quién la lleva ahora; `corregida` si ya no es la de la regla. */
  actual: { userId: string | null; ia: boolean; nombre: string | null };
  corregida: boolean;
};

export type AsignadaHoy = { id: string; nombre: string; edificio: EdificioCorto | null; auto: boolean; at: string };

export type VendedorAsignacion = {
  userId: string;
  nombre: string;
  tecla: number | null;
  abiertas: number;
  sinContactar: number;
  visitasHoy: number;
  carga: { pct: number; nivel: NivelCarga };
  asignadasHoy: AsignadaHoy[];
};

export type AsignacionesDto = {
  sinAsignar: TarjetaAsignacion[];
  automaticas: TarjetaAutomatica[];
  vendedores: VendedorAsignacion[];
  edificios: EdificioCorto[];
  tope: number;
  resumen: { sinAsignar: number; masViejaMin: number | null; automaticasHoy: number };
};

/** Cómo estaba una oportunidad antes de un cambio: lo que hace falta para deshacerlo. */
export const anteriorSchema = z.object({
  userId: z.string().min(1).max(60).nullable(),
  ia: z.boolean(),
  asignadaPor: z.enum(["auto", "manual", "ia"]).nullable(),
  asignadaPorUserId: z.string().min(1).max(60).nullable(),
  desde: z.string().datetime().nullable(),
});
export type Anterior = z.infer<typeof anteriorSchema>;
export type Cambio = { id: string; anterior: Anterior };

export const asignarSchema = z.object({
  oportunidadIds: z.array(z.string().min(1).max(60)).min(1).max(MAX_LOTE),
  userId: z.string().min(1).max(60),
});

export const deshacerSchema = z.object({
  cambios: z.array(z.object({ id: z.string().min(1).max(60), anterior: anteriorSchema })).min(1).max(MAX_LOTE),
});

/* ------------------------------------------------------------------
 * Para la pantalla
 * ------------------------------------------------------------------ */

/** «hace 5 min», «hace 3 h», «hace 2 d». */
export function textoEspera(min: number): string {
  if (min < 1) return "recién";
  if (min < 60) return `hace ${Math.round(min)} min`;
  if (min < 60 * 24) return `hace ${Math.floor(min / 60)} h`;
  return `hace ${Math.floor(min / (60 * 24))} d`;
}

/** Gris, ámbar desde 45 min, rojo desde 2 h. */
export function tonoEspera(min: number): "normal" | "ambar" | "rojo" {
  if (min >= 120) return "rojo";
  if (min >= 45) return "ambar";
  return "normal";
}

export function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] ?? "") + (partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? "") : "")).toUpperCase() || "?";
}

/** Evento de ventana: la mesa asignó o deshizo algo (el menú relee su pastilla). */
export const EVENTO_ASIGNACIONES = "vocero:asignaciones";

/* ------------------------------------------------------------------
 * Teclado y selección (la mesa y el modo foco)
 * ------------------------------------------------------------------ */

export type AccionDeTecla =
  | { tipo: "vendedor"; tecla: number }
  | { tipo: "aceptar" }
  | { tipo: "saltar" }
  | { tipo: "deshacer" }
  | { tipo: "foco" }
  | { tipo: "soltar" };

/** Qué hace una tecla en Asignaciones. Con Ctrl, ⌘ o Alt no hace nada (son del navegador). */
export function accionDeTecla(e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean }): AccionDeTecla | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  if (/^[1-9]$/.test(e.key)) return { tipo: "vendedor", tecla: Number(e.key) };
  switch (e.key) {
    case "Enter":
    case "ArrowRight":
      return { tipo: "aceptar" };
    case "ArrowLeft":
      return { tipo: "saltar" };
    case "z":
    case "Z":
      return { tipo: "deshacer" };
    case "f":
    case "F":
      return { tipo: "foco" };
    case "Escape":
      return { tipo: "soltar" };
    default:
      return null;
  }
}

/** A qué tarjetas va una acción: las elegidas (en el orden de la lista) o, sin ninguna, la de arriba. */
export function objetivoDe<T extends { id: string }>(lista: readonly T[], elegidas: ReadonlySet<string>): T[] {
  const sel = lista.filter((t) => elegidas.has(t.id));
  if (sel.length) return sel;
  return lista[0] ? [lista[0]] : [];
}

/** Las tarjetas agrupadas por su vendedor sugerido (una operación por vendedor). */
export function agruparPorSugerencia(
  tarjetas: readonly Pick<TarjetaAsignacion, "id" | "sugerencia">[]
): { userId: string; nombre: string; ids: string[] }[] {
  const grupos = new Map<string, { userId: string; nombre: string; ids: string[] }>();
  for (const t of tarjetas) {
    if (!t.sugerencia) continue;
    const g = grupos.get(t.sugerencia.userId) ?? { userId: t.sugerencia.userId, nombre: t.sugerencia.nombre, ids: [] };
    g.ids.push(t.id);
    grupos.set(g.userId, g);
  }
  return [...grupos.values()];
}

/** El texto del aviso: «Carolina Méndez → Sebastián» o «3 → Sebastián». */
export function textoDeAviso(nombres: readonly string[], destinos: readonly string[]): string {
  const destino = destinos.length === 1 ? destinos[0]! : `${destinos.length} vendedores`;
  return nombres.length === 1 ? `${nombres[0]} → ${destino}` : `${nombres.length} → ${destino}`;
}

/** Modo foco: la fila en el orden de la lista, con las saltadas al final (en el orden en que se saltaron). */
export function ordenDeFoco<T extends { id: string }>(tarjetas: readonly T[], saltadas: readonly string[]): T[] {
  const s = new Set(saltadas);
  const porId = new Map(tarjetas.map((t) => [t.id, t]));
  return [...tarjetas.filter((t) => !s.has(t.id)), ...saltadas.flatMap((id) => (porId.has(id) ? [porId.get(id)!] : []))];
}
