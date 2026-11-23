import { notFound } from "next/navigation";
import { ReservasAjustesClient } from "@/components/settings/reservas-ajustes-client";
import { reservasEnabled } from "@/server/reservas/flag";

export const dynamic = "force-dynamic";

/** 071 — Configuración → Reservas. Sin la bandera, no existe. */
export default function ReservasSettingsPage() {
  if (!reservasEnabled()) notFound();
  return <ReservasAjustesClient />;
}
