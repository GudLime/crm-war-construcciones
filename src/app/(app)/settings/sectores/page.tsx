import { notFound } from "next/navigation";
import { SectoresClient } from "@/components/settings/sectores-client";
import { reservasEnabled } from "@/server/reservas/flag";

export const dynamic = "force-dynamic";

/** 071 — Configuración → Sectores. Sin la bandera de reservas, no existe. */
export default function SectoresPage() {
  if (!reservasEnabled()) notFound();
  return <SectoresClient />;
}
