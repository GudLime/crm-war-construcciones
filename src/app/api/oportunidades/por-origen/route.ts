import { count, inArray } from "drizzle-orm";
import { withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { ESTADOS_ABIERTOS_LISTA } from "@/lib/ventas";
import { alcanceDe, oportunidadVisible } from "@/server/acceso";
import { listarOrigenes } from "@/server/origenes";

export const dynamic = "force-dynamic";

/**
 * Las subpáginas de Oportunidades en la barra lateral: un ítem por origen
 * (en el orden de Configuración → Orígenes) con cuántas abiertas tiene. Una
 * sola consulta agrupada; el operador cuenta solo las suyas.
 */
export const GET = withAuth(async (session) => {
  const org = session.organizationId;
  const op = schema.oportunidad;
  const [origenes, cuentas] = await Promise.all([
    listarOrigenes(org),
    getDb()
      .select({ origen: op.origen, n: count() })
      .from(op)
      .where(
        scoped(op.organizationId, org, inArray(op.estado, [...ESTADOS_ABIERTOS_LISTA]), oportunidadVisible(alcanceDe(session)))
      )
      .groupBy(op.origen),
  ]);
  const porNombre = new Map(cuentas.map((c) => [c.origen, Number(c.n)]));
  return Response.json({
    origenes: origenes.map((o) => ({
      id: o.id,
      nombre: o.nombre,
      icono: o.icono,
      imagen: o.imagen,
      abiertas: porNombre.get(o.nombre) ?? 0,
    })),
  });
});
