/**
 * 071 — Self-test del vocabulario configurable: con un `CLIENTE_CONFIG` de
 * restaurante (Reserva: Recibido → Conoce información → Confirmada y un paso
 * de Cierre con Asistió, No vino y Canceló; sin lo inmobiliario; sin ficha en
 * el chat), la app real tiene que hablar de reservas en todas las
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
  const credenciales = { email: "dueno@resto.test", password: "prueba-prueba-123", name: "Dueño" };
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
  ok("la reserva nace en Recibido", comercial.abierta?.estado === "recibido", JSON.stringify(comercial.abierta));

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
  ok("la lista muestra Recibido", /Recibido/.test(lista), lista.slice(0, 400));
  ok("la lista no tiene columnas inmobiliarias", !/Ambientes|Interés|Unidades/.test(lista));
  ok("sin cierre por silencio no hay pestaña «Para cerrar»", !/Para cerrar/.test(lista));

  // Página de la reserva: Recibido → Conoce información → Confirmada → Cierre.
  await pagina.goto(`/oportunidades/${reservaId}`);
  await pagina.getByRole("list", { name: "Avance" }).waitFor({ timeout: 15000 });
  const avance = await pagina.getByRole("list", { name: "Avance" }).innerText();
  ok(
    "la barra de avance es Recibido → Conoce información → Confirmada → Cierre",
    /Recibido[\s\S]*Conoce información[\s\S]*Confirmada[\s\S]*Cierre/.test(avance) && !/Asistió/.test(avance),
    avance
  );
  ok("la barra no tiene etapas de la constructora", !/En charlas|Visitó|Reservó/.test(avance), avance);
  const encabezado = await pagina.locator("main").innerText();
  ok("la página no muestra Interés, Ambientes ni Tipo", !/\bInterés\b|\bAmbientes\b|\bTipo\b/.test(encabezado));
  ok("el historial habla de la reserva", /Se abrió la reserva/.test(encabezado));

  await pagina.getByRole("button", { name: "Cierre", exact: true }).click();
  const cierre = await pagina.locator("main").innerText();
  ok("el cierre ofrece Asistió, No vino y Canceló", /Asistió/.test(cierre) && /No vino/.test(cierre) && /Canceló/.test(cierre));
  await pagina.getByRole("combobox").last().selectOption("Canceló la persona").catch(() => undefined);
  await pagina.getByRole("button", { name: "Canceló", exact: true }).click();
  await pagina.getByText("Motivo: Canceló la persona").waitFor({ timeout: 10000 }).catch(() => undefined);
  r = await api(`/api/oportunidades/${reservaId}/detalle`);
  const det = await r.json();
  ok("cancelar desde la página la cierra como perdido", det.oportunidad?.estado === "perdido", JSON.stringify(det.oportunidad?.estado));

  // Cambios 25/11 — Un lead nuevo de WhatsApp nace con su reserva en Recibido
  // y el panel del chat no tiene ficha: la reserva cierra en el paso Cierre.
  // Necesita el wa-mock (WA_MOCK_ENABLED y META_GRAPH_BASE_URL al mock).
  const mock = await api("/api/dev/wa-mock/outbox");
  if (mock.status() === 404) {
    console.log("· sin wa-mock: se saltea el lead nuevo por WhatsApp");
  } else {
    const PN = "PN-E2E-RESTO";
    r = await api("/api/settings/whatsapp", {
      method: "PUT",
      body: { wabaId: "WABA-E2E-RESTO", phoneNumberId: PN, token: "tok-e2e" },
    });
    ok("conexión de WhatsApp de prueba", r.ok(), await r.text());
    const desde = `549115${String(Date.now() + 7).slice(-7)}`;
    r = await api("/api/dev/wa-mock/inbound", {
      method: "POST",
      body: { phoneNumberId: PN, from: desde, name: "Lead Sábado", text: "hola, ¿tienen lugar el sábado?", waMessageId: `wamid.resto.${desde}` },
    });
    ok("entra el mensaje del lead", r.ok(), await r.text());
    r = await api(`/api/contacts?q=${desde.slice(-7)}`);
    const lista = await r.json();
    const lead = (lista.contacts ?? lista.items ?? lista).find?.((c) => (c.phone ?? "").includes(desde.slice(-7)) || c.name === "Lead Sábado");
    r = await api(`/api/contacts/${lead?.id}/oportunidad`);
    const delLead = await r.json();
    ok("el lead nuevo nace con su reserva en Recibido", delLead.abierta?.estado === "recibido", JSON.stringify(delLead.abierta));

    // El panel del chat se ve completo en una pantalla de escritorio.
    await pagina.setViewportSize({ width: 1440, height: 900 });
    await pagina.goto("/inbox");
    await pagina.getByText("Lead Sábado").first().click();
    await pagina.getByRole("button", { name: "Cierre" }).first().waitFor({ timeout: 30000 });
    const panel = await pagina.locator("body").innerText();
    ok("el panel del chat no tiene ficha", !/\bFICHA\b|^Ficha$/m.test(panel), panel.slice(-800));
    ok("el panel del chat no muestra «Sin respuesta»", !/Sin respuesta ·/.test(panel));
    ok("la bandeja no muestra la etapa del embudo oculto", !/Entró al embudo/.test(panel) && !/^Nuevo$/m.test(panel), panel.slice(0, 600));
    ok("el camino del panel es Recibido → Conoce información → Confirmada", /Recibido[\s\S]*Conoce información[\s\S]*Confirmada[\s\S]*Cierre/.test(panel));
    await pagina.getByRole("button", { name: "Cierre" }).last().click();
    const abierto = await pagina.locator("body").innerText();
    ok("Cierre abre Asistió, No vino y Canceló", /Asistió/.test(abierto) && /No vino/.test(abierto) && /Canceló/.test(abierto));
  }

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
