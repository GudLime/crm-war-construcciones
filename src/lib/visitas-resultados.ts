/**
 * Resultados — sección Visitas (spec `claude/resultados-rediseno.md` §4). Lo
 * puro: de las citas del período (cada una con su día en la zona del negocio
 * y la oportunidad de su contacto) arma los números, el mapa de calor (cuenta
 * las REALIZADAS, decidido 22/11), la serie por día, los gráficos chicos, qué
 * pasó después y la tabla.
 */

export type EstadoCita = "agendada" | "realizada" | "no_show" | "cancelada";

export type FilaVisita = {
  id: string;
  /** Instante (ISO) y día local AAAA-MM-DD. */
  at: string;
  dia: string;
  status: EstadoCita;
  source: "manual" | "ai";
  notas: string | null;
  oportunidad: {
    id: string;
    nombre: string;
    tipo: string | null;
    estado: string;
    responsable: string | null;
    edificio: string | null;
    color: string | null;
    unidad: string | null;
    ambientes: number[];
  } | null;
};

export type VisitasDto = {
  desde: string;
  hasta: string;
  agente: string;
  totales: { agendadas: number; realizadas: number; noVinieron: number; canceladas: number };
  calor: {
    /** Primer día que se muestra (un lunes) y último; más de 13 semanas se recorta a las últimas 13. */
    desde: string;
    hasta: string;
    recortado: boolean;
    dias: { dia: string; n: number; enPeriodo: boolean }[];
    porDiaSemana: number[]; // lunes = 0
    maximo: number;
    total: number;
  };
  serie: { dia: string; agendadas: number; realizadas: number }[];
  porEdificio: { nombre: string; color: string | null; n: number }[];
  quienAgendo: { ia: number; manual: number };
  despues: { reservo: number; abierta: number; perdida: number; total: number };
  tabla: {
    id: string;
    at: string;
    oportunidad: { id: string; nombre: string; tipo: string | null } | null;
    edificio: { nombre: string; color: string | null } | null;
    ambientes: number[];
    unidad: string | null;
    responsable: string | null;
    estado: string | null;
    comentario: string | null;
  }[];
  /** Cuántas oportunidades tuvieron una visita realizada en el período. */
  oportunidadesQueVisitaron: number;
};

export const SEMANAS_DEL_CALOR = 13;
const CERRADAS_GANADAS = new Set(["reservo", "compro"]);
const PERDIDAS = new Set(["perdido", "no_calificado"]);

function sumar(fecha: string, dias: number): string {
  const [a, m, d] = fecha.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

/** 0 = lunes … 6 = domingo. */
export function diaDeSemana(fecha: string): number {
  const [a, m, d] = fecha.split("-").map(Number) as [number, number, number];
  return (new Date(Date.UTC(a, m - 1, d)).getUTCDay() + 6) % 7;
}

function diasEntre(desde: string, hasta: string): string[] {
  const out: string[] = [];
  for (let d = desde; d <= hasta && out.length < 400; d = sumar(d, 1)) out.push(d);
  return out;
}

export function armarVisitas(filas: readonly FilaVisita[], desde: string, hasta: string, agente: string): VisitasDto {
  const realizadas = filas.filter((f) => f.status === "realizada");
  const totales = {
    agendadas: filas.length,
    realizadas: realizadas.length,
    noVinieron: filas.filter((f) => f.status === "no_show").length,
    canceladas: filas.filter((f) => f.status === "cancelada").length,
  };

  // Mapa de calor de las realizadas: semanas completas de lunes a domingo.
  const recortado = diasEntre(desde, hasta).length > SEMANAS_DEL_CALOR * 7;
  const inicioCalor = recortado ? sumar(hasta, -(SEMANAS_DEL_CALOR * 7 - 1)) : desde;
  const lunes = sumar(inicioCalor, -diaDeSemana(inicioCalor));
  const domingo = sumar(hasta, 6 - diaDeSemana(hasta));
  const porDia = new Map<string, number>();
  for (const f of realizadas) porDia.set(f.dia, (porDia.get(f.dia) ?? 0) + 1);
  const dias = diasEntre(lunes, domingo).map((dia) => ({
    dia,
    n: dia >= inicioCalor && dia <= hasta ? (porDia.get(dia) ?? 0) : 0,
    enPeriodo: dia >= inicioCalor && dia <= hasta,
  }));
  const porDiaSemana = [0, 0, 0, 0, 0, 0, 0];
  for (const f of realizadas) porDiaSemana[diaDeSemana(f.dia)]! += 1;

  const serieDias = diasEntre(desde, hasta);
  const ag = new Map<string, number>();
  for (const f of filas) if (f.status !== "cancelada") ag.set(f.dia, (ag.get(f.dia) ?? 0) + 1);
  const serie = serieDias.map((dia) => ({ dia, agendadas: ag.get(dia) ?? 0, realizadas: porDia.get(dia) ?? 0 }));

  const edif = new Map<string, { nombre: string; color: string | null; n: number }>();
  for (const f of realizadas) {
    const nombre = f.oportunidad?.edificio ?? "Sin edificio";
    const e = edif.get(nombre) ?? { nombre, color: f.oportunidad?.edificio ? f.oportunidad.color : null, n: 0 };
    e.n += 1;
    edif.set(nombre, e);
  }

  // Qué pasó después: estado ACTUAL de las oportunidades con una visita realizada.
  const ops = new Map<string, string>();
  for (const f of realizadas) if (f.oportunidad) ops.set(f.oportunidad.id, f.oportunidad.estado);
  const despues = { reservo: 0, abierta: 0, perdida: 0, total: ops.size };
  for (const estado of ops.values()) {
    if (CERRADAS_GANADAS.has(estado)) despues.reservo += 1;
    else if (PERDIDAS.has(estado)) despues.perdida += 1;
    else despues.abierta += 1;
  }

  const tabla = [...realizadas]
    .sort((a, b) => b.at.localeCompare(a.at))
    .map((f) => ({
      id: f.id,
      at: f.at,
      oportunidad: f.oportunidad ? { id: f.oportunidad.id, nombre: f.oportunidad.nombre, tipo: f.oportunidad.tipo } : null,
      edificio: f.oportunidad?.edificio ? { nombre: f.oportunidad.edificio, color: f.oportunidad.color } : null,
      ambientes: f.oportunidad?.ambientes ?? [],
      unidad: f.oportunidad?.unidad ?? null,
      responsable: f.oportunidad?.responsable ?? null,
      estado: f.oportunidad?.estado ?? null,
      comentario: f.notas?.trim() || null,
    }));

  return {
    desde,
    hasta,
    agente,
    totales,
    calor: {
      desde: lunes,
      hasta: domingo,
      recortado,
      dias,
      porDiaSemana,
      maximo: Math.max(0, ...dias.map((d) => d.n)),
      total: realizadas.length,
    },
    serie,
    porEdificio: [...edif.values()].sort((a, b) => b.n - a.n),
    quienAgendo: {
      ia: filas.filter((f) => f.source === "ai" && f.status !== "cancelada").length,
      manual: filas.filter((f) => f.source === "manual" && f.status !== "cancelada").length,
    },
    despues,
    tabla,
    oportunidadesQueVisitaron: ops.size,
  };
}

/** El tono del cuadradito (0 = vacío … 3 = el más fuerte). */
export function tonoDeCalor(n: number, maximo: number): 0 | 1 | 2 | 3 {
  if (n <= 0 || maximo <= 0) return 0;
  const r = n / maximo;
  if (r > 0.66) return 3;
  if (r > 0.33) return 2;
  return 1;
}

export const DIAS_SEMANA = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
