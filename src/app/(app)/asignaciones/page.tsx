import { notFound } from "next/navigation";
import { AsignacionesClient } from "@/components/asignaciones/asignaciones-client";
import { getSessionOrNull } from "@/lib/auth/session";
import { esAdmin } from "@/lib/auth/roles";
import { pantallaApagada } from "@/server/vocabulario";

export const dynamic = "force-dynamic";

/** Asignaciones — la mesa de reparto. Solo el admin: para el operador no existe (404). */
export default async function AsignacionesPage() {
  const session = await getSessionOrNull();
  if (!session || !esAdmin(session.role)) notFound();
  // Sin Tareas (071) no hay mesa, igual que en el menú.
  if (await pantallaApagada("tareas")) notFound();
  return <AsignacionesClient />;
}
