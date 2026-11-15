import { z } from "zod";
import { parseBody, withAuth } from "@/lib/api";
import { esFecha, esHora } from "@/lib/reservas";
import { conReservas } from "@/server/reservas/http";
import { contactoParaReserva, tomarCupo } from "@/server/reservas/servicio";

export const dynamic = "force-dynamic";

const schema = z.object({
  nombre: z.string().trim().min(1).max(120),
  telefono: z.string().trim().max(40).nullable().optional(),
  contactId: z.string().min(1).nullable().optional(),
  fecha: z.string().refine(esFecha, "Fecha inválida"),
  hora: z.string().refine(esHora, "Hora inválida"),
  personas: z.number().int().min(1).max(100),
  observaciones: z.string().trim().max(500).nullable().optional(),
  /** Una reserva por teléfono o en el local puede ir fuera de los horarios reservables. */
  forzarHorario: z.boolean().optional(),
  /** El sector de la mesa libre que se tocó en el mosaico. */
  sector: z.string().trim().min(1).max(40).nullable().optional(),
});

/** 071 — Una reserva cargada a mano (teléfono, en el local). Misma regla de cupo. */
export const POST = withAuth(async (session, req: Request) =>
  conReservas(async () => {
    const body = await parseBody(req, schema);
    if (!body.ok) return body.response;
    const d = body.data;
    const contactId =
      d.contactId ?? (await contactoParaReserva(session.organizationId, { nombre: d.nombre, telefono: d.telefono }));
    const reserva = await tomarCupo(session.organizationId, {
      contactId,
      fecha: d.fecha,
      hora: d.hora,
      personas: d.personas,
      nombre: d.nombre,
      canal: d.telefono ? "telefono" : "manual",
      observaciones: d.observaciones ?? null,
      actor: { fuente: "persona", userId: session.userId },
      forzarHorario: d.forzarHorario ?? false,
      sector: d.sector ?? null,
    });
    return Response.json({ reserva }, { status: 201 });
  })
);
