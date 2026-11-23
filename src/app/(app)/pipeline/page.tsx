import { notFound } from "next/navigation";
import { soloAdminEnPagina } from "@/server/auth/solo-admin";
import { PipelineClient } from "@/components/pipeline/pipeline-client";
import { pantallaApagada } from "@/server/vocabulario";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  // 071 — Un cliente puede apagar el Pipeline de leads desde su configuración.
  if (await pantallaApagada("pipeline")) notFound();
  await soloAdminEnPagina();
  return <PipelineClient />;
}
