import { soloAdminEnPagina } from "@/server/auth/solo-admin";
import { PipelineClient } from "@/components/pipeline/pipeline-client";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  await soloAdminEnPagina();
  return <PipelineClient />;
}
