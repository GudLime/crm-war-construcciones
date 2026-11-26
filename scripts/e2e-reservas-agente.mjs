/**
 * 071 — Self-test del agente reservando con el módulo de Reservas (fase 4).
 *
 * Hace de cerebro (Nea) contra la app real: lee el perfil y el conocimiento,
 * escribe la ficha, consulta horarios y reserva por `/api/bot/*`, con el
 * contrato de siempre. Cubre el camino feliz y los infelices: sin personas en
 * la ficha, más personas que el tope, día cerrado, horario no ofrecido,
 * horario que se llenó entre la oferta y la reserva (re-oferta), mover una
 * reserva y una conversación del Laboratorio que no ocupa cupo.
 *
 * Uso: app corriendo con RESERVAS=on, BOT_API_KEY y un CLIENTE_CONFIG de
 * restaurante (inmobiliario: false), la BD migrada:
 *   node --env-file=.env scripts/e2e-reservas-agente.mjs
 * Sale con 1 si algo falla. Borra lo que crea.
 */
import postgres from "postgres";

const BASE = process.env.APP_BASE_URL ?? "http://localhost:3000";
const BOT_KEY = process.env.BOT_API_KEY;
const ZONA = "America/Argentina/Buenos_Aires";
let fallas = 0;
const ok = (nombre, cond, detalle = "") => {
  console.log(`${cond ? "✓" : "✗"} ${nombre}${cond || !detalle ? "" : ` — ${detalle}`}`);
  if (!cond) fallas++;
};
if (!BOT_KEY || !process.env.DATABASE_URL) {
  console.log("✗ faltan BOT_API_KEY o DATABASE_URL en el entorno");
  process.exit(1);
}

function fechaBA(dias) {
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(new Date());
  const d = new Date(`${hoy}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
const DIA = fechaBA(3);
const CERRADO = fechaBA(4);
/** 20:00 en Buenos Aires (UTC-3) es 23:00 UTC. */
const utc = (fecha, hora) => {
  const [h, m] = hora.split(":").map(Number);
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCHours(h + 3, m);
  return d.toISOString();
};
const mismoInstante = (a, b) => Date.parse(a) === Date.parse(b);

let cookie = "";
async function api(ruta, { method = "GET", body } = {}) {
  const res = await fetch(`${BASE}${ruta}`, {
    method,
    headers: { "content-type": "application/json", origin: BASE, ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const set = res.headers.getSetCookie?.() ?? [];
  if (set.length) cookie = set.map((c) => c.split(";")[0]).join("; ");
  return { status: res.status, json: await res.json().catch(() => null) };
}
/** Lo que hace el cerebro: con la llave, sin sesión. */
async function bot(ruta, { method = "GET", body } = {}) {
  const res = await fetch(`${BASE}${ruta}`, {
    method,
    headers: { "content-type": "application/json", "x-api-key": BOT_KEY },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}
const huecos = (conv, extra = "") => bot(`/api/bot/availability?conversationId=${conv}${extra}`);
const reservar = (conv, startUtc, notes) =>
  bot("/api/bot/bookings", { method: "POST", body: { conversationId: conv, startUtc, ...(notes ? { notes } : {}) } });
const ficha = (conv, f) => bot("/api/bot/ficha", { method: "PUT", body: { conversationId: conv, ficha: f } });

const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
const sufijo = Math.random().toString(36).slice(2, 8);
const creados = { contactos: [], conversaciones: [] };

try {
  // El cerebro habla con la organización de la instancia: la primera.
  const [{ id: org }] = await sql`select id from organization limit 1`;
  const [duenio] = await sql`
    select u.email from member m join "user" u on u.id = m.user_id
    where m.organization_id = ${org} order by m.created_at limit 1`;
  let r = await api("/api/auth/sign-in/email", {
    method: "POST",
    body: { email: duenio.email, password: "prueba-prueba-123" },
  });
  ok("login del dueño de la instancia", r.status === 200, JSON.stringify(r.json));

  // Ajustes → Reservas: todos los días a las 12, 14 y 20, un día cerrado.
  r = await api("/api/reservas/sectores");
  const previos = r.json?.sectores ?? [];
  const idDe = (nombre) => previos.find((x) => x.nombre === nombre)?.id ?? null;
  await api("/api/reservas/sectores", {
    method: "PUT",
    body: { sectores: [{ id: idDe("Salón"), nombre: "Salón" }, { id: idDe("Semidescubierto"), nombre: "Semidescubierto" }] },
  });
  const horarios = [];
  for (let dia = 0; dia < 7; dia++) for (const hora of ["12:00", "14:00", "20:00"]) horarios.push({ diaSemana: dia, hora, activo: true });
  r = await api("/api/reservas/configuracion", {
    method: "PUT",
    body: {
      ajustes: {
        zonaHoraria: ZONA,
        anticipacionDias: 7,
        minutosAntes: 20,
        maxPersonas: 6,
        duracionMinutos: 120,
        enlaceCarta: "https://ejemplo.com/carta",
        direccion: "Gorriti 1234, Palermo",
        toleranciaMinutos: 15,
      },
      horarios,
      cupo: [
        { sector: "Salón", capacidad: 4, cantidad: 2 },
        { sector: "Salón", capacidad: 2, cantidad: 2 },
        { sector: "Semidescubierto", capacidad: 4, cantidad: 1 },
        { sector: "Semidescubierto", capacidad: 2, cantidad: 1 },
      ],
      cierres: [{ fecha: CERRADO, motivo: null }],
    },
  });
  ok("guarda Ajustes → Reservas con tolerancia", r.status === 200 && r.json?.ajustes?.toleranciaMinutos === 15, JSON.stringify(r.json));

  // Una conversación de WhatsApp y una del Laboratorio, sin ficha.
  const nueva = async (isTest) => {
    const contacto = `ct_e2eag${sufijo}${isTest ? "t" : "r"}`;
    const conv = `cv_e2eag${sufijo}${isTest ? "t" : "r"}`;
    await sql`insert into contact (id, organization_id, name, wa_identity)
      values (${contacto}, ${org}, ${`Agente ${sufijo}`}, ${`54911${Math.floor(1e7 + Math.random() * 9e7)}`})`;
    await sql`insert into conversation (id, organization_id, contact_id, is_test) values (${conv}, ${org}, ${contacto}, ${isTest})`;
    creados.contactos.push(contacto);
    creados.conversaciones.push(conv);
    return { contacto, conv };
  };
  const real = await nueva(false);
  const prueba = await nueva(true);

  // ── Lo que lee el agente ──────────────────────────────────────────────
  r = await bot("/api/bot/profile");
  if (r.status === 404) {
    ok("la instancia tiene perfil de agente", false, "sin perfil: créalo en la pantalla Agente");
  } else {
    const kb = r.json?.kb ?? "";
    const instr = r.json?.profile?.instructions ?? "";
    ok("el conocimiento trae los datos del restaurante", kb.includes("### Restaurante") && kb.includes("Dirección del restaurante: Gorriti 1234, Palermo"), kb.slice(-600));
    ok("…con horarios agrupados", kb.includes("Reservas del restaurante: todos los días a las 12:00, 14:00 y 20:00."));
    ok("…el día cerrado de la anticipación", /Días cerrados del restaurante \(próximos\): \S+ \d+ de \S+ de \d{4}/.test(kb));
    ok("…la tolerancia y la carta", kb.includes("se guarda la mesa 15 minutos") && kb.includes("Carta del restaurante: https://ejemplo.com/carta"));
    ok("las instrucciones piden personas en la ficha", instr.includes('clave "personas"'));
    ok("un restaurante no recibe las reglas inmobiliarias", !instr.includes("edificios_interes"));
  }

  // ── Consultar ─────────────────────────────────────────────────────────
  r = await bot("/api/bot/availability");
  ok("sonda sin conversación: 422 (hay agenda)", r.status === 422, String(r.status));

  r = await huecos(real.conv, `&date=${DIA}`);
  const veinte = r.json?.slots?.find((s) => s.time === "20:00");
  ok("sin personas en la ficha igual ofrece el día (para 2)", r.status === 200 && r.json?.query?.status === "available" && r.json?.slots?.length === 3, JSON.stringify(r.json));
  ok(
    "el hueco viene en UTC con la forma de la agenda",
    veinte && mismoInstante(veinte.startUtc, utc(DIA, "20:00")) &&
      Date.parse(veinte.endUtc) - Date.parse(veinte.startUtc) === 120 * 60_000 &&
      veinte.dayIso === DIA && typeof veinte.label === "string" && typeof veinte.dayLabel === "string",
    JSON.stringify(veinte)
  );

  r = await reservar(real.conv, veinte.startUtc);
  ok("sin personas no reserva: 409 derivar con el sobre anidado", r.status === 409 && r.json?.error?.code === "derivar" && Array.isArray(r.json?.slots), JSON.stringify(r.json));

  await ficha(real.conv, { personas: 9 });
  r = await huecos(real.conv, `&date=${DIA}`);
  ok("más que el tope: 409 derivar al consultar", r.status === 409 && r.json?.error?.code === "derivar", JSON.stringify(r.json));

  await ficha(real.conv, { personas: "4 personas", nombre: `Bot ${sufijo}` });
  r = await huecos(real.conv, "&perDay=2&days=3&limit=5");
  const reparto = r.json?.slots ?? [];
  const porDia = {};
  for (const s of reparto) porDia[s.dayIso] = (porDia[s.dayIso] ?? 0) + 1;
  ok(
    "reparto sin fecha: respeta limit, perDay y days",
    r.status === 200 && r.json?.query?.date === null && reparto.length > 0 && reparto.length <= 5 &&
      Object.values(porDia).every((n) => n <= 2) && Object.keys(porDia).every((d) => d <= fechaBA(2)),
    JSON.stringify(porDia)
  );

  r = await huecos(real.conv, `&date=${CERRADO}`);
  ok("día cerrado: sin huecos y status closed", r.status === 200 && r.json?.slots?.length === 0 && r.json?.query?.status === "closed", JSON.stringify(r.json?.query));
  r = await huecos(real.conv, `&date=${fechaBA(30)}`);
  ok("más allá de la anticipación: beyond_horizon", r.json?.query?.status === "beyond_horizon", JSON.stringify(r.json?.query));

  // ── Etapas: el lead nace en Recibido y la IA lo lleva a Conoce información ──
  r = await api(`/api/contacts/${real.contacto}/oportunidad`, { method: "POST", body: {} });
  const opPrevia = r.json?.abierta?.id;
  ok("el lead tiene su reserva en Recibido", r.status < 300 && r.json?.abierta?.estado === "recibido", JSON.stringify(r.json?.abierta));
  r = await bot("/api/bot/stage", { method: "POST", body: { conversationId: real.conv, stage: "En charlas" } });
  ok("la IA no puede usar una etapa que el restaurante no muestra", r.status === 409 || r.status === 422, `${r.status} ${JSON.stringify(r.json)}`);
  r = await bot("/api/bot/stage", { method: "POST", body: { conversationId: real.conv, stage: "Conoce información" } });
  ok("la IA la mueve a Conoce información", r.status === 200 && r.json?.changed === true, `${r.status} ${JSON.stringify(r.json)}`);

  // ── Reservar ──────────────────────────────────────────────────────────
  r = await huecos(real.conv, `&date=${DIA}`);
  const oferta = r.json?.slots ?? [];
  r = await reservar(real.conv, utc(DIA, "21:00"));
  ok("un horario que no se ofreció: 409 slot_not_offered", r.status === 409 && r.json?.error?.code === "slot_not_offered", JSON.stringify(r.json));

  r = await reservar(real.conv, oferta.find((s) => s.time === "20:00").startUtc, "Cumpleaños");
  ok("reserva lo ofrecido: 201", r.status === 201 && r.json?.bookingId && r.json?.linkPending === false && r.json?.label, JSON.stringify(r.json));
  let [fila] = await sql`
    select r.fecha::text as fecha, r.hora, r.personas, r.nombre, r.canal, r.observaciones, o.estado, o.id as op
    from reserva r join oportunidad o on o.id = r.oportunidad_id where r.id = ${r.json?.bookingId ?? ""}`;
  ok(
    "la reserva está en el salón con lo de la ficha",
    fila && fila.fecha === DIA && fila.hora === "20:00" && fila.personas === 4 && fila.nombre === `Bot ${sufijo}` &&
      fila.canal === "whatsapp" && fila.observaciones === "Cumpleaños" && fila.estado === "reservo",
    JSON.stringify(fila)
  );
  ok("se confirmó la reserva que ya tenía el lead, no otra", fila?.op === opPrevia, JSON.stringify({ fila: fila?.op, opPrevia }));

  // Ofrecido a las 14:00, y antes de reservar se llena desde el salón.
  r = await huecos(real.conv, `&date=${DIA}`);
  const catorce = r.json?.slots?.find((s) => s.time === "14:00");
  let llenas = 0;
  for (let i = 0; i < 10; i++) {
    const m = await api("/api/reservas", {
      method: "POST",
      body: { nombre: `Relleno ${sufijo}`, fecha: DIA, hora: "14:00", personas: 4 },
    });
    if (m.status !== 201 && m.status !== 200) break;
    creados.contactos.push(m.json?.contactId ?? m.json?.reserva?.contactId);
    llenas++;
  }
  r = await reservar(real.conv, catorce.startUtc);
  const frescos = r.json?.slots ?? [];
  ok(
    "se llenó entre la oferta y la reserva: 409 slot_taken con horarios nuevos",
    llenas > 0 && r.status === 409 && r.json?.error?.code === "slot_taken" && frescos.length > 0 &&
      frescos.every((s) => !mismoInstante(s.startUtc, catorce.startUtc)),
    JSON.stringify({ llenas, status: r.status, body: r.json })
  );
  const doce = frescos.find((s) => s.time === "12:00");
  r = await reservar(real.conv, doce?.startUtc ?? "");
  ok("reserva uno de los re-ofrecidos", r.status === 201, JSON.stringify(r.json));
  [fila] = await sql`select o.estado from reserva r join oportunidad o on o.id = r.oportunidad_id where r.id = ${r.json?.bookingId ?? ""}`;
  ok("una segunda reserva del mismo contacto nace Confirmada", fila?.estado === "reservo", JSON.stringify(fila));

  r = await bot("/api/bot/bookings", { method: "PATCH", body: { conversationId: real.conv, startUtc: veinte.startUtc } });
  ok("mover una reserva: 409 derivar", r.status === 409 && r.json?.error?.code === "derivar", JSON.stringify(r.json));

  // ── Laboratorio ───────────────────────────────────────────────────────
  await ficha(prueba.conv, { personas: 2 });
  r = await huecos(prueba.conv, `&date=${DIA}`);
  const dePrueba = r.json?.slots?.find((s) => s.time === "20:00");
  const [{ n: antes }] = await sql`select count(*)::int n from reserva where organization_id = ${org} and fecha = ${DIA}`;
  r = await reservar(prueba.conv, dePrueba?.startUtc ?? "");
  const [{ n: despues }] = await sql`select count(*)::int n from reserva where organization_id = ${org} and fecha = ${DIA}`;
  ok(
    "una conversación de prueba reserva simulado y no ocupa cupo",
    r.status === 201 && String(r.json?.bookingId).startsWith("prueba_") && antes === despues,
    JSON.stringify({ body: r.json, antes, despues })
  );
} catch (err) {
  ok("sin excepciones", false, err?.stack ?? String(err));
} finally {
  const contactos = creados.contactos.filter(Boolean);
  if (contactos.length) {
    const ops = await sql`delete from reserva where contact_id in ${sql(contactos)} returning oportunidad_id`;
    if (ops.length) await sql`delete from oportunidad where id in ${sql(ops.map((o) => o.oportunidad_id))}`;
    await sql`delete from oportunidad where contact_id in ${sql(contactos)}`;
  }
  if (creados.conversaciones.length) await sql`delete from conversation where id in ${sql(creados.conversaciones)}`;
  if (contactos.length) await sql`delete from contact where id in ${sql(contactos)}`.catch(() => {});
  await sql.end();
}

console.log(fallas ? `\n${fallas} falla(s)` : "\nTodo verde");
process.exit(fallas ? 1 : 0);
