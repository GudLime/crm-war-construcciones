/**
 * 0059 — Tareas sugeridas por etapa: lo puro. Una lista FIJA de situaciones
 * (no es un editor de reglas) y, para cada oportunidad, qué plantillas se
 * sugieren, con su vencimiento, el porqué y el mensaje con las variables ya
 * reemplazadas. Nunca crea tareas: las elige el vendedor.
 */

export const SITUACIONES = [
  {
    clave: "sin_contacto",
    etapa: "recibido",
    nombre: "Sin primer contacto",
    ayuda: "Tiene responsable y todavía nadie le escribió.",
  },
  {
    clave: "al_asignar",
    etapa: "recibido",
    nombre: "Al asignarle responsable",
    ayuda: "No se sugiere: se crea sola cuando se le asigna una persona.",
  },
  {
    clave: "llamada_sin_atender",
    etapa: "recibido",
    nombre: "Llamada sin atender",
    ayuda: "La última llamada quedó «No atendió» y el cliente no escribió después.",
  },
  {
    clave: "no_contesta",
    etapa: "en_charlas",
    nombre: "No contesta",
    ayuda: "Le escribimos último y pasaron N días sin respuesta.",
  },
  {
    clave: "conoce",
    etapa: "conoce_informacion",
    nombre: "Conoce la información",
    ayuda: "Ya tiene la información y no hay una visita agendada.",
  },
  {
    clave: "visita_agendada",
    etapa: "conoce_informacion",
    nombre: "Visita agendada",
    ayuda: "Tiene una visita o reunión futura.",
  },
  { clave: "visito", etapa: "visito", nombre: "Visitó", ayuda: "Ya visitó (o su cita quedó realizada)." },
  { clave: "no_vino", etapa: "visito", nombre: "No vino a la visita", ayuda: "La última cita quedó como «no vino»." },
  { clave: "reservo", etapa: "reservo", nombre: "Reservó", ayuda: "Está en Reservó." },
  { clave: "compro", etapa: "compro", nombre: "Compró", ayuda: "Está en Compró." },
] as const;

export type Situacion = (typeof SITUACIONES)[number]["clave"];
export const VALORES_SITUACION = SITUACIONES.map((s) => s.clave) as unknown as readonly [Situacion, ...Situacion[]];

/** 'hoy' | 'manana' | '+N' | 'antes_visita' */
export const VENCIMIENTOS = [
  { value: "hoy", label: "Hoy" },
  { value: "manana", label: "Mañana" },
  { value: "+2", label: "+2 días" },
  { value: "+3", label: "+3 días" },
  { value: "+7", label: "+7 días" },
  { value: "+30", label: "+30 días" },
  { value: "antes_visita", label: "El día antes de la visita" },
] as const;

export const VARIABLES = ["nombre", "vendedor", "edificio", "unidad", "fecha_visita"] as const;

export type Plantilla = {
  id: string;
  nombre: string;
  tipo: string;
  situacion: string;
  diasSinRespuesta: number | null;
  vence: string;
  mensaje: string | null;
  activa: boolean;
  orden: number;
  /** 0061 — Solo para estos orígenes (vacío = todos). */
  origenes: string[];
};

export type Cita = { at: string; status: "agendada" | "realizada" | "no_show" | "cancelada" };

export type ContextoSugerencias = {
  /** Hoy en la zona del negocio (AAAA-MM-DD) y el instante actual. */
  hoy: string;
  ahora: string;
  oportunidad: {
    estado: string;
    responsableId: string | null;
    primerContactoAt: string | null;
    /** 0061 — Por dónde llegó (para las plantillas con orígenes). */
    origen?: string | null;
  };
  /** 0061 — La última llamada ya marcada (atendida o no) y cuándo se marcó. */
  ultimaLlamada?: { estado: "listo" | "no_responde"; at: string } | null;
  datos: {
    nombre: string | null;
    vendedor: string | null;
    edificio: string | null;
    unidad: string | null;
  };
  ultimoEntranteAt: string | null;
  ultimoSalienteAt: string | null;
  /** Citas del contacto (no canceladas), cualquier orden. */
  citas: Cita[];
  /** Plantillas con una tarea abierta creada desde ellas en esta oportunidad. */
  plantillasConTareaAbierta: readonly string[];
  /** Plantillas descartadas en esta oportunidad, con la etapa en que se descartó. */
  descartadas: readonly { plantillaId: string; estado: string }[];
  /** Para formatear «13/11 a las 11:00» en la zona del negocio. */
  formatearFecha?: (iso: string) => { dia: string; hora: string };
};

export type Sugerencia = {
  plantillaId: string;
  titulo: string;
  tipo: string;
  /** AAAA-MM-DD */
  vence: string;
  porque: string;
  mensaje: string | null;
};

const DIA = 86_400_000;

function sumarDias(fecha: string, dias: number): string {
  const [a, m, d] = fecha.split("-").map(Number) as [number, number, number];
  const x = new Date(Date.UTC(a, m - 1, d + dias));
  return x.toISOString().slice(0, 10);
}

const fechaPorDefecto = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return { dia: `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}`, hora: `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}` };
};

/** Reemplaza `{variable}`; si falta el dato queda vacío (nunca se ve una llave). */
export function completarMensaje(mensaje: string, valores: Partial<Record<(typeof VARIABLES)[number], string | null>>): string {
  return mensaje
    .replace(/\{(\w+)\}/g, (_, k: string) => (valores as Record<string, string | null | undefined>)[k] ?? "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ ([,.;:!?])/g, "$1")
    .trim();
}

/** El vencimiento de una plantilla, o null si no se puede calcular. */
export function vencimiento(vence: string, hoy: string, proximaVisita: string | null): string | null {
  if (vence === "hoy") return hoy;
  if (vence === "manana") return sumarDias(hoy, 1);
  if (vence === "antes_visita") {
    if (!proximaVisita) return null;
    const dia = sumarDias(proximaVisita.slice(0, 10), -1);
    return dia < hoy ? hoy : dia;
  }
  const m = /^\+(\d{1,3})$/.exec(vence);
  return m ? sumarDias(hoy, Number(m[1])) : null;
}

const ABIERTOS = ["recibido", "en_charlas", "conoce_informacion", "visito", "reservo"];

/**
 * Qué situaciones se cumplen hoy para esta oportunidad, con su porqué.
 * `no_contesta` depende de los días de cada plantilla, así que devuelve los
 * días sin respuesta y cada plantilla decide.
 */
function situaciones(ctx: ContextoSugerencias) {
  const ahora = Date.parse(ctx.ahora);
  const fmt = ctx.formatearFecha ?? fechaPorDefecto;
  const { estado, responsableId, primerContactoAt } = ctx.oportunidad;
  const futuras = ctx.citas
    .filter((c) => c.status === "agendada" && Date.parse(c.at) > ahora)
    .sort((a, b) => a.at.localeCompare(b.at));
  const pasadas = ctx.citas
    .filter((c) => c.status !== "cancelada" && Date.parse(c.at) <= ahora)
    .sort((a, b) => b.at.localeCompare(a.at));
  const ultima = pasadas[0] ?? null;
  const proxima = futuras[0] ?? null;

  const cumple = new Map<Situacion, string>();
  if (estado === "recibido" && responsableId && !primerContactoAt) {
    cumple.set("sin_contacto", "Todavía no tuvo primer contacto");
  }
  let diasSinRespuesta: number | null = null;
  if (estado === "en_charlas" && ctx.ultimoSalienteAt) {
    const salio = Date.parse(ctx.ultimoSalienteAt);
    const entro = ctx.ultimoEntranteAt ? Date.parse(ctx.ultimoEntranteAt) : 0;
    if (salio > entro) diasSinRespuesta = Math.floor((ahora - salio) / DIA);
  }
  // 0061 — La última llamada no la atendió y el cliente no escribió después.
  const llamada = ctx.ultimaLlamada;
  if (
    llamada?.estado === "no_responde" &&
    ["recibido", "en_charlas"].includes(estado) &&
    (!ctx.ultimoEntranteAt || Date.parse(ctx.ultimoEntranteAt) < Date.parse(llamada.at))
  ) {
    cumple.set("llamada_sin_atender", `Lo llamamos el ${fmt(llamada.at).dia} a las ${fmt(llamada.at).hora} y no atendió`);
  }
  if (estado === "conoce_informacion" && !proxima) cumple.set("conoce", "Ya conoce la información y no tiene visita agendada");
  if (proxima && ABIERTOS.includes(estado)) {
    const f = fmt(proxima.at);
    cumple.set("visita_agendada", `Tiene una visita el ${f.dia} a las ${f.hora} · se confirma el día anterior`);
  }
  if (estado === "visito" || (ultima?.status === "realizada" && ["conoce_informacion", "visito"].includes(estado))) {
    cumple.set("visito", ultima?.status === "realizada" ? `Visitó el ${fmt(ultima.at).dia}` : "Ya visitó");
  }
  if (ultima?.status === "no_show" && ABIERTOS.includes(estado) && estado !== "reservo") {
    cumple.set("no_vino", `No vino a la visita del ${fmt(ultima.at).dia}`);
  }
  if (estado === "reservo") cumple.set("reservo", "Reservó: falta coordinar el boleto");
  if (estado === "compro") cumple.set("compro", "Compró");
  return { cumple, diasSinRespuesta, proxima };
}

/** 0061 — Una plantilla con orígenes solo aplica a las oportunidades que llegaron por alguno. */
export function aplicaAlOrigen(p: Pick<Plantilla, "origenes">, origen: string | null): boolean {
  if (!p.origenes?.length) return true;
  const plano = (x: string) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  return Boolean(origen) && p.origenes.some((o) => plano(o) === plano(origen!));
}

/** Hasta 3 sugerencias, en el orden de las plantillas. */
export function sugerencias(plantillas: readonly Plantilla[], ctx: ContextoSugerencias, maximo = 3): Sugerencia[] {
  const { cumple, diasSinRespuesta, proxima } = situaciones(ctx);
  const fmt = ctx.formatearFecha ?? fechaPorDefecto;
  const valores = {
    nombre: ctx.datos.nombre?.trim().split(/\s+/)[0] ?? null,
    vendedor: ctx.datos.vendedor?.trim().split(/\s+/)[0] ?? null,
    edificio: ctx.datos.edificio,
    unidad: ctx.datos.unidad,
    fecha_visita: proxima ? `${fmt(proxima.at).dia} a las ${fmt(proxima.at).hora}` : null,
  };
  const descartadas = new Set(
    ctx.descartadas.filter((d) => d.estado === ctx.oportunidad.estado).map((d) => d.plantillaId)
  );
  const abiertas = new Set(ctx.plantillasConTareaAbierta);
  const salida: Sugerencia[] = [];
  for (const p of [...plantillas].sort((a, b) => a.orden - b.orden)) {
    if (!p.activa || descartadas.has(p.id) || abiertas.has(p.id)) continue;
    // Las «al asignar» se crean solas, nunca se sugieren.
    if (p.situacion === "al_asignar") continue;
    if (!aplicaAlOrigen(p, ctx.oportunidad.origen ?? null)) continue;
    let porque: string | undefined;
    if (p.situacion === "no_contesta") {
      const n = p.diasSinRespuesta ?? 3;
      if (diasSinRespuesta == null || diasSinRespuesta < n) continue;
      porque = `No contesta: le escribimos hace ${diasSinRespuesta} ${diasSinRespuesta === 1 ? "día" : "días"} y no respondió`;
    } else {
      porque = cumple.get(p.situacion as Situacion);
      if (!porque) continue;
    }
    const vence = vencimiento(p.vence, ctx.hoy, proxima?.at ?? null);
    if (!vence) continue;
    salida.push({
      plantillaId: p.id,
      titulo: p.nombre,
      tipo: p.tipo,
      vence,
      porque,
      mensaje: p.mensaje ? completarMensaje(p.mensaje, valores) || null : null,
    });
    if (salida.length >= maximo) break;
  }
  return salida;
}

/** Las plantillas con las que arranca cada organización. */
export const PLANTILLAS_DE_FABRICA: Omit<Plantilla, "id">[] = [
  {
    nombre: "Primer contacto por WhatsApp",
    tipo: "mensaje",
    situacion: "sin_contacto",
    diasSinRespuesta: null,
    vence: "hoy",
    mensaje: "Hola {nombre}, soy {vendedor}. Te escribo por tu consulta sobre {edificio}. ¿Cuándo te queda cómodo que hablemos?",
    activa: true,
    orden: 10,
    origenes: [],
  },
  {
    nombre: "Llamar",
    tipo: "llamada",
    situacion: "no_contesta",
    diasSinRespuesta: 3,
    vence: "hoy",
    mensaje: null,
    activa: true,
    orden: 20,
    origenes: [],
  },
  {
    nombre: "Último intento por WhatsApp",
    tipo: "mensaje",
    situacion: "no_contesta",
    diasSinRespuesta: 5,
    vence: "+2",
    mensaje: "Hola {nombre}, ¿pudiste ver la información de {edificio}? Si querés lo charlamos o coordinamos una visita.",
    activa: true,
    orden: 30,
    origenes: [],
  },
  {
    nombre: "Invitar a visitar",
    tipo: "mensaje",
    situacion: "conoce",
    diasSinRespuesta: null,
    vence: "manana",
    mensaje: "Hola {nombre}, ¿te gustaría conocer {edificio} en persona? Te propongo un par de horarios esta semana.",
    activa: true,
    orden: 40,
    origenes: [],
  },
  {
    nombre: "Confirmar visita",
    tipo: "mensaje",
    situacion: "visita_agendada",
    diasSinRespuesta: null,
    vence: "antes_visita",
    mensaje: "Hola {nombre}, te confirmo la visita a {edificio} el {fecha_visita}. ¡Te esperamos!",
    activa: true,
    orden: 50,
    origenes: [],
  },
  {
    nombre: "Follow-up post visita",
    tipo: "llamada",
    situacion: "visito",
    diasSinRespuesta: null,
    vence: "manana",
    mensaje: null,
    activa: true,
    orden: 60,
    origenes: [],
  },
  {
    nombre: "Enviar propuesta o plan de pagos",
    tipo: "correo",
    situacion: "visito",
    diasSinRespuesta: null,
    vence: "+2",
    mensaje: null,
    activa: true,
    orden: 70,
    origenes: [],
  },
  {
    nombre: "Reprogramar visita",
    tipo: "mensaje",
    situacion: "no_vino",
    diasSinRespuesta: null,
    vence: "hoy",
    mensaje: "Hola {nombre}, te esperábamos en {edificio}. ¿Querés que reprogramemos la visita?",
    activa: true,
    orden: 80,
    origenes: [],
  },
  {
    nombre: "Coordinar firma del boleto",
    tipo: "llamada",
    situacion: "reservo",
    diasSinRespuesta: null,
    vence: "+3",
    mensaje: null,
    activa: true,
    orden: 90,
    origenes: [],
  },
  {
    nombre: "Pedir referidos",
    tipo: "mensaje",
    situacion: "compro",
    diasSinRespuesta: null,
    vence: "+30",
    mensaje: "Hola {nombre}, ¿cómo va todo? Si conocés a alguien que esté buscando, nos encantaría ayudarlo.",
    activa: false,
    orden: 100,
    origenes: [],
  },
];

/** 0061 — De fábrica también para las organizaciones que ya tenían sus plantillas (la siembra la migración). */
export const PLANTILLA_LLAMADA_SIN_ATENDER: Omit<Plantilla, "id"> = {
  nombre: "Avisar que lo llamamos",
  tipo: "mensaje",
  situacion: "llamada_sin_atender",
  diasSinRespuesta: null,
  vence: "hoy",
  mensaje: "Hola {nombre}, soy {vendedor}. Te llamamos recién y no pudimos hablar. Cuando puedas, contame por acá qué estás buscando.",
  activa: true,
  orden: 15,
  origenes: [],
};
