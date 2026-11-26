import { agendaEnabled } from "@/server/agenda/flag";
import { pasarTareaACita } from "@/server/agenda/convertir-tareas";
import { and, eq } from "drizzle-orm";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { replyWindow } from "@/server/inbox/window";
import { esAdmin } from "@/lib/auth/roles";
import { borrarTarea, editarTarea, listarTareas, tareaSchema, VentasError } from "@/server/ventas";
import { accesoATarea, alcanceDe, noEncontrado, prohibido, tareaVisible } from "@/server/acceso";

/** Visibilidad por rol: el operador cambia solo sus tareas (las visitas ajenas son de lectura). */
async function exigirEdicion(session: Parameters<Parameters<typeof withAuth>[0]>[0], id: string) {
  const acceso = await accesoATarea(alcanceDe(session), id);
  if (acceso === null) return noEncontrado("Esa tarea");
  if (acceso === "leer") return prohibido("Esa tarea es de otra persona: la podés ver, no cambiar");
  return null;
}

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * v2, punto 2 — Una tarea para su ventana de detalle, con el teléfono y el
 * correo del contacto (Llamar / Abrir en el correo) y si se puede editar.
 */
export const GET = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const a = alcanceDe(session);
  const [tarea] = await listarTareas(session.organizationId, undefined, and(eq(schema.tareaVenta.id, id), tareaVisible(a)));
  if (!tarea) return noEncontrado("Esa tarea");
  const [contacto] = tarea.contactId
    ? await getDb()
        .select({ telefono: schema.contact.phone, email: schema.contact.email })
        .from(schema.contact)
        .where(and(eq(schema.contact.organizationId, session.organizationId), eq(schema.contact.id, tarea.contactId)))
        .limit(1)
    : [];
  // v3 — La ventana de 24 h de su conversación (para un WhatsApp).
  const c = schema.conversation;
  const [conv] = tarea.contactId || tarea.conversationId
    ? await getDb()
        .select({ channel: c.channel, lastInboundAt: c.lastInboundAt })
        .from(c)
        .where(
          tarea.conversationId
            ? and(eq(c.organizationId, session.organizationId), eq(c.id, tarea.conversationId))
            : and(eq(c.organizationId, session.organizationId), eq(c.contactId, tarea.contactId!), eq(c.isTest, false))
        )
        .limit(1)
    : [];
  const v = conv ? replyWindow(conv.channel, conv.lastInboundAt) : null;
  return Response.json({
    tarea: { ...tarea, editable: a.admin || tarea.responsableId === session.userId },
    contacto: contacto ?? null,
    ventana: v ? { abierta: v.operatorOpen, restanteMs: v.operatorOpen ? v.operatorRemainingMs : 0 } : null,
  });
});

export const PATCH = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const negado = await exigirEdicion(session, id);
  if (negado) return negado;
  const body = await parseBody(req, tareaSchema);
  if (!body.ok) return body.response;
  if (!esAdmin(session.role) && body.data.responsableId && body.data.responsableId !== session.userId) {
    return prohibido("Solo un admin pasa una tarea a otra persona");
  }
  try {
    const tarea = await editarTarea(session.organizationId, id, body.data, session.userId);
    // 0069 — Le pusieron fecha a una visita o reunión: pasa a ser la cita.
    const citaId = agendaEnabled() ? await pasarTareaACita(session.organizationId, id) : null;
    return Response.json({ tarea, citaId });
  } catch (err) {
    if (err instanceof VentasError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});

export const DELETE = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const negado = await exigirEdicion(session, id);
  if (negado) return negado;
  try {
    await borrarTarea(session.organizationId, id);
    return new Response(null, { status: 204 });
  } catch (err) {
    if (err instanceof VentasError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});
