/**
 * 071 — Self-test del vocabulario configurable: con un `CLIENTE_CONFIG` de
 * restaurante (Reserva, Confirmada → Asistió, Cancelada, No vino, sin lo
 * inmobiliario), la app real tiene que hablar de reservas en todas las
 * pantallas, no mostrar edificios ni tipo de contacto, y rechazar por API
 * una etapa o un motivo que no son de esta instancia.
 *
 * Uso: app corriendo con CLIENTE_CONFIG apuntando a un archivo como el de
 * `specs/071-reservas` y la BD migrada; luego
 *   APP_BASE_URL=http://localhost:3100 node scripts/e2e-vocabulario.mjs
 * Necesita Chrome (CHROME_PATH o /usr/bin/google-chrome). Sale con 1 si algo falla.
 */
import { chromium } from "playwright";

const BASE = process.env.APP_BASE_URL ?? "http://localhost:3000";
let fallas = 0;
const ok = (nombre, cond, detalle = "") => {
  console.log(`${cond ? "✓" : "✗"} ${nombre}${cond || !detalle ? "" : ` — ${detalle}`}`);
  if (!cond) fallas++;
};

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

try {
  // Registro (o login si ya existe la organización).
  const credenciales = { email: "dueno@beba.test", password: "prueba-prueba-123", name: "Dueño" };
  let r = await api("/api/auth/sign-up/email", { method: "POST", body: credenciales });
  if (!r.ok()) r = await api("/api/auth/sign-in/email", { method: "POST", body: credenciales });
  ok("registro o login", r.ok(), await r.text());

  // Un contacto y su reserva, por API (lo que después hará el flujo).
  const telefono = `549115${String(Date.now()).slice(-7)}`;
  r = await api("/api/contacts", { method: "POST", body: { name: "Lucía Pérez", phone: telefono } });
  const contacto = await r.json();
  ok("alta de contacto", r.ok(), JSON.stringify(contacto));
  const contactId = contacto.contact?.id ?? contacto.id;

  r = await api(`/api/contacts/${contactId}/oportunidad`, { method: "POST" });
  ok("se abre una reserva sin tipo de contacto (sin lo inmobiliario no hace falta Lead)", r.ok(), await r.text());
  const comercial = await r.json();
  const reservaId = comercial.abierta?.id;
  ok("la reserva nace Confirmada (recibido)", comercial.abierta?.estado === "recibido", JSON.stringify(comercial.abierta));

  // La API rechaza lo que esta instancia no usa.
  r = await api(`/api/oportunidades/${reservaId}/estado`, { method: "PATCH", body: { estado: "visito" } });
  ok("rechaza una etapa que no usa (Visitó)", r.status() === 422, `${r.status()} ${await r.text()}`);
  r = await api(`/api/oportunidades/${reservaId}/estado`, {
    method: "PATCH",
    body: { estado: "perdido", motivoCierre: "Busca más metros" },
  });
  ok("rechaza un motivo que no ofrece", r.status() === 422, `${r.status()} ${await r.text()}`);

  // Menú y lista.
  await pagina.goto("/oportunidades");
  await pagina.getByRole("heading", { name: "Reservas" }).first().waitFor({ timeout: 15000 });
  const menu = await pagina.locator("nav").first().innerText();
  ok("el menú dice Reservas", /Reservas/.test(menu), menu);
  ok("el menú no tiene Edificios ni Oportunidades", !/Edificios|Oportunidades/.test(menu), menu);
  // Con RESERVAS encendida la página abre en el salón (Mosaico): se pasa a la Lista.
  const lista0 = pagina.getByRole("tab", { name: "Lista" });
  if ((await lista0.getAttribute("aria-selected")) !== "true") await lista0.click();
  await pagina.getByText("Lucía Pérez").first().waitFor({ timeout: 15000 });
  const lista = await pagina.locator("main").innerText();
  ok("la lista tiene «Nueva reserva»", /Nueva reserva/.test(lista));
  ok("la lista muestra Confirmada", /Confirmada/.test(lista), lista.slice(0, 400));
  ok("la lista no tiene columnas inmobiliarias", !/Ambientes|Interés|Unidades/.test(lista));
  ok("sin cierre por silencio no hay pestaña «Para cerrar»", !/Para cerrar/.test(lista));

  // Página de la reserva: barra de avance Confirmada → Asistió y cierres propios.
  await pagina.goto(`/oportunidades/${reservaId}`);
  await pagina.getByRole("list", { name: "Avance" }).waitFor({ timeout: 15000 });
  const avance = await pagina.getByRole("list", { name: "Avance" }).innerText();
  ok("la barra de avance es Confirmada → Asistió → Cerrar", /Confirmada[\s\S]*Asistió[\s\S]*Cerrar/.test(avance), avance);
  ok("la barra no tiene etapas de la constructora", !/En charlas|Visitó|Reservó/.test(avance), avance);
  const encabezado = await pagina.locator("main").innerText();
  ok("la página no muestra Interés, Ambientes ni Tipo", !/\bInterés\b|\bAmbientes\b|\bTipo\b/.test(encabezado));
  ok("el historial habla de la reserva y de Confirmada", /Se abrió la reserva/.test(encabezado) && /Estado: Confirmada/.test(encabezado));

  await pagina.getByRole("button", { name: "Cerrar", exact: true }).click();
  const cierre = await pagina.locator("main").innerText();
  ok("el cierre ofrece Cancelada y No vino", /Cancelada/.test(cierre) && /No vino/.test(cierre));
  await pagina.getByRole("combobox").last().selectOption("Canceló la persona").catch(() => undefined);
  await pagina.getByRole("button", { name: "Cancelada" }).click();
  await pagina.getByText("Motivo: Canceló la persona").waitFor({ timeout: 10000 }).catch(() => undefined);
  r = await api(`/api/oportunidades/${reservaId}/detalle`);
  const det = await r.json();
  ok("cancelar desde la página la cierra como perdido", det.oportunidad?.estado === "perdido", JSON.stringify(det.oportunidad?.estado));

  // El panel del chat (en la ficha del contacto no hay tipo de contacto).
  await pagina.goto(`/contacts/${contactId}`);
  await pagina.waitForTimeout(1500);
  const ficha = await pagina.locator("main").innerText();
  ok("la ficha del contacto no habla de tipo de contacto", !/Sin clasificar|Tipo de contacto/.test(ficha));

  // Resultados: la sección se llama Reservas.
  await pagina.goto("/results");
  await pagina.waitForTimeout(2500);
  const resultados = await pagina.locator("main").innerText();
  ok("Resultados tiene la sección Reservas", /Reservas/.test(resultados));

  await pagina.goto("/oportunidades");
  await pagina.screenshot({ path: process.env.CAPTURA ?? "/tmp/reservas.png", fullPage: true });
} catch (err) {
  ok("sin excepciones", false, String(err?.stack ?? err));
} finally {
  await navegador.close();
}

console.log(fallas ? `\n${fallas} control(es) fallaron` : "\nTodo verde");
process.exit(fallas ? 1 : 0);
