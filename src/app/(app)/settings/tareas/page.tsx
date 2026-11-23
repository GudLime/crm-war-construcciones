import { PlantillasTareasClient } from "@/components/settings/plantillas-tareas-client";

export const dynamic = "force-dynamic";

/** 0059 — Configuración → Plantillas de tareas (solo admin: el layout de Ajustes lo exige). */
export default function PlantillasTareasPage() {
  return <PlantillasTareasClient />;
}
