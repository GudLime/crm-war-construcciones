import { withAuth } from "@/lib/api";
import { conReservas } from "@/server/reservas/http";
import { comensales } from "@/server/reservas/comensales";

export const dynamic = "force-dynamic";

/** 071 — Lo que se cuenta de cada persona por sus reservas (para Contactos). */
export const GET = withAuth(async (session) =>
  conReservas(async () => Response.json(await comensales(session.organizationId)))
);
