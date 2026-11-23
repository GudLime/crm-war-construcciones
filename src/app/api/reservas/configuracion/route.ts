import { apiError, parseBody, withAdmin } from "@/lib/api";
import { canConfigure } from "@/lib/auth/roles";
import { conReservas } from "@/server/reservas/http";
import { configuracionSchema, guardarConfiguracion, leerConfiguracion } from "@/server/reservas/servicio";

export const dynamic = "force-dynamic";

/** 071 — Ajustes → Reservas: horarios, cupo, anticipación y días cerrados. */
export const GET = withAdmin(async (session) =>
  conReservas(async () =>
    Response.json({
      ...(await leerConfiguracion(session.organizationId)),
      puedeEditar: canConfigure(session.role),
    })
  )
);

export const PUT = withAdmin(async (session, req: Request) =>
  conReservas(async () => {
    if (!canConfigure(session.role)) {
      return apiError(403, "forbidden", "Solo quien administra cambia estos ajustes");
    }
    const body = await parseBody(req, configuracionSchema);
    if (!body.ok) return body.response;
    await guardarConfiguracion(session.organizationId, body.data);
    return Response.json(await leerConfiguracion(session.organizationId));
  })
);
