import { withAuth } from "@/lib/api";
import { listConversations } from "@/server/inbox/queries";
import { schema } from "@/lib/db";
import { and } from "drizzle-orm";
import { alcanceDe, contactoDeResponsables } from "@/server/acceso";
import { derivadaSinTomar } from "@/server/inicio";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session, req: Request) => {
  const url = new URL(req.url);
  const sinceParam = url.searchParams.get("since");
  const since = sinceParam ? new Date(sinceParam) : undefined;
  // Visibilidad por rol: el operador ve los chats de sus oportunidades; el
  // admin puede pedir `?responsable=yo,sin,<id>` (sin el parámetro, todos).
  // Inicio — `?derivadas=1`: solo las derivaciones de la IA que nadie tomó
  // (de todo el equipo para el admin, sin importar el responsable).
  const derivadas = url.searchParams.get("derivadas") === "1";
  const deQuien = contactoDeResponsables(
    alcanceDe(session),
    schema.conversation.contactId,
    derivadas ? "todos" : url.searchParams.get("responsable")
  );
  const visibles = derivadas ? and(deQuien, derivadaSinTomar()) : deQuien;
  const conversations = await listConversations(
    session.organizationId,
    since && !Number.isNaN(since.getTime()) ? since : undefined,
    visibles
  );
  return Response.json({ conversations });
});
