import { soloAdminEnPagina } from "@/server/auth/solo-admin";
import { AgentClient } from "@/components/agent/agent-client";

export const dynamic = "force-dynamic";

export default async function AgentPage() {
  await soloAdminEnPagina();
  return <AgentClient />;
}
