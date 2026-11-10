"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  CalendarDays,
  ChevronDown,
  ListTodo,
  Mail,
  Phone,
  Plus,
  Rows3,
  Send,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAvisoGuardado } from "@/components/ui/aviso-guardado";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { WhatsAppLogo } from "@/components/whatsapp-logo";
import type { FormaDeVer } from "@/lib/oportunidades-lista";
import { agruparTareas, fechaPropuesta, grupoConAlta, type GrupoTarea } from "@/lib/tareas-grupos";
import { cn } from "@/lib/utils";
import { ESTADOS_TAREA, TIPOS_TAREA, etiqueta } from "@/lib/ventas";
import type { OportunidadDto, TareaDto } from "@/server/ventas";
import { SelectorDeForma } from "./oportunidades-vistas";
import { PildoraEdificio } from "./pildora-edificio";
import { Acciones, Campo, EstadoPill, Ficha, Pagina, aLocal, fechaVisible, grilla, mensajeDe } from "./ui";

/**
 * Tareas (rediseño, PR 6): Lista, Mosaico y Pipeline; filtros de estado
 * (Realizar por defecto · No responde · Todas · Listo), responsables con
 * avatares, y agrupación por fecha (Sin fecha arriba, Vencidas, Hoy, Mañana,
 * Esta semana, Más adelante, Anteriores plegado) con «+» para crear una
 * tarea ya fechada. En el Pipeline se arrastra para cambiar el estado.
 */

type Contacto = { id: string; name: string | null; phone: string | null };
type Miembro = { userId: string; nombre: string };

type Formulario = {
  titulo: string;
  tipo: string;
  estado: string;
  fecha: string;
  comentarios: string;
  contactId: string;
  oportunidadId: string;
  responsableId: string;
};

const vacio: Formulario = {
  titulo: "",
  tipo: "llamada",
  estado: "realizar",
  fecha: "",
  comentarios: "",
  contactId: "",
  oportunidadId: "",
  responsableId: "",
};

type FiltroEstado = "realizar" | "no_responde" | "todas" | "listo";
const FILTROS: { value: FiltroEstado; label: string }[] = [
  { value: "realizar", label: "Realizar" },
  { value: "no_responde", label: "No responde" },
  { value: "todas", label: "Todas" },
  { value: "listo", label: "Listo" },
];

const SIN = "sin";
const GUARDADO = "tareas.vista.v1";

/** El ícono de cada tipo, en un cuadradito de color. */
function IconoTipo({ tipo }: { tipo: string }) {
  const estilo: Record<string, string> = {
    mensaje: "bg-success-tint text-success-text",
    llamada: "bg-info-tint text-info-text",
    visita: "bg-brand-tint text-brand-ink",
    correo: "bg-warning-tint text-warning-text",
    reunion: "bg-muted text-text-2",
  };
  const Icono = { llamada: Phone, visita: CalendarDays, correo: Send, reunion: Users }[tipo] ?? Mail;
  return (
    <span className={cn("grid size-7 shrink-0 place-items-center rounded-md", estilo[tipo] ?? "bg-muted text-text-2")}>
      {tipo === "mensaje" ? <WhatsAppLogo className="size-3.5" /> : <Icono className="size-3.5" />}
    </span>
  );
}

function Iniciales({ nombre, className }: { nombre: string; className?: string }) {
  const p = nombre.trim().split(/\s+/);
  return (
    <span
      className={cn(
        "grid size-6 shrink-0 place-items-center rounded-full bg-brand-soft text-[10px] font-bold text-brand-ink",
        className
      )}
    >
      {((p[0]?.[0] ?? "?") + (p[1]?.[0] ?? "")).toUpperCase()}
    </span>
  );
}

export function TareasClient() {
  const avisar = useAvisoGuardado();
  const [filas, setFilas] = useState<TareaDto[]>([]);
  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [oportunidades, setOportunidades] = useState<OportunidadDto[]>([]);
  const [equipo, setEquipo] = useState<Miembro[]>([]);
  const [filtro, setFiltro] = useState<FiltroEstado>("realizar");
  const [responsables, setResponsables] = useState<string[]>([]);
  const [forma, setForma] = useState<FormaDeVer>("lista");
  const [agrupar, setAgrupar] = useState(true);
  const [plegados, setPlegados] = useState<Partial<Record<GrupoTarea, boolean>>>({});
  const [abierto, setAbierto] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [form, setForm] = useState<Formulario>(vacio);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);
  const [arrastrando, setArrastrando] = useState<string | null>(null);

  // La forma de ver y la agrupación se recuerdan en este navegador.
  useEffect(() => {
    try {
      const g = JSON.parse(window.localStorage.getItem(GUARDADO) ?? "null") as {
        forma?: FormaDeVer;
        agrupar?: boolean;
      } | null;
      if (g?.forma) setForma(g.forma);
      if (typeof g?.agrupar === "boolean") setAgrupar(g.agrupar);
    } catch {
      // sin almacenamiento
    }
  }, []);
  function recordar(cambios: { forma?: FormaDeVer; agrupar?: boolean }) {
    try {
      window.localStorage.setItem(GUARDADO, JSON.stringify({ forma, agrupar, ...cambios }));
    } catch {
      // sin almacenamiento
    }
  }

  const cargar = useCallback(async () => {
    const res = await fetch("/api/tareas").catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as { tareas: TareaDto[] };
    setFilas(data.tareas);
    setListo(true);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    void (async () => {
      const [c, o, e] = await Promise.all([
        fetch("/api/contacts").catch(() => null),
        fetch("/api/oportunidades").catch(() => null),
        fetch("/api/equipo").catch(() => null),
      ]);
      if (c?.ok) setContactos(((await c.json()) as { contacts: Contacto[] }).contacts);
      if (o?.ok) setOportunidades(((await o.json()) as { oportunidades: OportunidadDto[] }).oportunidades);
      if (e?.ok) setEquipo(((await e.json()) as { equipo: Miembro[] }).equipo);
    })();
  }, []);

  function abrirNueva(fecha: string | null = null) {
    setEditando(null);
    setForm({ ...vacio, fecha: fecha ?? "" });
    setError(null);
    setAbierto(true);
  }

  function abrir(t: TareaDto) {
    setEditando(t.id);
    setForm({
      titulo: t.titulo,
      tipo: t.tipo,
      estado: t.estado,
      fecha: aLocal(t.fecha),
      comentarios: t.comentarios ?? "",
      contactId: t.contactId ?? "",
      oportunidadId: t.oportunidadId ?? "",
      responsableId: t.responsableId ?? "",
    });
    setError(null);
    setAbierto(true);
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const oportunidad = oportunidades.find((o) => o.id === form.oportunidadId);
    const res = await fetch(editando ? `/api/tareas/${editando}` : "/api/tareas", {
      method: editando ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        titulo: form.titulo,
        tipo: form.tipo,
        estado: form.estado,
        fecha: form.fecha || null,
        comentarios: form.comentarios || null,
        contactId: form.contactId || oportunidad?.contactId || null,
        oportunidadId: form.oportunidadId || null,
        ...(equipo.length ? { responsableId: form.responsableId || null } : {}),
      }),
    }).catch(() => null);
    if (!res?.ok) {
      setError(res ? await mensajeDe(res) : "No se pudo guardar");
      return;
    }
    avisar(editando ? "Cambios aplicados" : "Tarea creada");
    setAbierto(false);
    setEditando(null);
    void cargar();
  }

  async function eliminar() {
    if (!editando || !window.confirm("¿Borrar esta tarea?")) return;
    const res = await fetch(`/api/tareas/${editando}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok && res?.status !== 204) {
      setError(res ? await mensajeDe(res) : "No se pudo borrar");
      return;
    }
    avisar("Tarea eliminada");
    setAbierto(false);
    void cargar();
  }

  /** Pipeline: soltar una tarjeta en otra columna cambia el estado. */
  async function mover(t: TareaDto, estado: string) {
    if (t.estado === estado) return;
    setFilas((fs) => fs.map((x) => (x.id === t.id ? { ...x, estado: estado as TareaDto["estado"] } : x)));
    const res = await fetch(`/api/tareas/${t.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        titulo: t.titulo,
        tipo: t.tipo,
        estado,
        fecha: t.fecha ? aLocal(t.fecha) : null,
        comentarios: t.comentarios,
        contactId: t.contactId,
        oportunidadId: t.oportunidadId,
      }),
    }).catch(() => null);
    if (!res?.ok) avisar(res ? await mensajeDe(res) : "No se pudo mover", "error");
    void cargar();
  }

  const ahora = useMemo(() => new Date(), [filas]); // eslint-disable-line react-hooks/exhaustive-deps
  const deResponsable = filas.filter(
    (t) => !responsables.length || responsables.includes(t.responsableId ?? SIN)
  );
  const visibles = forma === "pipeline" || filtro === "todas" ? deResponsable : deResponsable.filter((t) => t.estado === filtro);
  const grupos: Grupo[] = agrupar
    ? agruparTareas(visibles, ahora)
    : [{ clave: "todas", titulo: "", plegado: false, tareas: [...visibles].sort((a, b) => (a.fecha ?? "").localeCompare(b.fecha ?? "")) }];
  const plegado = (g: { clave: string; plegado: boolean }) => plegados[g.clave as GrupoTarea] ?? g.plegado;
  const alternar = (clave: string, actual: boolean) => setPlegados((p) => ({ ...p, [clave]: !actual }));

  return (
    <Pagina
      titulo="Tareas"
      detalle="Llamadas, visitas y mensajes que hace una persona. La IA no las crea."
      accion={
        <div className="flex flex-wrap items-center gap-2">
          <SelectorDeForma
            forma={forma}
            onCambio={(f) => {
              setForma(f);
              recordar({ forma: f });
            }}
          />
          <Button size="sm" onClick={() => abrirNueva()}>
            <Plus className="h-4 w-4" strokeWidth={1.8} />
            Nueva tarea
          </Button>
        </div>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {forma !== "pipeline" &&
          FILTROS.map((o) => (
            <Button
              key={o.value}
              type="button"
              size="sm"
              variant={filtro === o.value ? "default" : "secondary"}
              aria-pressed={filtro === o.value}
              onClick={() => setFiltro(o.value)}
            >
              {o.label}
            </Button>
          ))}
        {equipo.length > 0 && (
          <div role="group" aria-label="Filtrar por responsable" className="ml-1 inline-flex items-center gap-2 border-l border-border pl-3 text-[13px]">
            <span className="text-text-3">Responsable</span>
            <span className="flex -space-x-1">
              {[...equipo.map((m) => ({ id: m.userId, nombre: m.nombre })), { id: SIN, nombre: "Sin asignar" }].map((m) => {
                const on = responsables.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={on}
                    aria-label={m.nombre}
                    title={m.nombre}
                    onClick={() => setResponsables((r) => (on ? r.filter((x) => x !== m.id) : [...r, m.id]))}
                    className={cn(
                      "relative grid size-7 place-items-center rounded-full border-2 border-card transition hover:z-10 hover:-translate-y-0.5",
                      m.id === SIN
                        ? "border-[1.5px] border-dashed border-border-strong bg-card text-text-3"
                        : "bg-brand-soft text-[10.5px] font-bold text-brand-ink",
                      on && "z-10 ring-2 ring-brand",
                      responsables.length > 0 && !on && "opacity-40"
                    )}
                  >
                    {m.id === SIN ? <Users className="size-3.5" /> : <Iniciales nombre={m.nombre} className="size-auto bg-transparent" />}
                  </button>
                );
              })}
            </span>
          </div>
        )}
        <span className="flex-1" />
        {forma === "pipeline" ? (
          <span className="text-[12.5px] text-text-3">Una columna por estado · arrastrá para cambiarlo</span>
        ) : (
          <div role="tablist" aria-label="Agrupar" className="inline-flex gap-0.5 rounded-full bg-muted p-[3px] text-[13px]">
            {(
              [
                [true, "Por fecha", CalendarDays],
                [false, "Sin agrupar", Rows3],
              ] as const
            ).map(([valor, texto, Icono]) => (
              <button
                key={texto}
                type="button"
                role="tab"
                aria-selected={agrupar === valor}
                onClick={() => {
                  setAgrupar(valor);
                  recordar({ agrupar: valor });
                }}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-full px-3 font-medium",
                  agrupar === valor ? "bg-card text-foreground shadow-sm" : "text-text-2 hover:text-foreground"
                )}
              >
                <Icono className="size-3.5" />
                {texto}
              </button>
            ))}
          </div>
        )}
      </div>

      {abierto && (
        <Ficha titulo={editando ? "Editar tarea" : "Nueva tarea"}>
          <form onSubmit={guardar} className={grilla}>
            <Campo label="Qué hay que hacer" className="sm:col-span-2">
              <Input
                value={form.titulo}
                onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                required
                maxLength={200}
                placeholder="Llamar para coordinar la visita"
              />
            </Campo>
            <Campo label="Tipo">
              <Select value={form.tipo} onValueChange={(tipo) => setForm({ ...form, tipo })}>
                {TIPOS_TAREA.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo label="Estado">
              <Select value={form.estado} onValueChange={(estado) => setForm({ ...form, estado })}>
                {ESTADOS_TAREA.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo label="Fecha">
              <Input
                type="datetime-local"
                value={form.fecha}
                onChange={(e) => setForm({ ...form, fecha: e.target.value })}
              />
            </Campo>
            {equipo.length > 0 && (
              <Campo label="Responsable">
                <Select
                  value={form.responsableId}
                  onValueChange={(responsableId) => setForm({ ...form, responsableId })}
                  placeholder={editando ? "Sin asignar" : "Yo"}
                >
                  <option value="">{editando ? "Sin asignar" : "Yo (quien la crea)"}</option>
                  {equipo.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.nombre}
                    </option>
                  ))}
                </Select>
              </Campo>
            )}
            <Campo label="Oportunidad">
              <Select
                value={form.oportunidadId}
                onValueChange={(oportunidadId) => {
                  const op = oportunidades.find((o) => o.id === oportunidadId);
                  setForm({ ...form, oportunidadId, contactId: form.contactId || op?.contactId || "" });
                }}
              >
                <option value="">Sin oportunidad</option>
                {oportunidades.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nombre}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo label="Contacto">
              <Select value={form.contactId} onValueChange={(contactId) => setForm({ ...form, contactId })}>
                <option value="">Sin contacto</option>
                {contactos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name || c.phone || c.id}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo label="Comentarios" className="sm:col-span-2 lg:col-span-3">
              <Textarea
                value={form.comentarios}
                onChange={(e) => setForm({ ...form, comentarios: e.target.value })}
                maxLength={4000}
                placeholder="Lo que hay que tener a mano cuando se haga"
              />
            </Campo>
            <Acciones error={error}>
              <Button type="submit" size="sm">
                Guardar
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setAbierto(false)}>
                Cancelar
              </Button>
              {editando && (
                <Button type="button" size="sm" variant="outline" onClick={() => void eliminar()}>
                  Eliminar
                </Button>
              )}
            </Acciones>
          </form>
        </Ficha>
      )}

      {listo && filas.length === 0 && !abierto ? (
        <EmptyState
          icon={ListTodo}
          title="No hay tareas"
          description="Acá van las acciones de una persona: una llamada, una visita o un mensaje que la IA no manda."
          action={
            <Button size="sm" onClick={() => abrirNueva()}>
              Nueva tarea
            </Button>
          }
        />
      ) : forma === "pipeline" ? (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {ESTADOS_TAREA.map((col) => {
            const items = [...visibles]
              .filter((t) => t.estado === col.value)
              .sort((a, b) => (a.fecha ?? "").localeCompare(b.fecha ?? ""));
            return (
              <section
                key={col.value}
                onDragOver={(e) => {
                  if (arrastrando) e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const t = filas.find((x) => x.id === arrastrando);
                  setArrastrando(null);
                  if (t) void mover(t, col.value);
                }}
                className="flex w-72 shrink-0 flex-col gap-2 rounded-[10px] border border-border bg-subtle p-2.5"
              >
                <header className="flex items-center gap-2 px-1 pb-1">
                  <span className="text-[13.5px] font-semibold">{col.label}</span>
                  <span className="rounded-full bg-muted px-[7px] py-px text-[11.5px] font-semibold text-text-2">
                    {items.length}
                  </span>
                </header>
                {items.map((t) => (
                  <TarjetaTarea
                    key={t.id}
                    t={t}
                    onAbrir={abrir}
                    arrastrable
                    onArrastrar={(id) => setArrastrando(id)}
                  />
                ))}
                {items.length === 0 && <p className="px-1 py-3 text-center text-[12px] text-text-3">Nada acá</p>}
              </section>
            );
          })}
        </div>
      ) : visibles.length === 0 ? (
        <p className="py-10 text-center text-sm text-text-3">Nada en este estado.</p>
      ) : forma === "mosaico" ? (
        <div className="space-y-5">
          {grupos.map((g) => (
            <section key={g.clave}>
              {agrupar && (
                <CabeceraGrupo
                  g={g}
                  abierto={!plegado(g)}
                  onAlternar={() => alternar(g.clave, plegado(g))}
                  onAgregar={
                    g.clave !== "todas" && grupoConAlta(g.clave as GrupoTarea, ahora)
                      ? () => abrirNueva(fechaPropuesta(g.clave as GrupoTarea, ahora))
                      : undefined
                  }
                />
              )}
              {!plegado(g) && (
                <div className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3">
                  {g.tareas.map((t) => (
                    <TarjetaTarea key={t.id} t={t} onAbrir={abrir} conEstado />
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[980px] border-collapse text-left text-sm">
            <thead className="border-b bg-subtle">
              <tr className="text-xs font-medium text-text-3">
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Tarea</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Contacto</th>
                <th className="px-3 py-2">Oportunidad</th>
                <th className="px-3 py-2" title="Propiedad relacionada: sale de la oportunidad">
                  Edificio
                </th>
                {equipo.length > 0 && <th className="px-3 py-2">Responsable</th>}
              </tr>
            </thead>
            <tbody>
              {grupos.map((g) => (
                <GrupoEnTabla
                  key={g.clave}
                  g={g}
                  agrupado={agrupar}
                  abierto={!plegado(g)}
                  columnas={equipo.length > 0 ? 8 : 7}
                  conResponsable={equipo.length > 0}
                  onAlternar={() => alternar(g.clave, plegado(g))}
                  onAgregar={
                    g.clave !== "todas" && grupoConAlta(g.clave as GrupoTarea, ahora)
                      ? () => abrirNueva(fechaPropuesta(g.clave as GrupoTarea, ahora))
                      : undefined
                  }
                  onAbrir={abrir}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Pagina>
  );
}

type Grupo = { clave: string; titulo: string; plegado: boolean; tareas: TareaDto[] };

function CabeceraGrupo({
  g,
  abierto,
  onAlternar,
  onAgregar,
}: {
  g: Grupo;
  abierto: boolean;
  onAlternar: () => void;
  onAgregar?: () => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-expanded={abierto}
        onClick={onAlternar}
        className={cn(
          "-ml-1 inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[13px] font-semibold hover:bg-accent",
          g.clave === "vencidas" && "text-danger-text"
        )}
      >
        <ChevronDown className={cn("size-3.5 transition-transform", !abierto && "-rotate-90")} />
        {g.titulo}
        <span className="rounded-full bg-muted px-[7px] py-px text-[11px] font-semibold text-text-2">{g.tareas.length}</span>
      </button>
      {onAgregar && (
        <button
          type="button"
          onClick={onAgregar}
          aria-label={`Nueva tarea en ${g.titulo}`}
          title={`Nueva tarea en ${g.titulo}`}
          className="grid size-6 place-items-center rounded-md text-text-3 hover:bg-accent hover:text-foreground"
        >
          <Plus className="size-3.5" />
        </button>
      )}
    </div>
  );
}

function GrupoEnTabla({
  g,
  agrupado,
  abierto,
  columnas,
  conResponsable,
  onAlternar,
  onAgregar,
  onAbrir,
}: {
  g: Grupo;
  agrupado: boolean;
  abierto: boolean;
  columnas: number;
  conResponsable: boolean;
  onAlternar: () => void;
  onAgregar?: () => void;
  onAbrir: (t: TareaDto) => void;
}) {
  return (
    <>
      {agrupado && (
        <tr className="border-b bg-card">
          <td colSpan={columnas} className="px-3 py-1.5">
            <CabeceraGrupo g={g} abierto={abierto} onAlternar={onAlternar} onAgregar={onAgregar} />
          </td>
        </tr>
      )}
      {abierto &&
        g.tareas.map((t) => (
          <tr
            key={t.id}
            className="cursor-pointer border-b last:border-0 hover:bg-accent/40"
            onClick={() => onAbrir(t)}
          >
            <td className="px-3 py-2">
              <span className="inline-flex items-center gap-2">
                <IconoTipo tipo={t.tipo} />
                <span className="text-text-2">{etiqueta(TIPOS_TAREA, t.tipo)}</span>
              </span>
            </td>
            <td className="px-3 py-2 font-medium">{t.titulo}</td>
            <td className="px-3 py-2">
              <EstadoPill opciones={ESTADOS_TAREA} value={t.estado} />
            </td>
            <td className="whitespace-nowrap px-3 py-2 text-text-2">{fechaVisible(t.fecha)}</td>
            <td className="px-3 py-2">{t.contactoNombre || "—"}</td>
            <td className="px-3 py-2">
              {t.oportunidadId ? (
                <Link
                  href={`/oportunidades/${t.oportunidadId}`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-brand-ink hover:underline"
                >
                  {t.oportunidadNombre ?? "Oportunidad"}
                </Link>
              ) : (
                "—"
              )}
            </td>
            <td className="px-3 py-2">
              {t.edificio ? <PildoraEdificio nombre={t.edificio.nombre} color={t.edificio.color} /> : "—"}
            </td>
            {conResponsable && (
              <td className="px-3 py-2">
                {t.responsableNombre ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Iniciales nombre={t.responsableNombre} />
                    {t.responsableNombre}
                  </span>
                ) : (
                  <span className="text-text-3">Sin asignar</span>
                )}
              </td>
            )}
          </tr>
        ))}
    </>
  );
}

function TarjetaTarea({
  t,
  onAbrir,
  conEstado,
  arrastrable,
  onArrastrar,
}: {
  t: TareaDto;
  onAbrir: (t: TareaDto) => void;
  conEstado?: boolean;
  arrastrable?: boolean;
  onArrastrar?: (id: string) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      draggable={arrastrable}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onArrastrar?.(t.id);
      }}
      onClick={() => onAbrir(t)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onAbrir(t);
      }}
      className={cn(
        "flex cursor-pointer flex-col gap-2 rounded-[10px] border border-border bg-card p-3 text-[13px] hover:border-border-strong hover:shadow-sm",
        arrastrable && "active:cursor-grabbing"
      )}
    >
      <div className="flex items-start gap-2.5">
        <IconoTipo tipo={t.tipo} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{t.titulo}</p>
          <p className="text-[12px] text-text-3">
            {etiqueta(TIPOS_TAREA, t.tipo)} · {fechaVisible(t.fecha)}
          </p>
        </div>
        {t.responsableNombre && <Iniciales nombre={t.responsableNombre} />}
      </div>
      {(t.edificio || t.oportunidadId) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {t.edificio && <PildoraEdificio nombre={t.edificio.nombre} color={t.edificio.color} />}
          {t.oportunidadId && (
            <Link
              href={`/oportunidades/${t.oportunidadId}`}
              onClick={(e) => e.stopPropagation()}
              className="truncate text-[12.5px] text-brand-ink hover:underline"
            >
              {t.oportunidadNombre ?? "Oportunidad"}
            </Link>
          )}
        </div>
      )}
      {conEstado && (
        <div>
          <EstadoPill opciones={ESTADOS_TAREA} value={t.estado} />
        </div>
      )}
    </div>
  );
}
