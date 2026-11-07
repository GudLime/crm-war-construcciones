import { ConocimientoClient } from "@/components/agent/conocimiento-client";

export const dynamic = "force-dynamic";

/** Vista previa de lo que lee el agente (solo quien administra; lo controla la API). */
export default function ConocimientoPage() {
  return <ConocimientoClient />;
}
