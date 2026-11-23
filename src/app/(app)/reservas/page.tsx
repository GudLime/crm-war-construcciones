import { notFound, redirect } from "next/navigation";
import { reservasEnabled } from "@/server/reservas/flag";

export const dynamic = "force-dynamic";

/** 071 — «Hoy» pasó a ser la vista Mosaico de Reservas; queda la dirección vieja. */
export default function ReservasPage() {
  if (!reservasEnabled()) notFound();
  redirect("/oportunidades");
}
