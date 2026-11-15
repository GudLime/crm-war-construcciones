import { redirect } from "next/navigation";
import { InicioClient } from "@/components/inicio/inicio-client";
import { rutaDeEntrada } from "@/lib/vocabulario";
import { vocabulario } from "@/server/vocabulario";

export const dynamic = "force-dynamic";

/** Inicio del vendedor: la primera pantalla al entrar. Qué hay que atender hoy. */
export default async function InicioPage() {
  // 071 — Un cliente sin Inicio entra directo a su primera pantalla de Trabajo.
  const voc = await vocabulario();
  if (voc.menu.ocultas.includes("inicio")) redirect(rutaDeEntrada(voc));
  return <InicioClient />;
}
