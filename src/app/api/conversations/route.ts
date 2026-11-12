import { withAuth } from "@/lib/api";
import { listConversations } from "@/server/inbox/queries";
import { schema } from "@/lib/db";
import { alcanceDe, contactoDeResponsables } from "@/server/acceso";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session, req: Request) => {
  const url = new URL(req.url);
  const sinceParam = url.searchParams.get("since");
  const since = sinceParam ? new Date(sinceParam) : undefined;
  // Visibilidad por rol: el operador ve los chats de sus oportunidades; el
  // admin puede pedir `?responsable=yo,sin,<id>` (sin el parámetro, todos).
  const visibles = contactoDeResponsables(
    alcanceDe(session),
    schema.conversation.contactId,
    url.searchParams.get("responsable")
  );
  const conversations = await listConversations(
    session.organizationId,
    since && !Number.isNaN(since.getTime()) ? since : undefined,
    visibles
  );
  return Response.json({ conversations });
});
