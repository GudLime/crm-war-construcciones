import { apiError, parseBody, withAdmin } from "@/lib/api";
import { canConfigure } from "@/lib/auth/roles";
import { conReservas } from "@/server/reservas/http";
import { guardarSectores, leerSectores, sectoresSchema } from "@/server/reservas/servicio";
import { z } from "zod";

export const dynamic = "force-dynamic";

/** 071 — Configuración → Sectores: la lista de sectores del local, en orden. */
export const GET = withAdmin(async (session) =>
  conReservas(async () =>
    Response.json({ sectores: await leerSectores(session.organizationId), puedeEditar: canConfigure(session.role) })
  )
);

export const PUT = withAdmin(async (session, req: Request) =>
  conReservas(async () => {
    if (!canConfigure(session.role)) {
      return apiError(403, "forbidden", "Solo quien administra cambia los sectores");
    }
    const body = await parseBody(req, z.object({ sectores: sectoresSchema }));
    if (!body.ok) return body.response;
    await guardarSectores(session.organizationId, body.data.sectores);
    return Response.json({ sectores: await leerSectores(session.organizationId) });
  })
);
