/**
 * 071 — Self-test de reservas (fase 3): con `RESERVAS=on` y un `CLIENTE_CONFIG`
 * de restaurante, carga el cupo de Beba, llena un horario hasta que no queda
 * lugar, comprueba las reglas (mesa de 2 para 1 o 2 personas, 4 + 2 para 5 o 6,
 * derivar a más de 6, nada fuera de los 7 días) y maneja el día desde la
 * pantalla «Hoy»: Llegó, Cancelada (libera la mesa) y una reserva cargada a mano.
 *
 * Uso: app corriendo con RESERVAS=on y la BD migrada, sin reservas para mañana;
 *   APP_BASE_URL=http://localhost:3100 node scripts/e2e-reservas.mjs
 * Necesita Chrome (CHROME_PATH o /usr/bin/google-chrome). Sale con 1 si algo falla.
 */
import { chromium } from "playwright";

const BASE = process.env.APP_BASE_URL ?? "http://localhost:3000";
let fallas = 0;
const ok = (nombre, cond, detalle = "") => {
  console.log(`${cond ? "✓" : "✗"} ${nombre}${cond || !detalle ? "" : ` — ${detalle}`}`);
  if (!cond) fallas++;
};

/** La fecha de hoy en Buenos Aires, más `dias`. */
function fechaBA(dias) {
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
  const d = new Date(`${hoy}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
const MANANA = fechaBA(1);

const navegador = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome",
  args: ["--no-sandbox"],
});
const contexto = await navegador.newContext({ baseURL: BASE, locale: "es-AR" });
const pagina = await contexto.newPage();
const api = (ruta, init = {}) =>
  pagina.request.fetch(ruta, {
    method: init.method ?? "GET",
    headers: { "content-type": "application/json", origin: BASE },
    data: init.body,
  });
const reservar = (cuerpo) =>
  api("/api/reservas", { method: "POST", body: { fecha: MANANA, ...cuerpo } });

try {
  const credenciales = { email: "dueno@beba.test", password: "prueba-prueba-123", name: "Dueño" };
  let r = await api("/api/auth/sign-up/email", { method: "POST", body: credenciales });
  if (!r.ok()) r = await api("/api/auth/sign-in/email", { method: "POST", body: credenciales });
  ok("registro o login", r.ok(), await r.text());

  // La configuración de Beba: todos los días a las 12, 14 y 20.
  const horarios = [];
  for (let dia = 0; dia < 7; dia++) for (const hora of ["12:00", "14:00", "20:00"]) horarios.push({ diaSemana: dia, hora, activo: true });
  r = await api("/api/reservas/configuracion", {
    method: "PUT",
    body: {
      ajustes: {
        zonaHoraria: "America/Argentina/Buenos_Aires",
        anticipacionDias: 7,
        minutosAntes: 20,
        maxPersonas: 6,
        duracionMinutos: 120,
        enlaceCarta: null,
        direccion: null,
      },
      horarios,
      cupo: [
        { sector: "Salón", capacidad: 4, cantidad: 2 },
        { sector: "Salón", capacidad: 2, cantidad: 2 },
        { sector: "Semidescubierto", capacidad: 4, cantidad: 1 },
        { sector: "Semidescubierto", capacidad: 2, cantidad: 1 },
      ],
      cierres: [],
    },
  });
  const config = await r.json();
  ok("guarda la configuración", r.ok(), JSON.stringify(config));
  ok("21 horarios y 4 filas de mesas", config.horarios?.length === 21 && config.cupo?.length === 4);

  r = await api("/api/reservas/configuracion", {
    method: "PUT",
    body: { ...config, horarios: [...config.horarios, { diaSemana: 1, hora: "12:00", activo: true }] },
  });
  ok("rechaza un horario repetido", r.status() === 422, String(r.status()));

  r = await api(`/api/reservas/disponibilidad?personas=2&fecha=${MANANA}`);
  let disp = await r.json();
  ok(
    "mañana hay lugar en los tres horarios",
    r.ok() && disp.horarios?.length === 3 && disp.horarios.every((h) => h.hayLugar),
    JSON.stringify(disp)
  );
  r = await api(`/api/reservas/disponibilidad?personas=7&fecha=${MANANA}`);
  disp = await r.json();
  ok("con 7 personas pide derivar", disp.derivar === true, JSON.stringify(disp));

  // Tres parejas a las 20: se llevan las tres mesas de 2.
  const sello = String(Date.now()).slice(-6);
  const parejas = [];
  for (let i = 0; i < 3; i++) {
    r = await reservar({ nombre: `Pareja ${i + 1} ${sello}`, hora: "20:00", personas: 2 });
    const d = await r.json();
    parejas.push(d);
    ok(`pareja ${i + 1} a las 20 en mesa de 2`, r.ok() && d.reserva?.mesas?.[0]?.capacidad === 2, JSON.stringify(d));
  }
  r = await reservar({ nombre: `Pareja 4 ${sello}`, hora: "20:00", personas: 2 });
  ok("la cuarta pareja no entra (nunca ocupa una mesa de 4)", r.status() === 409, `${r.status()} ${await r.text()}`);

  r = await api(`/api/reservas/disponibilidad?personas=2&fecha=${MANANA}`);
  disp = await r.json();
  const a = (hora) => disp.horarios?.find((h) => h.hora === hora)?.hayLugar;
  ok("a las 20 ya no hay para 2, a las 12 sí", a("20:00") === false && a("12:00") === true, JSON.stringify(disp));

  r = await reservar({ nombre: `Grupo 6 ${sello}`, hora: "20:00", personas: 6 });
  ok("un grupo de 6 a las 20 no entra (no quedan mesas de 2)", r.status() === 409, String(r.status()));
  r = await reservar({ nombre: `Grupo 6 ${sello}`, hora: "14:00", personas: 6 });
  let d = await r.json();
  const caps = (d.reserva?.mesas ?? []).map((m) => m.capacidad).sort();
  ok("a las 14 el grupo de 6 junta una de 4 y una de 2", r.ok() && caps.join("+") === "2+4", JSON.stringify(d));

  r = await reservar({ nombre: `Grupo 7 ${sello}`, hora: "12:00", personas: 7 });
  ok("7 personas: lo atiende una persona", r.status() === 409 && (await r.text()).includes("derivar"));
  r = await api("/api/reservas", { method: "POST", body: { nombre: "Lejos", fecha: fechaBA(9), hora: "12:00", personas: 2 } });
  ok("a 9 días no se puede reservar", r.status() === 409, String(r.status()));

  // La pantalla «Hoy».
  await pagina.goto("/reservas");
  await pagina.getByRole("heading", { name: "Hoy", level: 2 }).waitFor();
  ok("el menú tiene «Hoy»", await pagina.getByRole("link", { name: "Hoy" }).first().isVisible());
  await pagina.getByRole("button", { name: "Día siguiente" }).click();
  const veinte = pagina.getByRole("region", { name: "Horario 20:00" });
  await veinte.getByText(`Pareja 1 ${sello}`).waitFor();
  ok("a las 20 figuran las tres parejas", (await veinte.getByText(sello).count()) === 3);
  ok("y no queda ninguna mesa de 2", await veinte.getByText("Mesas de 2: 0 libres de 3").isVisible());

  const fila = (nombre) => veinte.locator("li", { hasText: nombre });
  await fila(`Pareja 1 ${sello}`).getByRole("button", { name: "Llegó" }).click();
  await fila(`Pareja 1 ${sello}`).getByText("Llegó", { exact: true }).waitFor();
  ok("marca Llegó", true);

  await fila(`Pareja 2 ${sello}`).getByRole("button", { name: "Cancelar" }).click();
  await fila(`Pareja 2 ${sello}`).getByRole("button", { name: "Cancelada" }).click();
  await veinte.getByText("Mesas de 2: 1 libre de 3").waitFor();
  ok("cancelar libera la mesa (quien llegó la sigue ocupando)", true);

  // Una reserva por teléfono, cargada a mano en la mesa que se liberó.
  await pagina.getByRole("button", { name: "Nueva reserva" }).click();
  await pagina.getByLabel("A nombre de").fill(`Teléfono ${sello}`);
  await pagina.getByLabel("Teléfono (opcional)").fill("11 5555 0000");
  await pagina.getByRole("combobox", { name: "Horario" }).click();
  await pagina.getByRole("option", { name: "20:00" }).click();
  await pagina.getByRole("button", { name: "Guardar" }).click();
  await veinte.getByText(`Teléfono ${sello}`).waitFor();
  ok("la reserva cargada a mano aparece a las 20", await veinte.getByText("Mesas de 2: 0 libres de 3").isVisible());

  // El detalle de la reserva dice cuándo y para cuántos.
  await fila(`Pareja 3 ${sello}`).getByRole("link", { name: `Pareja 3 ${sello}` }).click();
  await pagina.getByText("· 2 personas · ", { exact: false }).first().waitFor();
  const cabecera = await pagina.locator("dl").first().innerText();
  ok("el detalle muestra fecha, hora y personas", /· 20:00\s*· 2 personas · \S/.test(cabecera), cabecera.slice(0, 120));

  // Ajustes → Reservas.
  await pagina.goto("/settings/reservas");
  await pagina.getByText("Horarios de reserva").waitFor();
  ok("Ajustes tiene la sección Reservas", await pagina.getByRole("link", { name: "Reservas" }).first().isVisible());
  ok("resume el cupo por horario", await pagina.getByText("Por horario: 6 mesas para 18 personas.").isVisible());
  ok("la grilla tiene los 21 horarios abiertos", (await pagina.locator("table").getByRole("button", { pressed: true }).count()) === 21);
} catch (err) {
  ok("sin excepciones", false, err instanceof Error ? err.message : String(err));
  await pagina.screenshot({ path: "/tmp/e2e-reservas.png", fullPage: true }).catch(() => {});
} finally {
  await navegador.close();
}

console.log(fallas ? `\n${fallas} falla(s)` : "\nTodo verde");
process.exit(fallas ? 1 : 0);
