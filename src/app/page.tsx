import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { rutaDeEntrada } from "@/lib/vocabulario";
import { guideFirst } from "@/server/onboarding/guide";
import { vocabulario } from "@/server/vocabulario";

export const dynamic = "force-dynamic";

/**
 * La raíz decide a dónde se entra (issue #86): mientras falte un paso de la
 * guía de inicio o el agente siga apagado, a `/onboarding`; con todo listo,
 * al Inicio del vendedor. Un cliente que apagó Inicio (071) entra siempre a
 * la primera pantalla de su Trabajo. Sin sesión, esa página manda al login.
 */
export default async function Home() {
  const voc = await vocabulario();
  // 071 — Un cliente que eligió su pantalla de entrada entra ahí siempre; la
  // guía sigue en el menú (Agente → Guía de inicio).
  const entradaPropia = voc.menu.ocultas.includes("inicio");
  const session = entradaPropia ? null : await getSessionOrNull();
  if (session && (await guideFirst(session))) redirect("/onboarding");
  redirect(rutaDeEntrada(voc));
}
