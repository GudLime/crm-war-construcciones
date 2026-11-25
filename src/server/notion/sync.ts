import { and, desc, eq, gte, inArray, lte, ne, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import {
  clavesDePagina,
  ESTADO_CITA,
  estadoDeNotion,
  estadoTareaDeNotion,
  fecha,
  ganaNotion,
  idPlano,
  instante,
  mismaFecha,
  mismoTitulo,
  numero,
  personas,
  relacion,
  texto,
  tipoContactoDeNotion,
  tipoOportunidadDeNotion,
  tipoTareaDeNotion,
  type PaginaNotion,
} from "@/lib/notion-sync";
import { origenCanonico } from "@/lib/origenes";
import { normalizarTelefono } from "@/lib/telefono";
import { ambientesDeTexto, estaAbierta, type EstadoOportunidad } from "@/lib/ventas";
import { agendaEnabled } from "@/server/agenda/flag";
import { getSettings } from "@/server/agenda/settings";
import { resolveInstanceOrg } from "@/server/bot/auth";
import { planoEdificio } from "@/server/importar-notion";
import { cambiarEstadoOportunidad, type Actor } from "@/server/oportunidad-historial";
import { listarOrigenes } from "@/server/origenes";
import { aplicarResponsable, listarResponsables, responsableDeTexto, type ResponsableDto } from "@/server/responsables";
import { consultarBase, editadasDesde, leerPagina, tokenNotion, usuarios } from "./api";

/**
 * War — Sincronización Notion → CRM (backfill del 25/11, pedido de Sebastián).
 * El CRM lee Notion por su cuenta (llave `NOTION_TOKEN`) y se pone al día con
 * lo que el equipo hizo allá: oportunidades nuevas, estado, motivo de cierre,
 * responsable y acciones (tareas y citas, con sus comentarios).
 *
 * - Gana lo más reciente, campo por campo: lo de Notion entra solo si se
 *   editó DESPUÉS del último cambio del CRM (persona, IA, Make o sistema) en
 *   ese registro. Lo que hizo el CRM después no se pisa.
 * - Repetible: cada página queda anotada en `importacion_externa`
 *   (`pagina:<id>`); lo que ya entró no se duplica y una pasada nueva solo
 *   aplica lo que cambió. Lo que escribe la sincronización queda marcado
 *   «migracion» en el historial y no cuenta como cambio del CRM.
 * - Tareas «Eliminar» en Notion: se borran del CRM (una cita, se cancela).
 * - Sin efectos: no despacha al cerebro, no manda WhatsApp, no avisa a Meta.
 * - `NOTION_SYNC=prueba` lee todo y solo informa; `aplicar` guarda.
 */

const FUENTE = "notion";
const DIA = 86_400_000;
const ACTOR: Actor = { fuente: "migracion" };

/** Las bases de Notion de WAR (data sources). */
const BASES = {
  oportunidades: process.env.NOTION_DS_OPORTUNIDADES ?? "3114daa6-7f89-809f-b112-000b37a3e0c0",
  tareas: process.env.NOTION_DS_TAREAS ?? "3114daa6-7f89-8007-a453-000b12eed1d4",
  contactos: process.env.NOTION_DS_CONTACTOS ?? "3134daa6-7f89-81ee-9c31-000b08ac6004",
  edificios: process.env.NOTION_DS_EDIFICIOS ?? "3124daa6-7f89-8044-8df4-000b63abe14e",
};

export type InformeSync = {
  modo: "prueba" | "aplicar";
  desde: string;
  leidas: { oportunidades: number; tareas: number; contactos: number };
  contactos: { nuevos: number; encontrados: number };
  oportunidades: {
    nuevas: number;
    porClave: number;
    porCercania: number;
    estado: number;
    motivo: number;
    responsable: number;
    tipo: number;
    edificios: number;
    noResponde: number;
    ganaCrm: number;
  };
  tareas: {
    nuevas: number;
    citasNuevas: number;
    actualizadas: number;
    eliminadas: number;
    ganaCrm: number;
    sinOportunidad: number;
    igual: number;
  };
  ejemplos: string[];
  problemas: string[];
  segundos: number;
};

function informeVacio(modo: "prueba" | "aplicar", desde: Date): InformeSync {
  return {
    modo,
    desde: desde.toISOString(),
    leidas: { oportunidades: 0, tareas: 0, contactos: 0 },
    contactos: { nuevos: 0, encontrados: 0 },
    oportunidades: {
      nuevas: 0,
      porClave: 0,
      porCercania: 0,
      estado: 0,
      motivo: 0,
      responsable: 0,
      tipo: 0,
      edificios: 0,
      noResponde: 0,
      ganaCrm: 0,
    },
    tareas: { nuevas: 0, citasNuevas: 0, actualizadas: 0, eliminadas: 0, ganaCrm: 0, sinOportunidad: 0, igual: 0 },
    ejemplos: [],
    problemas: [],
    segundos: 0,
  };
}

const MAX_LINEAS = 60;
const anotar = (lista: string[], s: string) => {
  if (lista.length < MAX_LINEAS) lista.push(s);
};

type FilaOp = typeof schema.oportunidad.$inferSelect;

class Sync {
  private equipo: ResponsableDto[] = [];
  private nombresNotion = new Map<string, string>();
  private origenes: string[] = [];
  private edificiosCrm = new Map<string, string>();
  private edificiosNotion = new Map<string, string>();
  private contactosNotion = new Map<string, PaginaNotion>();
  /** página de Notion → id del CRM (o «nuevo:…» en la prueba). */
  private opDePagina = new Map<string, string>();
  private contactoDePagina = new Map<string, string | null>();
  /** oportunidades del CRM ya tomadas por otra página de Notion. */
  private tomadas = new Map<string, string>();
  private minutosCita = 60;

  constructor(
    private org: string,
    private aplicar: boolean,
    private informe: InformeSync
  ) {}

  /* ---------------- preparar ---------------- */

  async preparar() {
    const db = getDb();
    this.equipo = await listarResponsables(this.org);
    this.nombresNotion = await usuarios();
    this.origenes = (await listarOrigenes(this.org)).map((o) => o.nombre);
    const eds = await db
      .select({ id: schema.edificio.id, nombre: schema.edificio.nombre })
      .from(schema.edificio)
      .where(scoped(schema.edificio.organizationId, this.org));
    for (const e of eds) this.edificiosCrm.set(planoEdificio(e.nombre), e.id);
    for (const p of await consultarBase(BASES.edificios)) {
      const titulo = Object.values(p.properties).find((x) => x.type === "title");
      const nombre = texto(titulo);
      if (nombre) this.edificiosNotion.set(idPlano(p.id), nombre);
    }
    for (const p of await consultarBase(BASES.contactos)) this.contactosNotion.set(idPlano(p.id), p);
    this.informe.leidas.contactos = this.contactosNotion.size;
    const ie = schema.importacionExterna;
    const ya = await db
      .select({ clave: ie.clave, crmId: ie.crmId })
      .from(ie)
      .where(and(eq(ie.organizationId, this.org), eq(ie.fuente, FUENTE), eq(ie.tipo, "oportunidad")));
    for (const f of ya) if (f.clave.startsWith("pagina:")) this.tomadas.set(f.crmId, f.clave);
    if (agendaEnabled()) this.minutosCita = (await getSettings(this.org)).slotMinutes;
  }

  private async yaAnotado(id: string): Promise<string | null> {
    const ie = schema.importacionExterna;
    const [f] = await getDb()
      .select({ crmId: ie.crmId })
      .from(ie)
      .where(and(eq(ie.organizationId, this.org), eq(ie.fuente, FUENTE), inArray(ie.clave, clavesDePagina(id))))
      .limit(1);
    return f?.crmId ?? null;
  }

  private async anotar(id: string, tipo: string, crmId: string) {
    if (!this.aplicar) return;
    const ie = schema.importacionExterna;
    await getDb()
      .insert(ie)
      .values({ organizationId: this.org, fuente: FUENTE, clave: `pagina:${idPlano(id)}`, tipo, crmId })
      .onConflictDoUpdate({ target: [ie.organizationId, ie.fuente, ie.clave], set: { crmId, tipo } });
  }

  private nombresResponsable(p: PaginaNotion): string | null {
    const ps = personas(p.properties.Responsable);
    const nombres = ps.map((x) => x.nombre ?? this.nombresNotion.get(x.id) ?? "").filter(Boolean);
    return nombres.length ? nombres.join(", ") : null;
  }

  /* ---------------- contactos ---------------- */

  private async contacto(paginaId: string | undefined): Promise<string | null> {
    if (!paginaId) return null;
    if (this.contactoDePagina.has(paginaId)) return this.contactoDePagina.get(paginaId) ?? null;
    const db = getDb();
    const ct = schema.contact;
    let id = await this.yaAnotado(paginaId);
    if (id) {
      const [f] = await db.select({ id: ct.id }).from(ct).where(scoped(ct.organizationId, this.org, eq(ct.id, id))).limit(1);
      id = f?.id ?? null;
    }
    const p = this.contactosNotion.get(paginaId) ?? (await leerPagina(paginaId));
    if (!id && !p) {
      this.contactoDePagina.set(paginaId, null);
      return null;
    }
    const props = p?.properties ?? {};
    const crudo = texto(props["Teléfono normalizado"]) ?? texto(props.WhatsApp) ?? texto(props.Fijo);
    const tel = crudo ? normalizarTelefono(crudo) : null;
    const telefono = tel?.ok ? tel.telefono : null;
    const correo = texto(props["Correo electrónico"])?.toLowerCase() ?? null;
    const email = correo && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo) ? correo : null;
    if (!id) {
      const cond = telefono ? or(eq(ct.waIdentity, telefono), eq(ct.phone, telefono)) : email ? eq(ct.email, email) : null;
      if (cond) {
        const [f] = await db.select({ id: ct.id }).from(ct).where(scoped(ct.organizationId, this.org, cond)).limit(1);
        id = f?.id ?? null;
      }
    }
    if (id) {
      this.informe.contactos.encontrados++;
    } else {
      const nombre = texto(props["Nombre Completo"]) ?? texto(props.Nombre) ?? (telefono ? `+${telefono}` : email) ?? "Sin nombre";
      const tipo = tipoContactoDeNotion(texto(props.Tipo));
      const creado = instante(fecha(props["Fecha de contacto"])) ?? instante(p?.created_time) ?? new Date();
      id = this.aplicar ? newId("contact") : `nuevo:${paginaId}`;
      if (this.aplicar) {
        await db.insert(ct).values({
          id,
          organizationId: this.org,
          channel: "whatsapp",
          // Sin teléfono no hay identidad de WhatsApp: una propia, que nunca recibe mensajes.
          waIdentity: telefono ?? `notion:pagina:${paginaId}`,
          phone: telefono,
          name: nombre,
          nameSource: "manual",
          email,
          tiposContacto: tipo ? [tipo] : [],
          aiPaused: Boolean(tipo),
          createdAt: creado,
          updatedAt: creado,
        });
      }
      this.informe.contactos.nuevos++;
    }
    await this.anotar(paginaId, "contacto", id);
    this.contactoDePagina.set(paginaId, id);
    return id;
  }

  /* ---------------- oportunidades ---------------- */

  async oportunidad(p: PaginaNotion) {
    const pid = idPlano(p.id);
    const props = p.properties;
    const nombre = texto(props.Name) ?? "Sin nombre";
    const contactId = await this.contacto(relacion(props.Contactos)[0]);
    const creada = instante(fecha(props["Fecha Creación"])) ?? instante(p.created_time) ?? new Date();
    const notionAt = instante(fecha(props["Last Edited"])) ?? instante(p.last_edited_time);
    const tipo = tipoOportunidadDeNotion(texto(props.Tipo));
    const estado = estadoDeNotion(texto(props.Status));
    const motivo = texto(props["Motivo de cierre"]);
    const responsable = responsableDeTexto(this.nombresResponsable(p), this.equipo);
    const edificioIds = [
      ...new Set(
        relacion(props.Edificios)
          .map((e) => this.edificiosNotion.get(e))
          .map((n) => (n ? this.edificiosCrm.get(planoEdificio(n)) : undefined))
          .filter((x): x is string => Boolean(x))
      ),
    ];

    // ¿Ya está en el CRM?
    let op: FilaOp | null = null;
    const anotada = await this.yaAnotado(pid);
    if (anotada) op = await this.fila(anotada);
    if (op) this.informe.oportunidades.porClave++;
    if (!op && contactId && !contactId.startsWith("nuevo:")) {
      op = await this.cercana(contactId, creada, tipo, pid);
      if (op) this.informe.oportunidades.porCercania++;
    }

    if (!op) {
      const id = await this.crear(p, { nombre, contactId, creada, notionAt, tipo, estado, motivo, responsable, edificioIds });
      this.opDePagina.set(pid, id);
      await this.anotar(pid, "oportunidad", id);
      return;
    }
    this.opDePagina.set(pid, op.id);
    this.tomadas.set(op.id, `pagina:${pid}`);
    await this.anotar(pid, "oportunidad", op.id);

    const crmAt = await this.ultimoCambioCrm(op.id, ["creada", "estado", "cerrada", "reabierta"]);
    const gana = ganaNotion(notionAt, crmAt);

    // Estado y motivo de cierre.
    if (estado && estado !== "no_responde" && estado !== op.estado) {
      if (gana) {
        const cerrada = !estaAbierta(estado);
        anotar(this.informe.ejemplos, `«${nombre}»: ${op.estado} → ${estado}${cerrada && motivo ? ` (${motivo})` : ""}`);
        this.informe.oportunidades.estado++;
        if (this.aplicar) {
          op =
            (await cambiarEstadoOportunidad({
              organizationId: this.org,
              oportunidadId: op.id,
              destino: estado,
              motivoCierre: cerrada ? (motivo ?? undefined) : undefined,
              actor: ACTOR,
              at: notionAt ?? new Date(),
            })) ?? op;
        }
      } else {
        this.informe.oportunidades.ganaCrm++;
      }
    } else if (estado && !estaAbierta(op.estado) && estado === op.estado && motivo && motivo !== op.motivoCierre && gana) {
      this.informe.oportunidades.motivo++;
      anotar(this.informe.ejemplos, `«${nombre}»: motivo «${op.motivoCierre ?? "—"}» → «${motivo}»`);
      if (this.aplicar) {
        await getDb()
          .update(schema.oportunidad)
          .set({ motivoCierre: motivo, updatedAt: new Date() })
          .where(eq(schema.oportunidad.id, op.id));
      }
    } else if (estado === "no_responde" && op.estado === "recibido" && op.intentosSinRespuesta === 0 && gana) {
      // «No responde» de Notion: se le escribió y no contestó.
      this.informe.oportunidades.noResponde++;
      if (this.aplicar) {
        await getDb()
          .update(schema.oportunidad)
          .set({ intentosSinRespuesta: 1, ultimoIntentoAt: notionAt, primerContactoAt: op.primerContactoAt ?? notionAt })
          .where(eq(schema.oportunidad.id, op.id));
      }
    }

    // Responsable.
    if (responsable && responsable !== op.responsableUserId) {
      const crmResp = await this.ultimoCambioCrm(op.id, ["responsable"]);
      if (ganaNotion(notionAt, crmResp)) {
        this.informe.oportunidades.responsable++;
        if (this.aplicar) {
          await aplicarResponsable({
            organizationId: this.org,
            oportunidadId: op.id,
            destino: { userId: responsable, ia: false },
            como: "manual",
            actor: ACTOR,
          });
        }
      }
    }

    // Lo que falte: el tipo y los edificios de interés.
    if (tipo && !op.tipo) {
      this.informe.oportunidades.tipo++;
      if (this.aplicar) {
        await getDb().update(schema.oportunidad).set({ tipo }).where(eq(schema.oportunidad.id, op.id));
      }
    }
    if (edificioIds.length) {
      const [hay] = await getDb()
        .select({ id: schema.oportunidadEdificio.edificioId })
        .from(schema.oportunidadEdificio)
        .where(eq(schema.oportunidadEdificio.oportunidadId, op.id))
        .limit(1);
      if (!hay && !op.edificioId) {
        this.informe.oportunidades.edificios++;
        if (this.aplicar) {
          await getDb()
            .insert(schema.oportunidadEdificio)
            .values(edificioIds.map((edificioId) => ({ organizationId: this.org, oportunidadId: op!.id, edificioId })))
            .onConflictDoNothing();
          await getDb().update(schema.oportunidad).set({ edificioId: edificioIds[0] }).where(eq(schema.oportunidad.id, op.id));
        }
      }
    }
  }

  private async fila(id: string): Promise<FilaOp | null> {
    const o = schema.oportunidad;
    const [f] = await getDb().select().from(o).where(scoped(o.organizationId, this.org, eq(o.id, id))).limit(1);
    return f ?? null;
  }

  /** La del mismo contacto creada a ±7 días (la que entró por Make o la importación). */
  private async cercana(
    contactId: string,
    creada: Date,
    tipo: string | null,
    pid: string
  ): Promise<FilaOp | null> {
    const o = schema.oportunidad;
    const filas = await getDb()
      .select()
      .from(o)
      .where(
        scoped(
          o.organizationId,
          this.org,
          eq(o.contactId, contactId),
          gte(o.createdAt, new Date(creada.getTime() - 7 * DIA)),
          lte(o.createdAt, new Date(creada.getTime() + 7 * DIA))
        )
      );
    const libres = filas.filter((f) => {
      const de = this.tomadas.get(f.id);
      return !de || de === `pagina:${pid}`;
    });
    libres.sort((a, b) => {
      const ta = (tipo && a.tipo === tipo ? 0 : 1) - (tipo && b.tipo === tipo ? 0 : 1);
      return ta || Math.abs(a.createdAt.getTime() - creada.getTime()) - Math.abs(b.createdAt.getTime() - creada.getTime());
    });
    return libres[0] ?? null;
  }

  /** El último cambio que hizo el CRM (no la sincronización) en esa oportunidad. */
  private async ultimoCambioCrm(id: string, tipos: (typeof schema.oportunidadEvento.$inferSelect)["tipo"][]): Promise<Date | null> {
    const e = schema.oportunidadEvento;
    const [f] = await getDb()
      .select({ at: e.occurredAt })
      .from(e)
      .where(and(eq(e.organizationId, this.org), eq(e.oportunidadId, id), inArray(e.tipo, tipos), ne(e.fuente, "migracion")))
      .orderBy(desc(e.occurredAt))
      .limit(1);
    return f?.at ?? null;
  }

  private async crear(
    p: PaginaNotion,
    d: {
      nombre: string;
      contactId: string | null;
      creada: Date;
      notionAt: Date | null;
      tipo: "venta" | "alquiler" | "inmobiliaria" | null;
      estado: ReturnType<typeof estadoDeNotion>;
      motivo: string | null;
      responsable: string | null;
      edificioIds: string[];
    }
  ): Promise<string> {
    this.informe.oportunidades.nuevas++;
    const estado: EstadoOportunidad = d.estado && d.estado !== "no_responde" ? d.estado : "recibido";
    anotar(this.informe.ejemplos, `nueva «${d.nombre}» (${estado})`);
    if (!this.aplicar) return `nuevo:${idPlano(p.id)}`;
    const id = newId("oportunidad");
    const editada = d.notionAt ?? d.creada;
    const cerrada = !estaAbierta(estado);
    const origen = origenCanonico(texto(p.properties.Fuente), this.origenes);
    const db = getDb();
    await db.insert(schema.oportunidad).values({
      id,
      organizationId: this.org,
      nombre: d.nombre,
      origen,
      contactId: d.contactId,
      edificioId: d.edificioIds[0] ?? null,
      estado,
      tipo: d.tipo,
      motivoCierre: cerrada ? d.motivo : null,
      valorCents: (() => {
        const v = numero(p.properties["Valor de oportunidad"]);
        return v == null ? null : Math.round(v * 100);
      })(),
      moneda: numero(p.properties["Valor de oportunidad"]) == null ? null : "USD",
      responsableUserId: d.responsable,
      responsableDesde: d.responsable ? editada : null,
      asignadaPor: d.responsable ? "manual" : null,
      intentosSinRespuesta: d.estado === "no_responde" ? 1 : 0,
      ultimaInteraccion: editada,
      estadoDesde: editada,
      cerradaAt: cerrada ? editada : null,
      createdAt: d.creada,
      updatedAt: editada,
    });
    if (d.edificioIds.length) {
      await db
        .insert(schema.oportunidadEdificio)
        .values(d.edificioIds.map((edificioId) => ({ organizationId: this.org, oportunidadId: id, edificioId })))
        .onConflictDoNothing();
    }
    const ambientes = ambientesDeTexto(texto(p.properties.Tipologias));
    if (ambientes.length) {
      await db
        .insert(schema.oportunidadAmbiente)
        .values(ambientes.map((n) => ({ organizationId: this.org, oportunidadId: id, ambientes: n })))
        .onConflictDoNothing();
    }
    const base = {
      organizationId: this.org,
      oportunidadId: id,
      contactId: d.contactId,
      origen,
      edificioId: d.edificioIds[0] ?? null,
      tipoOportunidad: d.tipo,
      fuente: "migracion" as const,
      datos: { fuente: "notion", pagina: idPlano(p.id) },
    };
    const eventos: (typeof schema.oportunidadEvento.$inferInsert)[] = [
      { ...base, id: newId("oportunidadEvento"), tipo: "creada", estadoHasta: "recibido", occurredAt: d.creada },
    ];
    if (cerrada) {
      eventos.push({
        ...base,
        id: newId("oportunidadEvento"),
        tipo: "cerrada",
        estadoDesde: "recibido",
        estadoHasta: estado,
        resultado: estado === "compro" ? "ganada" : estado === "no_calificado" ? "no_calificado" : "perdida",
        motivo: d.motivo,
        occurredAt: editada,
      });
    } else if (estado !== "recibido") {
      eventos.push({ ...base, id: newId("oportunidadEvento"), tipo: "estado", estadoDesde: "recibido", estadoHasta: estado, occurredAt: editada });
    }
    await db.insert(schema.oportunidadEvento).values(eventos);
    return id;
  }

  /* ---------------- tareas ---------------- */

  private async opDeTarea(paginaOp: string | undefined): Promise<{ id: string; contactId: string | null } | null> {
    if (!paginaOp) return null;
    let id = this.opDePagina.get(paginaOp) ?? (await this.yaAnotado(paginaOp));
    if (!id) {
      // Una oportunidad que no se editó en el período: se lee y se pone al día.
      const p = await leerPagina(paginaOp);
      if (!p) return null;
      await this.oportunidad(p);
      id = this.opDePagina.get(paginaOp) ?? null;
    }
    if (!id) return null;
    if (id.startsWith("nuevo:")) return { id, contactId: null };
    const [f] = await getDb()
      .select({ id: schema.oportunidad.id, contactId: schema.oportunidad.contactId })
      .from(schema.oportunidad)
      .where(scoped(schema.oportunidad.organizationId, this.org, eq(schema.oportunidad.id, id)))
      .limit(1);
    return f ?? null;
  }

  async tarea(p: PaginaNotion) {
    const props = p.properties;
    const tid = idPlano(p.id);
    const titulo = (texto(props.Tarea) ?? texto(Object.values(props).find((x) => x.type === "title")) ?? "Tarea").slice(0, 300);
    const tipo = tipoTareaDeNotion(texto(props.Tipo)) ?? "llamada";
    const estado = estadoTareaDeNotion(texto(props.Estado));
    const cuando = instante(fecha(props.Fecha));
    const comentarios = texto(props.Comentarios);
    const notionAt = instante(p.last_edited_time);
    const creada = instante(p.created_time) ?? new Date();

    const op = await this.opDeTarea(relacion(props.Oportunidades)[0]);
    const contactId = op?.contactId ?? (await this.contacto(relacion(props.Contacto)[0]));
    if (!op && !contactId) {
      this.informe.tareas.sinOportunidad++;
      return;
    }
    const nuevoEnPrueba = Boolean(op?.id.startsWith("nuevo:") || contactId?.startsWith("nuevo:"));
    const comoCita = (tipo === "visita" || tipo === "reunion") && agendaEnabled() && Boolean(cuando) && Boolean(contactId);

    const existente = nuevoEnPrueba ? null : await this.tareaExistente(tid, { op: op?.id ?? null, contactId, tipo, titulo, cuando });

    if (estado === "eliminar") {
      if (existente && ganaNotion(notionAt, existente.updatedAt)) {
        this.informe.tareas.eliminadas++;
        anotar(this.informe.ejemplos, `eliminar ${existente.cual} «${titulo}»`);
        if (this.aplicar) await this.borrar(existente);
      }
      return;
    }

    if (existente) {
      await this.anotar(tid, existente.cual, existente.id);
      if (!ganaNotion(notionAt, existente.updatedAt)) {
        this.informe.tareas.ganaCrm++;
        return;
      }
      const cambia =
        (estado && estado !== existente.estado) ||
        (comentarios ?? null) !== (existente.comentarios ?? null) ||
        !mismaFecha(cuando, existente.fecha);
      if (!cambia) {
        this.informe.tareas.igual++;
        return;
      }
      this.informe.tareas.actualizadas++;
      if (this.aplicar) await this.actualizar(existente, { estado, comentarios, cuando, titulo, notionAt: notionAt ?? new Date() });
      return;
    }

    // Nueva.
    if (!this.aplicar || nuevoEnPrueba) {
      if (comoCita) this.informe.tareas.citasNuevas++;
      else this.informe.tareas.nuevas++;
      return;
    }
    if (comoCita) {
      const id = newId("booking");
      try {
        await getDb().insert(schema.booking).values({
          id,
          organizationId: this.org,
          kind: "session",
          status: ESTADO_CITA[estado ?? "realizar"],
          source: "manual",
          contactId: contactId!,
          scheduledAt: cuando!,
          durationMinutes: this.minutosCita,
          connector: null,
          notes: [titulo, comentarios].filter(Boolean).join("\n\n") || null,
          confirmadaAt: creada,
          modo: tipo === "reunion" ? "reunion" : "visita",
          createdAt: creada,
          updatedAt: notionAt ?? creada,
        });
        await this.anotar(tid, "cita", id);
        this.informe.tareas.citasNuevas++;
        return;
      } catch (err) {
        if (!choca(err)) throw err;
        // Ya hay otra cita a esa hora: queda como tarea.
      }
    }
    const id = newId("tareaVenta");
    await getDb().insert(schema.tareaVenta).values({
      id,
      organizationId: this.org,
      titulo,
      tipo,
      estado: estado ?? "realizar",
      fecha: cuando,
      comentarios,
      contactId,
      oportunidadId: op?.id ?? null,
      createdAt: creada,
      updatedAt: notionAt ?? creada,
    });
    await this.anotar(tid, "tarea", id);
    this.informe.tareas.nuevas++;
  }

  private async tareaExistente(
    tid: string,
    q: { op: string | null; contactId: string | null; tipo: string; titulo: string; cuando: Date | null }
  ): Promise<Existente | null> {
    const db = getDb();
    const t = schema.tareaVenta;
    const b = schema.booking;
    const anotada = await this.yaAnotado(tid);
    if (anotada) {
      const [ta] = await db.select().from(t).where(scoped(t.organizationId, this.org, eq(t.id, anotada))).limit(1);
      if (ta) return deTarea(ta);
      const [bk] = await db.select().from(b).where(scoped(b.organizationId, this.org, eq(b.id, anotada))).limit(1);
      if (bk) return deCita(bk);
    }
    // La de la importación original (o una que ya pasó a cita): misma oportunidad, tipo, título y fecha.
    if (q.op) {
      const filas = await db
        .select()
        .from(t)
        .where(scoped(t.organizationId, this.org, eq(t.oportunidadId, q.op), eq(t.tipo, q.tipo as typeof t.$inferSelect.tipo)));
      const igual = filas.find((f) => mismoTitulo(f.titulo, q.titulo) && mismaFecha(f.fecha, q.cuando));
      if (igual) return deTarea(igual);
    }
    if ((q.tipo === "visita" || q.tipo === "reunion") && q.contactId && q.cuando) {
      const [bk] = await db
        .select()
        .from(b)
        .where(
          scoped(
            b.organizationId,
            this.org,
            eq(b.contactId, q.contactId),
            gte(b.scheduledAt, new Date(q.cuando.getTime() - 60_000)),
            lte(b.scheduledAt, new Date(q.cuando.getTime() + 60_000)),
            sql`${b.kind} = 'session'`
          )
        )
        .limit(1);
      if (bk) return deCita(bk);
    }
    return null;
  }

  private async borrar(e: Existente) {
    if (e.cual === "tarea") {
      await getDb().delete(schema.tareaVenta).where(scoped(schema.tareaVenta.organizationId, this.org, eq(schema.tareaVenta.id, e.id)));
    } else {
      await getDb()
        .update(schema.booking)
        .set({ status: "cancelada", updatedAt: new Date() })
        .where(scoped(schema.booking.organizationId, this.org, eq(schema.booking.id, e.id)));
    }
  }

  private async actualizar(
    e: Existente,
    d: { estado: "realizar" | "no_responde" | "listo" | null; comentarios: string | null; cuando: Date | null; titulo: string; notionAt: Date }
  ) {
    if (e.cual === "tarea") {
      const set: Partial<typeof schema.tareaVenta.$inferInsert> = { comentarios: d.comentarios, updatedAt: d.notionAt };
      // Un WhatsApp programado desde el CRM no vuelve a «Pendiente» por Notion.
      if (d.estado && !(e.estado === "programado" && d.estado === "realizar")) set.estado = d.estado;
      if (d.cuando) set.fecha = d.cuando;
      await getDb().update(schema.tareaVenta).set(set).where(scoped(schema.tareaVenta.organizationId, this.org, eq(schema.tareaVenta.id, e.id)));
      return;
    }
    const set: Partial<typeof schema.booking.$inferInsert> = {
      notes: [d.titulo, d.comentarios].filter(Boolean).join("\n\n") || null,
      updatedAt: d.notionAt,
    };
    if (d.estado) set.status = ESTADO_CITA[d.estado];
    await getDb().update(schema.booking).set(set).where(scoped(schema.booking.organizationId, this.org, eq(schema.booking.id, e.id)));
    if (d.cuando && !mismaFecha(d.cuando, e.fecha)) {
      try {
        await getDb()
          .update(schema.booking)
          .set({ scheduledAt: d.cuando })
          .where(scoped(schema.booking.organizationId, this.org, eq(schema.booking.id, e.id)));
      } catch (err) {
        if (!choca(err)) throw err;
        anotar(this.informe.problemas, `La cita «${d.titulo}» no se movió: ya hay otra a esa hora`);
      }
    }
  }
}

type Existente = {
  cual: "tarea" | "cita";
  id: string;
  estado: string;
  comentarios: string | null;
  fecha: Date | null;
  /** El último cambio del CRM; null si nadie la tocó desde que se creó (importación o paso a cita). */
  updatedAt: Date | null;
};

/** Sin tocar desde que se creó: la importación o el paso a cita no cuentan como cambio. */
const tocada = (creada: Date, editada: Date): Date | null =>
  Math.abs(editada.getTime() - creada.getTime()) < 60_000 ? null : editada;

function deTarea(t: typeof schema.tareaVenta.$inferSelect): Existente {
  return { cual: "tarea", id: t.id, estado: t.estado, comentarios: t.comentarios, fecha: t.fecha, updatedAt: tocada(t.createdAt, t.updatedAt) };
}

const ESTADO_DE_CITA: Record<string, string> = { agendada: "realizar", realizada: "listo", no_show: "no_responde", cancelada: "cancelada" };

function deCita(b: typeof schema.booking.$inferSelect): Existente {
  // En la cita el comentario va junto al título: se compara la parte de después.
  const partes = (b.notes ?? "").split("\n\n");
  return {
    cual: "cita",
    id: b.id,
    estado: ESTADO_DE_CITA[b.status] ?? b.status,
    comentarios: partes.length > 1 ? partes.slice(1).join("\n\n") : null,
    fecha: b.scheduledAt,
    updatedAt: tocada(b.createdAt, b.updatedAt),
  };
}

function choca(err: unknown): boolean {
  const code = (e: unknown) => (typeof e === "object" && e !== null ? (e as { code?: unknown }).code : undefined);
  return code(err) === "23505" || code((err as { cause?: unknown })?.cause) === "23505";
}

/* ------------------------------------------------------------------
 * La pasada
 * ------------------------------------------------------------------ */

export async function sincronizarNotion(opciones: { aplicar: boolean; desde: Date }): Promise<InformeSync> {
  const t0 = Date.now();
  const informe = informeVacio(opciones.aplicar ? "aplicar" : "prueba", opciones.desde);
  const org = await resolveInstanceOrg();
  if (!org) {
    informe.problemas.push("La instancia todavía no tiene organización");
    return informe;
  }
  const s = new Sync(org, opciones.aplicar, informe);
  await s.preparar();
  const ops = await editadasDesde(BASES.oportunidades, opciones.desde);
  informe.leidas.oportunidades = ops.length;
  // De la más vieja a la más nueva: si dos apuntan al mismo contacto, se respeta el orden.
  ops.sort((a, b) => a.created_time.localeCompare(b.created_time));
  for (const p of ops) {
    try {
      await s.oportunidad(p);
    } catch (err) {
      anotar(informe.problemas, `Oportunidad ${idPlano(p.id)}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  const tareas = await editadasDesde(BASES.tareas, opciones.desde);
  informe.leidas.tareas = tareas.length;
  tareas.sort((a, b) => a.created_time.localeCompare(b.created_time));
  for (const p of tareas) {
    try {
      await s.tarea(p);
    } catch (err) {
      anotar(informe.problemas, `Tarea ${idPlano(p.id)}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  informe.segundos = Math.round((Date.now() - t0) / 1000);
  return informe;
}

/* ------------------------------------------------------------------
 * Al arrancar
 * ------------------------------------------------------------------ */

type Estado = { corriendo: boolean; timer?: ReturnType<typeof setInterval>; ultima?: Date };
const g = globalThis as unknown as { __notionSync?: Estado };

function desdeConfigurado(): Date {
  const d = instante(process.env.NOTION_SYNC_DESDE?.trim() || "2026-10-15");
  return d ?? new Date("2026-10-15T00:00:00-03:00");
}

async function pasada(aplicar: boolean) {
  const e = (g.__notionSync ??= { corriendo: false });
  if (e.corriendo) return;
  e.corriendo = true;
  const inicio = new Date();
  try {
    // La primera vez, desde la fecha configurada; después, lo de la última hora y pico.
    const desde = e.ultima ? new Date(e.ultima.getTime() - 15 * 60_000) : desdeConfigurado();
    const informe = await sincronizarNotion({ aplicar, desde });
    if (aplicar) e.ultima = inicio;
    console.log(`[notion] ${JSON.stringify(informe)}`);
  } catch (err) {
    console.error("[notion] la sincronización falló:", err instanceof Error ? err.message : err);
  } finally {
    e.corriendo = false;
  }
}

/**
 * `NOTION_SYNC=prueba` → una pasada que solo informa (en los logs, `[notion]`).
 * `NOTION_SYNC=aplicar` → guarda; con `NOTION_SYNC_CADA_MIN` repite cada N
 * minutos (lo nuevo de Notion) mientras se use. Sin `NOTION_TOKEN`, nada.
 */
export function iniciarSyncNotion(): void {
  const modo = process.env.NOTION_SYNC?.trim().toLowerCase();
  if (modo !== "prueba" && modo !== "aplicar") return;
  if (!tokenNotion()) {
    console.warn("[notion] NOTION_SYNC está puesto pero falta NOTION_TOKEN: no se sincroniza");
    return;
  }
  const aplicar = modo === "aplicar";
  setTimeout(() => void pasada(aplicar), 60_000).unref?.();
  const cada = Number(process.env.NOTION_SYNC_CADA_MIN ?? 0);
  if (aplicar && Number.isFinite(cada) && cada >= 15) {
    const e = (g.__notionSync ??= { corriendo: false });
    if (!e.timer) {
      e.timer = setInterval(() => void pasada(true), cada * 60_000);
      e.timer.unref?.();
    }
  }
}

