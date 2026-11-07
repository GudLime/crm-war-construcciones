import { ImportarNotionClient } from "@/components/settings/importar-notion-client";

export const dynamic = "force-dynamic";

/** War — Importación única de los datos de Notion (contactos, oportunidades, notas y tareas). */
export default function ImportarNotionPage() {
  return <ImportarNotionClient />;
}
