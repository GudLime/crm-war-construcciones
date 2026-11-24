import { asc, desc, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { VALORES_TIPO_CONTACTO, type TipoContacto } from "@/lib/ventas";
import { abrirOportunidad, cambiarTiposContacto } from "@/server/oportunidades";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { explicarMotivoTelefono, normalizarTelefono } from "@/lib/telefono";
import { digitsOnly, normalizeText } from "@/lib/search";
import { serializeContact } from "@/server/contacts";
import { createLeadForContact } from "@/server/inbox/lead-activity";
import { alcanceDe, contactoVisible } from "@/server/acceso";
import { filtrosContactos } from "@/lib/contactos-lista";

export const dynamic = "force-dynamic";

/**
 * Búsqueda tolerante en SQL, espejo de `matchesQuery` del cliente:
 * - nombre sin acentos ni mayúsculas (`translate`, sin depender de la
 *   extensión `unaccent`, que exigiría privilegios en la BD);
 * - teléfono por DÍGITOS, para poder teclearlo como se ve ("+52 555 000…").
 */
const UNACCENT_FROM = "áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ";
const UNACCENT_TO = "aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC";

export const GET = withAuth(async (session, req: Request) => {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  const stage = url.searchParams.get("stage")?.trim();
  const includeArchived = url.searchParams.get("archived") === "true";

  const db = getDb();

  // Etapa de cada contacto en una consulta aparte: una subconsulta
  // correlacionada aquí choca con el `id` de `lead` ("column reference id is
  // ambiguous"), y un join duplicaría contactos con más de un lead.
  const leadStages = await db
    .select({
      contactId: schema.lead.contactId,
      stageName: schema.pipelineStage.name,
      priority: schema.lead.priority,
    })
    .from(schema.lead)
    .innerJoin(
      schema.pipelineStage,
      eq(schema.pipelineStage.id, schema.lead.stageId)
    )
    .where(scoped(schema.lead.organizationId, session.organizationId));
  const stageByContact = new Map(
    leadStages.map((r) => [r.contactId, r.stageName])
  );
  const priorityByContact = new Map(
    leadStages.map((r) => [r.contactId, r.priority])
  );

  const qDigits = q ? digitsOnly(q) : "";
  // El patrón viaja normalizado igual que la columna, y con los comodines de
  // LIKE escapados para que un "%" tecleado no liste todo.
  const qLike = q ? normalizeText(q).replace(/[\\%_]/g, "\\$&") : "";
  const search =
    q && q.length > 0
      ? or(
          sql`lower(translate(${schema.contact.name}, ${UNACCENT_FROM}, ${UNACCENT_TO}))
              like ${`%${qLike}%`}`,
          // Un dígito suelto barrería el directorio entero: mínimo 3.
          qDigits.length >= 3
            ? sql`regexp_replace(coalesce(${schema.contact.phone}, ''), '\\D', '', 'g')
                  like ${`%${qDigits}%`}`
            : undefined,
          // War: también por correo (se guarda en minúsculas).
          sql`lower(coalesce(${schema.contact.email}, '')) like ${`%${qLike}%`}`
        )
      : undefined;

  // Cambios 23/11, punto 8 — Con `pagina`, la lista paginada de Contactos
  // (de a 50, filtros y orden en el servidor). Sin `pagina`, lo de siempre.
  if (url.searchParams.has("pagina")) {
    const f = filtrosContactos(url.searchParams);
    const c = schema.contact;
    const condiciones = [
      search,
      f.archivados ? isNotNull(c.archivedAt) : isNull(c.archivedAt),
      f.tipo
        ? f.tipo === "sin"
          ? sql`cardinality(${c.tiposContacto}) = 0`
          : sql`${f.tipo} = ANY(${c.tiposContacto})`
        : undefined,
      f.fuente ? (f.fuente === "desconocida" ? isNull(c.source) : eq(c.source, f.fuente)) : undefined,
      f.agente === "con" ? eq(c.aiPaused, false) : f.agente === "sin" ? eq(c.aiPaused, true) : undefined,
      contactoVisible(alcanceDe(session), c.id),
    ];
    const donde = scoped(c.organizationId, session.organizationId, ...condiciones);
    const columna = f.orden === "telefono" ? c.phone : f.orden === "creado" ? c.createdAt : sql`lower(${c.name})`;
    const [filas, [cuenta]] = await Promise.all([
      db
        .select()
        .from(c)
        .where(donde)
        .orderBy(f.dir === "desc" ? sql`${columna} desc nulls last` : sql`${columna} asc nulls last`, asc(c.id))
        .limit(f.porPagina)
        .offset((f.pagina - 1) * f.porPagina),
      db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(c).where(donde),
    ]);
    return Response.json({
      items: filas.map((x) => serializeContact(x, stageByContact.get(x.id) ?? null, priorityByContact.get(x.id) ?? null)),
      total: cuenta?.n ?? 0,
      pagina: f.pagina,
      porPagina: f.porPagina,
    });
  }

  // El filtro de etapa se aplica ANTES del límite: si no, un contacto de la
  // etapa buscada podría quedar fuera por el corte de 200.
  const stageContactIds = stage
    ? leadStages.filter((r) => r.stageName === stage).map((r) => r.contactId)
    : null;
  if (stageContactIds?.length === 0) return Response.json({ contacts: [] });

  const rows = await db
    .select()
    .from(schema.contact)
    .where(
      scoped(
        schema.contact.organizationId,
        session.organizationId,
        search,
        stageContactIds ? inArray(schema.contact.id, stageContactIds) : undefined,
        // Visibilidad por rol: el operador ve los contactos de sus oportunidades.
        contactoVisible(alcanceDe(session), schema.contact.id)
      )
    )
    .orderBy(desc(schema.contact.updatedAt))
    .limit(200);

  const contacts = rows
    .filter((c) => includeArchived || !c.archivedAt)
    .map((c) =>
      serializeContact(
        c,
        stageByContact.get(c.id) ?? null,
        priorityByContact.get(c.id) ?? null
      )
    );
  return Response.json({ contacts });
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  /**
   * War: se acepta como lo escriban (`11 5119-1447`, `+54 9 11…`, `011 15…`)
   * y se normaliza con `lib/telefono.ts` a E.164 sin `+`: el mismo número con
   * el que WhatsApp reporta a esa persona, para que nunca haya dos fichas.
   */
  phone: z.string().trim().min(1, "Falta el teléfono").max(40),
  /** 068 — Tipo de contacto elegido al darlo de alta; sin él queda sin clasificar. */
  /** v4 — Lo que la persona es (selección múltiple). */
  tiposContacto: z.array(z.enum(VALORES_TIPO_CONTACTO as [TipoContacto, ...TipoContacto[]])).max(10).optional(),
  /** v4 — Abrirle ya una oportunidad de este tipo (Venta, Alquiler, Inmobiliaria). */
  oportunidad: z.enum(["venta", "alquiler", "inmobiliaria"]).optional(),
  /** War: correo opcional. Informativo; la identidad sigue siendo el teléfono. */
  email: z.string().trim().max(254).email("Correo no válido").optional(),
  notes: z.string().max(4000).optional(),
  source: z.enum(["anuncio", "organico", "referido", "conocido", "otro"]).optional(),
  /** Etapa inicial del lead; si no viene, la primera abierta del tablero. */
  stageId: z.string().min(1).optional(),
});

export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, createSchema);
  if (!body.ok) return body.response;

  const db = getDb();
  // 003: la identidad WhatsApp se deriva del teléfono normalizado.
  const normalizado = normalizarTelefono(body.data.phone);
  if (!normalizado.ok) {
    return apiError(422, "telefono_invalido", explicarMotivoTelefono(normalizado.motivo));
  }
  const phone = normalizado.telefono;
  const inserted = await db
    .insert(schema.contact)
    .values({
      id: newId("contact"),
      organizationId: session.organizationId,
      name: body.data.name,
      phone,
      waIdentity: phone,
      email: body.data.email?.toLowerCase() ?? null,
      notes: body.data.notes ?? null,
      source: body.data.source ?? null,
    })
    // El canal entra en el target porque entra en el índice único desde 014
    // (`contact_org_channel_identity_uq`). Postgres exige que el ON CONFLICT
    // nombre EXACTAMENTE las columnas de un índice existente: sin `channel`,
    // el alta manual falla con "no unique or exclusion constraint matching".
    .onConflictDoNothing({
      target: [
        schema.contact.organizationId,
        schema.contact.channel,
        schema.contact.waIdentity,
      ],
    })
    .returning();
  if (!inserted[0]) {
    return apiError(409, "duplicate", "Ya existe un contacto con ese teléfono");
  }

  // Y su lead: un contacto sin lead es invisible en el Pipeline, que es la
  // pantalla donde se trabaja el embudo. Dar de alta a alguien y no verlo ahí
  // es la mitad de la función.
  const lead = await createLeadForContact({
    organizationId: session.organizationId,
    contactId: inserted[0].id,
    stageId: body.data.stageId,
    source: "dueno",
    actorUserId: session.userId,
  });
  if (!lead) {
    return apiError(
      422,
      "no_stage",
      "El tablero no tiene etapas abiertas donde colocar al prospecto"
    );
  }

  // v4 — Lo que es va al contacto; lo que busca abre su oportunidad.
  let creado = inserted[0];
  if (body.data.tiposContacto?.length || body.data.oportunidad) {
    if (body.data.tiposContacto?.length) {
      await cambiarTiposContacto({
        organizationId: session.organizationId,
        contactId: creado.id,
        tipos: body.data.tiposContacto,
        fuente: "persona",
        userId: session.userId,
      });
    }
    if (body.data.oportunidad) {
      await abrirOportunidad(
        session.organizationId,
        creado.id,
        { fuente: "persona", userId: session.userId },
        body.data.oportunidad
      );
    }
    const [fresco] = await db
      .select()
      .from(schema.contact)
      .where(eq(schema.contact.id, creado.id))
      .limit(1);
    if (fresco) creado = fresco;
  }

  return Response.json(
    { contact: serializeContact(creado), lead: { id: lead.id } },
    { status: 201 }
  );
});
