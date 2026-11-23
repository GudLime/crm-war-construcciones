import { notFound } from "next/navigation";
import { TareasClient } from "@/components/ventas/tareas-client";
import { pantallaApagada } from "@/server/vocabulario";

export const dynamic = "force-dynamic";

export default async function TareasPage() {
  // 071 — Un cliente sin tareas (el seguimiento es con notas) no tiene esta página.
  if (await pantallaApagada("tareas")) notFound();
  return <TareasClient />;
}
