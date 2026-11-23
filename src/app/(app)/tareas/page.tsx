import { notFound, redirect } from "next/navigation";
import { TareasClient } from "@/components/ventas/tareas-client";
import { getSessionOrNull } from "@/lib/auth/session";
import { isCalendarView, isIsoDate } from "@/lib/time/calendar";
import { todayInTz } from "@/lib/time/slots";
import { agendaEnabled } from "@/server/agenda/flag";
import { getSettings } from "@/server/agenda/settings";
import { pantallaApagada } from "@/server/vocabulario";

export const dynamic = "force-dynamic";

type Params = { cal?: string; fecha?: string };

export default async function TareasPage({ searchParams }: { searchParams: Promise<Params> }) {
  // 071 — Un cliente sin tareas (el seguimiento es con notas) no tiene esta página.
  if (await pantallaApagada("tareas")) notFound();
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  // Cambios 23/11, punto 2 — la vista Calendario: las citas (si hay agenda) y las tareas juntas.
  const settings = await getSettings(session.organizationId);
  const params = await searchParams;
  return (
    <TareasClient
      calendario={{
        agenda: agendaEnabled(),
        timezone: settings.timezone,
        weeklyHours: settings.weeklyHours,
        hoy: todayInTz(new Date(), settings.timezone),
        vista: isCalendarView(params.cal) ? params.cal : null,
        fecha: isIsoDate(params.fecha) ? params.fecha : null,
      }}
    />
  );
}
