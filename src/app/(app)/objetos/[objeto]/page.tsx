import { ObjetoListaClient } from "@/components/motor/objeto-lista-client";

export const dynamic = "force-dynamic";

/** Motor — la lista de cualquier objeto personalizado del cliente. */
export default async function ObjetoPage({ params }: { params: Promise<{ objeto: string }> }) {
  const { objeto } = await params;
  return <ObjetoListaClient key={objeto} clave={objeto} />;
}
