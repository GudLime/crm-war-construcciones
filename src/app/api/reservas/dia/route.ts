import { withAuth } from "@/lib/api";
import { conReservas } from "@/server/reservas/http";
import { leerAjustes, reservasDelDia } from "@/server/reservas/servicio";
import { enZona } from "@/lib/reservas";

export const dynamic = "force-dynamic";

/** 071 — Las reservas de un día por horario, con el cupo que queda. Sin fecha, hoy. */
export const GET = withAuth(async (session, req: Request) =>
  conReservas(async () => {
    const pedida = new URL(req.url).searchParams.get("fecha");
    const fecha = pedida ?? enZona(new Date(), (await leerAjustes(session.organizationId)).zonaHoraria).fecha;
    return Response.json(await reservasDelDia(session.organizationId, fecha));
  })
);
