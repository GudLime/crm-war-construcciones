import { OportunidadesClient } from "@/components/ventas/oportunidades-client";
import { reservasEnabled } from "@/server/reservas/flag";

export const dynamic = "force-dynamic";

export default function OportunidadesPage() {
  return <OportunidadesClient reservas={reservasEnabled()} />;
}
