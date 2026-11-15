import { notFound } from "next/navigation";
import { ReservasDiaClient } from "@/components/reservas/reservas-dia-client";
import { reservasEnabled } from "@/server/reservas/flag";

export const dynamic = "force-dynamic";

/** 071 — «Hoy»: las reservas del día por horario. Sin la bandera, no existe. */
export default function ReservasPage() {
  if (!reservasEnabled()) notFound();
  return <ReservasDiaClient />;
}
