import { withAdmin } from "@/lib/api";
import { contarSinAsignar } from "@/server/asignaciones";

export const dynamic = "force-dynamic";

/** Cuántas abiertas siguen sin nadie a cargo (la pastilla del menú). */
export const GET = withAdmin(async (session) => {
  return Response.json({ sinAsignar: await contarSinAsignar(session.organizationId) });
});
