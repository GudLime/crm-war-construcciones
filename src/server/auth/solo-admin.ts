import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { esAdmin } from "@/lib/auth/roles";

/**
 * Visibilidad por rol — para las páginas que son solo del admin
 * (Configuración, Agente, Laboratorio, Pipeline): el operador vuelve a la
 * Bandeja. La API ya responde 403; esto evita una pantalla rota.
 */
export async function soloAdminEnPagina(): Promise<void> {
  const session = await getSessionOrNull();
  if (session && !esAdmin(session.role)) redirect("/inbox");
}
