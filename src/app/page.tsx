import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { guideFirst } from "@/server/onboarding/guide";

export const dynamic = "force-dynamic";

/**
 * La raíz decide a dónde se entra (issue #86): mientras falte un paso de la
 * guía de inicio o el agente siga apagado, a `/onboarding`; con todo listo,
 * al Inicio del vendedor. Sin sesión, `/inicio` manda al login.
 */
export default async function Home() {
  const session = await getSessionOrNull();
  if (session && (await guideFirst(session))) redirect("/onboarding");
  redirect("/inicio");
}
