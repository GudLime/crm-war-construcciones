import { withAdmin } from "@/lib/api";
import { contarTareasDeVisita, convertirTareasDeVisita } from "@/server/agenda/convertir-tareas";

export const dynamic = "force-dynamic";

/** 0054 — Cuántas tareas de Visita o Reunión quedan por pasar a la Agenda. */
export const GET = withAdmin(async (session) => {
  return Response.json(await contarTareasDeVisita(session.organizationId));
});

/** Pasarlas a citas (lo pide el admin; no corre solo). */
export const POST = withAdmin(async (session) => {
  return Response.json(await convertirTareasDeVisita(session.organizationId));
});
