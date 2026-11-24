"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  BotOff,
  MessageSquareText,
  Search,
  Send,
  Upload,
  Star,
  UserPlus,
  Users,
} from "lucide-react";
import { emailOpcionalValido } from "@/lib/email";
import { TIPOS_CONTACTO, etiqueta, type TipoContacto } from "@/lib/ventas";
import type { ContactDto } from "@/lib/types";
import { cn, formatPhone } from "@/lib/utils";
import { ContactAvatar } from "@/components/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAvisoGuardado } from "@/components/ui/aviso-guardado";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SOURCE_LABELS } from "@/server/contact-source";
import { priorityRank } from "@/server/leads/priority";
import { PriorityBadge } from "@/components/pipeline/priority-picker";
import { ContactosLista } from "./contactos-lista";
import { ImportContactsDialog } from "./import-contacts-dialog";
import { NewContactDialog } from "./new-contact-dialog";
import { StartConversation } from "./start-conversation";
import { Select } from "@/components/ui/select";
import { useVocabulario } from "@/components/vocabulario";
import {
  COMENSAL_VACIO,
  SEGMENTOS,
  VISTAS_COMENSALES,
  enVista,
  fechaCorta,
  type Comensal,
  type Segmento,
  type VistaComensales,
} from "@/lib/reservas";
import { pantallaOculta } from "@/lib/vocabulario";
import type { Comensales } from "@/server/reservas/comensales";

export function ContactsClient({ reservas = false }: { reservas?: boolean }) {
  const avisar = useAvisoGuardado();
  const voc = useVocabulario();
  /** 071 — En un restaurante: lo que se cuenta de cada persona por sus reservas. */
  const [personas, setPersonas] = useState<Comensales | null>(null);
  const [vista, setVista] = useState<VistaComensales>("todos");
  const router = useRouter();
  const [contacts, setContacts] = useState<ContactDto[]>([]);
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState("all");
  const [stages, setStages] = useState<string[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<ContactDto | null>(null);
  const [creando, setCreando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [escribiendo, setEscribiendo] = useState<ContactDto | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Cambios 23/11, punto 8 — Fuera del restaurante, la lista compacta paginada en el servidor.
  const compacta = !reservas;
  const [version, setVersion] = useState(0);

  // Mismo rescate que en la Bandeja: lo tecleado antes de que hidrate el JS
  // se perdía en silencio. Ver conversation-list.tsx.
  useEffect(() => {
    const typed = inputRef.current?.value ?? "";
    if (typed) setQuery(typed);
  }, []);

  useEffect(() => {
    if (!reservas) return;
    void (async () => {
      const res = await fetch("/api/reservas/comensales").catch(() => null);
      if (res?.ok) setPersonas((await res.json()) as Comensales);
    })();
  }, [reservas]);

  useEffect(() => {
    // 071 — Sin Pipeline de leads, no hay etapas del embudo para filtrar.
    if (pantallaOculta(voc, "pipeline") || compacta) return;
    void (async () => {
      const res = await fetch("/api/pipeline/stages").catch(() => null);
      if (!res?.ok) return;
      const data = (await res.json()) as { stages: { name: string }[] };
      setStages(data.stages.map((s) => s.name));
    })();
  }, [voc, compacta]);

  const personaDe = (id: string): Comensal =>
    personas?.porContacto[id] ?? { ...COMENSAL_VACIO, segmento: "nuevo" };
  const cuantos = (v: VistaComensales) =>
    personas ? contacts.filter((c) => enVista(personaDe(c.id), v, personas.hoy)).length : 0;
  const visibles =
    personas && vista !== "todos" ? contacts.filter((c) => enVista(personaDe(c.id), vista, personas.hoy)) : contacts;

  const refetch = useCallback(async () => {
    if (compacta) {
      setVersion((v) => v + 1);
      return;
    }
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (stage !== "all") params.set("stage", stage);
    if (showArchived) params.set("archived", "true");
    const res = await fetch(`/api/contacts?${params}`).catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as { contacts: ContactDto[] };
    // A quién llamar primero: alta arriba, sin prioridad al final. El orden lo
    // decide esta lista, no el servidor, porque es una preferencia de trabajo y
    // no un dato del contacto.
    setContacts(
      [...data.contacts].sort(
        (a, b) => priorityRank(a.priority ?? null) - priorityRank(b.priority ?? null)
      )
    );
  }, [query, stage, showArchived, compacta]);

  useEffect(() => {
    const t = setTimeout(() => void refetch(), 250);
    return () => clearTimeout(t);
  }, [refetch]);

  async function patch(id: string, body: Record<string, unknown>, aviso?: string) {
    const res = await fetch(`/api/contacts/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    if (aviso) avisar(res?.ok ? aviso : "No se pudieron guardar los cambios", res?.ok ? "ok" : "error");
    void refetch();
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:gap-4 sm:px-6 sm:py-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[17px] font-bold tracking-tight">Contactos</h2>
          <Button size="sm" onClick={() => setCreando(true)}>
            <UserPlus className="mr-1.5 h-4 w-4" strokeWidth={1.8} />
            Nuevo contacto
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setImportando(true)}>
            <Upload className="mr-1.5 h-4 w-4" strokeWidth={1.8} />
            Importar
          </Button>
        </div>
        {!compacta && (
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:gap-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="accent-primary"
            />
            Ver archivados
          </label>
          {stages.length > 0 && (
            <Select
              value={stage}
              onValueChange={(valor) => setStage(valor)}
              aria-label="Filtrar por etapa del embudo"
              className="w-auto min-w-40"
            >
              <option value="all">Toda etapa</option>
              {stages.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          )}
          <div className="relative w-full sm:w-auto">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              ref={inputRef}
              placeholder="Buscar por nombre o teléfono…"
              aria-label="Buscar contacto"
              defaultValue=""
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-8 sm:w-72"
            />
          </div>
        </div>
        )}
      </header>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {compacta ? (
          <ContactosLista
            version={version}
            onEditar={setEditing}
            onEscribir={setEscribiendo}
            onArchivar={(c) => void patch(c.id, { archived: !c.archivedAt })}
          />
        ) : (
          <>
        {personas && contacts.length > 0 && (
          <div role="tablist" aria-label="Vistas de contactos" className="mb-4 flex flex-wrap gap-1.5">
            {VISTAS_COMENSALES.map((v) => (
              <button
                key={v.value}
                type="button"
                role="tab"
                aria-selected={vista === v.value}
                onClick={() => setVista(v.value)}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors",
                  vista === v.value ? "border-foreground bg-foreground text-background" : "bg-card text-text-2 hover:text-foreground"
                )}
              >
                {v.label}
                <span className={cn("text-[12px] tabular-nums", vista === v.value ? "opacity-70" : "text-text-3")}>
                  {cuantos(v.value)}
                </span>
              </button>
            ))}
          </div>
        )}
        {personas && contacts.length > 0 && visibles.length === 0 && (
          <p className="text-sm text-text-3">Nadie en esta vista.</p>
        )}
        {contacts.length === 0 ? (
          query.trim() || stage !== "all" ? (
            <EmptyState
              icon={Search}
              className="h-full"
              title="Sin resultados"
              description={
                <>
                  Nadie coincide con
                  {query.trim() ? ` «${query.trim()}»` : ""}
                  {query.trim() && stage !== "all" ? " en" : ""}
                  {stage !== "all" ? ` la etapa «${stage}»` : ""}.
                </>
              }
            />
          ) : (
            <EmptyState
              icon={Users}
              className="h-full"
              title="Sin contactos"
              description="Cada persona que escriba a tu WhatsApp quedará registrada aquí automáticamente."
            />
          )
        ) : (
          <ul className="space-y-2">
            {visibles.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-card px-3 py-3 sm:flex-nowrap sm:gap-x-4 sm:px-4"
              >
                <ContactAvatar name={c.name} seed={c.id} />
                {/* El 60% mínimo es lo que empuja los botones a su propio
                    renglón en el teléfono en vez de exprimir el nombre. */}
                <div className="min-w-[60%] flex-1 sm:min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {c.name}
                    </span>
                    {c.priority && <PriorityBadge value={c.priority} />}
                    {c.stageName && !pantallaOculta(voc, "pipeline") && (
                      <Badge variant="outline">{c.stageName}</Badge>
                    )}
                    {c.archivedAt && (
                      <Badge variant="secondary">Archivado</Badge>
                    )}
                    {personas && <SegmentoBadge segmento={personaDe(c.id).segmento} />}
                    {c.aiPaused && (
                      <Badge
                        variant="warning"
                        title="El agente no le responde a este contacto: lo atiendes tú"
                      >
                        <BotOff className="mr-1 h-3 w-3" strokeWidth={1.8} />
                        Sin agente
                      </Badge>
                    )}
                    {/* Solo la fuente que alguien capturó: presentar una
                        deducción como dato la volvería un número inventado en
                        cuanto se cuente por fuente. */}
                    {/* 068 */}
                    {(c.tiposContacto ?? []).map((t) => (
                      <Badge key={t} variant="secondary">
                        {etiqueta(TIPOS_CONTACTO, t)}
                      </Badge>
                    ))}
                    {/* 071 — En un restaurante «Otro» es quien entró por una reserva: no dice nada. */}
                    {c.source?.source === "capturada" && !(personas && c.source.value === "otro") && (
                      <Badge variant="secondary">
                        {SOURCE_LABELS[c.source.value]}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatPhone(c.phone)}
                    {c.email ? ` · ${c.email}` : ""}
                    {c.notes ? ` · ${c.notes.slice(0, 60)}` : ""}
                  </p>
                  {personas && <ResumenPersona c={personaDe(c.id)} />}
                </div>
                <div className="ml-auto flex shrink-0 items-center gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditing(c)}
                  >
                    Editar
                  </Button>
                  {/* A quien nunca escribió hay que abrirle la conversación con
                      una plantilla: es regla de Meta, no del CRM. */}
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Escribir primero"
                    title="Escribir primero (con plantilla)"
                    onClick={() => setEscribiendo(c)}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                  <Link href={`/inbox?contact=${c.id}`}>
                    <Button variant="ghost" size="icon" aria-label="Abrir conversación">
                      <MessageSquareText className="h-4 w-4" />
                    </Button>
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={c.archivedAt ? "Desarchivar" : "Archivar"}
                    onClick={() => void patch(c.id, { archived: !c.archivedAt })}
                  >
                    {c.archivedAt ? (
                      <ArchiveRestore className="h-4 w-4" />
                    ) : (
                      <Archive className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
          </>
        )}
      </div>

      {editing && (
        <EditDialog
          contact={editing}
          onClose={() => setEditing(null)}
          onSave={async (patchBody) => {
            await patch(editing.id, patchBody, "Cambios aplicados");
            setEditing(null);
          }}
        />
      )}

      {escribiendo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Escribir primero"
        >
          <div className="w-full max-w-md rounded-lg border bg-popover p-4 shadow-pop">
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <h3 className="font-semibold">
                Escribir a {escribiendo.name}
              </h3>
              <Button variant="ghost" size="sm" onClick={() => setEscribiendo(null)}>
                Cerrar
              </Button>
            </div>
            <StartConversation
              contactId={escribiendo.id}
              onStarted={() => {
                const contactId = escribiendo.id;
                setEscribiendo(null);
                // La Bandeja resuelve por CONTACTO (`?contact=`), no por
                // conversación: con `?conversation=` no seleccionaría nada.
                router.push(`/inbox?contact=${contactId}`);
              }}
            />
          </div>
        </div>
      )}

      {importando && (
        <ImportContactsDialog
          onClose={() => setImportando(false)}
          onImported={() => void refetch()}
        />
      )}

      {creando && (
        <NewContactDialog
          onClose={() => setCreando(false)}
          onCreated={() => {
            setCreando(false);
            avisar("Contacto creado");
            void refetch();
          }}
          onOpenExisting={(contactId) => {
            setCreando(false);
            router.push(`/inbox?contact=${contactId}`);
          }}
        />
      )}
    </div>
  );
}

function EditDialog({
  contact,
  onClose,
  onSave,
}: {
  contact: ContactDto;
  onClose: () => void;
  onSave: (patch: {
    name: string;
    notes: string;
    email?: string | null;
    tiposContacto?: TipoContacto[];
    aiPaused?: boolean;
  }) => Promise<void>;
}) {
  const voc = useVocabulario();
  const [name, setName] = useState(contact.name);
  const [email, setEmail] = useState(contact.email ?? "");
  const [tiposContacto, setTiposContacto] = useState<string[]>(contact.tiposContacto ?? []);
  const [notes, setNotes] = useState(contact.notes ?? "");
  const emailValido = emailOpcionalValido(email);
  const [aiPaused, setAiPaused] = useState(contact.aiPaused ?? false);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-overlay p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-lg border bg-popover p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 font-semibold">Editar contacto</h3>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="edit-name">
              Nombre
            </label>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          {voc.inmobiliario && (
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="edit-tipo">
              Tipo de contacto
            </label>
            <Select
              id="edit-tipo"
              multiple
              values={tiposContacto}
              placeholder="Sin clasificar"
              onValuesChange={setTiposContacto}
              className="w-full"
            >
              {TIPOS_CONTACTO.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </div>
          )}
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="edit-email">
              Correo electrónico (opcional)
            </label>
            <Input
              id="edit-email"
              type="email"
              inputMode="email"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nombre@empresa.com"
              aria-invalid={!emailValido}
            />
            {!emailValido && (
              <p className="text-[11px] text-danger-text">
                Revisá el correo: tiene que ser del tipo nombre@dominio.com
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="edit-notes">
              Notas
            </label>
            <Textarea
              id="edit-notes"
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          {/* 027 */}
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={aiPaused}
              onChange={(e) => setAiPaused(e.target.checked)}
              className="mt-0.5 accent-primary"
            />
            <span>
              El agente no le responde
              <span className="block text-[11px] text-text-3">
                Sus mensajes llegan a la Bandeja y los atiendes tú.
              </span>
            </span>
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={!name.trim() || !emailValido}
            onClick={() =>
              void onSave({
                name: name.trim(),
                notes,
                // Solo si cambió; vacío lo borra.
                ...(tiposContacto.join() !== (contact.tiposContacto ?? []).join()
                  ? { tiposContacto: tiposContacto as TipoContacto[] }
                  : {}),
                ...(email.trim() !== (contact.email ?? "")
                  ? { email: email.trim() || null }
                  : {}),
                // Solo si cambió: mandarlo siempre reescribiría el interruptor
                // de la Bandeja cada vez que alguien corrige un nombre.
                ...(aiPaused !== (contact.aiPaused ?? false) ? { aiPaused } : {}),
              })
            }
          >
            Guardar
          </Button>
        </div>
      </div>
    </div>
  );
}

/** 071 — Nuevo, Cliente o Habitual. */
export function SegmentoBadge({ segmento }: { segmento: Segmento }) {
  const label = SEGMENTOS.find((x) => x.value === segmento)?.label ?? segmento;
  return (
    <Badge variant={segmento === "habitual" ? "success" : segmento === "cliente" ? "default" : "secondary"}>
      {segmento === "habitual" && <Star className="mr-1 h-3 w-3" strokeWidth={1.8} />}
      {label}
    </Badge>
  );
}

/** 071 — El contador de una persona en la lista: reservas, visitas, última y faltas. */
function ResumenPersona({ c }: { c: Comensal }) {
  const partes = [
    `${c.reservas} reserva${c.reservas === 1 ? "" : "s"}`,
    `${c.visitas} visita${c.visitas === 1 ? "" : "s"}`,
    c.ultimaVisita ? `última ${fechaCorta(c.ultimaVisita)}` : null,
    c.proxima ? `próxima ${fechaCorta(c.proxima.fecha)} ${c.proxima.hora}` : null,
  ].filter(Boolean);
  return (
    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-text-2">
      <span>{partes.join(" · ")}</span>
      {c.noVino > 0 && (
        <span className="text-danger-text">
          faltó {c.noVino} {c.noVino === 1 ? "vez" : "veces"}
        </span>
      )}
      {c.aceptaPromociones && <span className="text-success-text">acepta promociones</span>}
    </p>
  );
}
