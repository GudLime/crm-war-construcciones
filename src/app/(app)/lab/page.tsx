import { soloAdminEnPagina } from "@/server/auth/solo-admin";
import { LabClient } from "@/components/lab/lab-client";

export const dynamic = "force-dynamic";

export default async function LabPage() {
  await soloAdminEnPagina();
  return <LabClient />;
}
