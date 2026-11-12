import { soloAdminEnPagina } from "@/server/auth/solo-admin";
import { ConocimientoClient } from "@/components/agent/conocimiento-client";

export const dynamic = "force-dynamic";

/** Vista previa de lo que lee el agente (solo quien administra; lo controla la API). */
export default async function ConocimientoPage() {
  await soloAdminEnPagina();
  return <ConocimientoClient />;
}
