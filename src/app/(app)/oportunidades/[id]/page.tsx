import { agendaEnabled } from "@/server/agenda/flag";
import { OportunidadDetalleClient } from "@/components/ventas/oportunidad-detalle-client";

export const dynamic = "force-dynamic";

/** La página de una oportunidad. Con la Agenda, «Reunión» agenda una cita. */
export default function OportunidadPage() {
  return <OportunidadDetalleClient agenda={agendaEnabled()} />;
}
