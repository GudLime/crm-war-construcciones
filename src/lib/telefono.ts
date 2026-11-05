import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/max";

/**
 * War — UNA sola forma de escribir un teléfono en todo el CRM.
 *
 * Todo número que entra (alta manual, importación, leads de Make, portales)
 * pasa por aquí y se guarda en E.164 sin el `+`, que es lo que usa el resto
 * del código (`contact.phone` y `contact.wa_identity`). La lectura la hace
 * libphonenumber (la librería de Google), que entiende el 0, el 15, espacios,
 * guiones y números de otros países.
 *
 * Argentina: el celular en E.164 lleva el 9 (`+54 9 11 5119-1447` →
 * `5491151191447`), que es también el `wa_id` con el que WhatsApp reporta a
 * quien escribe. Así el contacto que crea un formulario y el mensaje que
 * llega después hablan del mismo número, sin traducciones.
 *
 * Meta y mucha gente escriben el celular sin el 9 (`+541151191447`). Como
 * el CRM trabaja con WhatsApp, un número argentino de 10 dígitos sin 9 se
 * toma como celular y se le agrega. (Un fijo cargado así quedaría con 9:
 * es el costo aceptado de que todos los celulares casen.)
 */

export const PAIS_POR_DEFECTO: CountryCode = "AR";

export type MotivoTelefono = "vacio" | "invalido" | "sin_codigo_pais";

export type TelefonoNormalizado =
  | { ok: true; telefono: string }
  | { ok: false; motivo: MotivoTelefono };

const AR = "54";

/** El número nacional argentino ya con el 9 de celular, o null si no cierra. */
function nacionalArgentino(nacional: string): string | null {
  if (nacional.length === 11 && nacional.startsWith("9")) return nacional;
  if (nacional.length === 10 && !nacional.startsWith("9")) return `9${nacional}`;
  return null;
}

function aE164(
  texto: string,
  pais: CountryCode | undefined
): string | null {
  // México: el 1 de móvil que todavía reporta WhatsApp (521…) no va en E.164,
  // igual que la identidad (`normalizeMx`).
  const limpio = texto.replace(/^\+521(\d{10})$/, "+52$1");
  const n = parsePhoneNumberFromString(limpio, pais ? { defaultCountry: pais } : undefined);
  if (!n) return null;
  if (n.countryCallingCode === AR) {
    const nacional = nacionalArgentino(String(n.nationalNumber));
    if (!nacional) return null;
    // Con el 9 puesto, tiene que ser un celular argentino real (código de
    // área existente y largo correcto). La metadata completa ("max") lo sabe.
    const celular = parsePhoneNumberFromString(`+${AR}${nacional}`);
    return celular?.isValid() ? `${AR}${nacional}` : null;
  }
  if (!n.isValid()) return null;
  return n.number.replace(/^\+/, "");
}

/**
 * Cualquier forma de escribir un teléfono → E.164 sin `+`.
 *
 * - Con `+` o `00` adelante, el país sale del número.
 * - Sin prefijo internacional, se lee primero como número del país por
 *   defecto (Argentina) y, si no cierra, como internacional sin `+`
 *   (`5491151191447`, `5215512345678`), que es como lo mandan Meta y muchos
 *   portales.
 * - `paisPorDefecto: null` exige el código de país.
 */
export function normalizarTelefono(
  raw: string | null | undefined,
  opciones: { paisPorDefecto?: CountryCode | null } = {}
): TelefonoNormalizado {
  const texto = (raw ?? "").trim();
  const digitos = texto.replace(/\D/g, "");
  if (!digitos) return { ok: false, motivo: "vacio" };
  if (digitos.length > 17) return { ok: false, motivo: "invalido" };

  const pais =
    opciones.paisPorDefecto === undefined ? PAIS_POR_DEFECTO : opciones.paisPorDefecto;

  const internacional = texto.startsWith("+")
    ? `+${digitos}`
    : digitos.startsWith("00")
      ? `+${digitos.slice(2)}`
      : null;
  if (internacional) {
    const e164 = aE164(internacional, undefined);
    return e164 ? { ok: true, telefono: e164 } : { ok: false, motivo: "invalido" };
  }

  // Empieza con el código de Argentina: así llegan los `wa_id` y los números
  // de Meta sin `+`. Ningún código de área argentino empieza con 54.
  if (digitos.startsWith(AR) && digitos.length >= 12) {
    const e164 = aE164(`+${digitos}`, undefined);
    if (e164) return { ok: true, telefono: e164 };
  }

  if (pais) {
    const nacional = aE164(texto, pais);
    if (nacional) return { ok: true, telefono: nacional };
  }

  // Internacional sin `+` (otro país). Solo con largo de número completo.
  if (digitos.length >= 11 && !digitos.startsWith("0")) {
    const e164 = aE164(`+${digitos}`, undefined);
    if (e164) return { ok: true, telefono: e164 };
  }

  return { ok: false, motivo: pais ? "invalido" : "sin_codigo_pais" };
}

export { formatearTelefono } from "@/lib/telefono-formato";

/** Mensaje para la persona que cargó el número. */
export function explicarMotivoTelefono(motivo: MotivoTelefono): string {
  switch (motivo) {
    case "vacio":
      return "Falta el teléfono";
    case "sin_codigo_pais":
      return "Falta el código de país";
    default:
      return "Ese teléfono no es válido: revisá el código de área y el número";
  }
}
