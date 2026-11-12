import { asc, eq } from "drizzle-orm";
import { apiError, withAdmin } from "@/lib/api";
import { canConfigure } from "@/lib/auth/roles";
import { getDb, schema } from "@/lib/db";
import { renderKb } from "@/server/ai/prompts";
import { conocimientoDelAgente } from "@/server/bot/conocimiento";
import { cargarMotor } from "@/server/motor/metadatos";

export const dynamic = "force-dynamic";

/**
 * Vista previa de lo que lee el agente (solo quien administra): el texto tal
 * cual le llega hoy y, con `?simular=edificio,unidad`, cómo quedaría si esos
 * objetos estuvieran visibles, sin prenderlos.
 */
export const GET = withAdmin(async (session, req: Request) => {
  if (!canConfigure(session.role)) {
    return apiError(403, "forbidden", "Solo quien administra ve lo que lee el agente");
  }
  const orgId = session.organizationId;
  const simular = (new URL(req.url).searchParams.get("simular") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 50);
  const entradas = await getDb()
    .select()
    .from(schema.kbEntry)
    .where(eq(schema.kbEntry.organizationId, orgId))
    .orderBy(asc(schema.kbEntry.createdAt));
  const kb = renderKb(entradas);
  const motor = await cargarMotor(orgId).catch(() => null);
  const [hoy, simulado] = await Promise.all([
    conocimientoDelAgente(orgId, kb),
    simular.length ? conocimientoDelAgente(orgId, kb, { simular }) : Promise.resolve(null),
  ]);
  return Response.json({
    hoy,
    simulado,
    simular,
    objetos: motor
      ? [...motor.objetos.values()].map((o) => ({ clave: o.clave, nombrePlural: o.nombrePlural, visibleAgente: o.visibleAgente }))
      : [],
  });
});
