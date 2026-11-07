import { RegistroClient } from "@/components/motor/registro-client";

export const dynamic = "force-dynamic";

/** Motor — la página de un registro de cualquier objeto personalizado. */
export default async function RegistroPage({ params }: { params: Promise<{ objeto: string; id: string }> }) {
  const { objeto, id } = await params;
  return <RegistroClient key={`${objeto}/${id}`} clave={objeto} id={id} />;
}
