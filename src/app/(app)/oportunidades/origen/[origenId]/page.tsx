import { notFound, redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { listarOrigenes } from "@/server/origenes";
import { OportunidadesClient } from "@/components/ventas/oportunidades-client";

export const dynamic = "force-dynamic";

/**
 * Subpágina de Oportunidades por origen: la misma página con el origen fijo.
 * Se puede compartir el link y el ítem de la barra lateral queda marcado.
 */
export default async function OportunidadesPorOrigenPage({ params }: { params: Promise<{ origenId: string }> }) {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  const { origenId } = await params;
  const origen = (await listarOrigenes(session.organizationId)).find((o) => o.id === origenId);
  if (!origen) notFound();
  return (
    <OportunidadesClient
      key={origen.id}
      origen={{ id: origen.id, nombre: origen.nombre, icono: origen.icono, imagen: origen.imagen }}
    />
  );
}
