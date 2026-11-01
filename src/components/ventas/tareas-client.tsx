"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ListTodo, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ESTADOS_TAREA, TIPOS_TAREA, etiqueta } from "@/lib/ventas";
import type { OportunidadDto, TareaDto } from "@/server/ventas";
import {
  Acciones,
  Campo,
  EstadoPill,
  Ficha,
  Pagina,
  SelectNativo,
  Tabla,
  Td,
  Th,
  aLocal,
  fechaVisible,
  grilla,
  mensajeDe,
} from "./ui";

type Contacto = { id: string; name: string | null; phone: string | null };

type Formulario = {
  titulo: string;
  tipo: string;
  estado: string;
  fecha: string;
  comentarios: string;
  contactId: string;
  oportunidadId: string;
};

const vacio: Formulario = {
  titulo: "",
  tipo: "llamada",
  estado: "realizar",
  fecha: "",
  comentarios: "",
  contactId: "",
  oportunidadId: "",
};

export function TareasClient() {
  const [filas, setFilas] = useState<TareaDto[]>([]);
  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [oportunidades, setOportunidades] = useState<OportunidadDto[]>([]);
  const [filtro, setFiltro] = useState("todas");
  const [abierto, setAbierto] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [form, setForm] = useState<Formulario>(vacio);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  const cargar = useCallback(async () => {
    const params = filtro === "todas" ? "" : `?estado=${filtro}`;
    const res = await fetch(`/api/tareas${params}`).catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as { tareas: TareaDto[] };
    setFilas(data.tareas);
    setListo(true);
  }, [filtro]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    void (async () => {
      const [c, o] = await Promise.all([
        fetch("/api/contacts").catch(() => null),
        fetch("/api/oportunidades").catch(() => null),
      ]);
      if (c?.ok) {
        const data = (await c.json()) as { contacts: Contacto[] };
        setContactos(data.contacts);
      }
      if (o?.ok) {
        const data = (await o.json()) as { oportunidades: OportunidadDto[] };
        setOportunidades(data.oportunidades);
      }
    })();
  }, []);

  function abrirNueva() {
    setEditando(null);
    setForm(vacio);
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
      }),
    }).catch(() => null);
    if (!res?.ok) {
      setError(res ? await mensajeDe(res) : "No se pudo guardar");
      return;
    }
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
    setAbierto(false);
    void cargar();
  }

  return (
    <Pagina
      titulo="Tareas"
      detalle="Llamadas, visitas y mensajes que hace una persona. La IA no las crea."
      accion={
        <Button size="sm" onClick={abrirNueva}>
          <Plus className="h-4 w-4" strokeWidth={1.8} />
          Nueva tarea
        </Button>
      }
    >
      <div className="mb-4 flex flex-wrap gap-1.5">
        {[{ value: "todas", label: "Todas" }, ...ESTADOS_TAREA].map((o) => (
          <Button
            key={o.value}
            type="button"
            size="sm"
            variant={filtro === o.value ? "default" : "secondary"}
            onClick={() => setFiltro(o.value)}
          >
            {o.label}
          </Button>
        ))}
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
              <SelectNativo value={form.tipo} onChange={(tipo) => setForm({ ...form, tipo })}>
                {TIPOS_TAREA.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </SelectNativo>
            </Campo>
            <Campo label="Estado">
              <SelectNativo value={form.estado} onChange={(estado) => setForm({ ...form, estado })}>
                {ESTADOS_TAREA.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </SelectNativo>
            </Campo>
            <Campo label="Fecha">
              <Input
                type="datetime-local"
                value={form.fecha}
                onChange={(e) => setForm({ ...form, fecha: e.target.value })}
              />
            </Campo>
            <Campo label="Oportunidad">
              <SelectNativo
                value={form.oportunidadId}
                onChange={(oportunidadId) => {
                  const op = oportunidades.find((o) => o.id === oportunidadId);
                  setForm({
                    ...form,
                    oportunidadId,
                    contactId: form.contactId || op?.contactId || "",
                  });
                }}
              >
                <option value="">Sin oportunidad</option>
                {oportunidades.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nombre}
                  </option>
                ))}
              </SelectNativo>
            </Campo>
            <Campo label="Contacto">
              <SelectNativo
                value={form.contactId}
                onChange={(contactId) => setForm({ ...form, contactId })}
              >
                <option value="">Sin contacto</option>
                {contactos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name || c.phone || c.id}
                  </option>
                ))}
              </SelectNativo>
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
          title={filtro === "todas" ? "No hay tareas" : "Nada en este estado"}
          description="Acá van las acciones de una persona: una llamada, una visita o un mensaje que la IA no manda."
          action={
            filtro === "todas" ? (
              <Button size="sm" onClick={abrirNueva}>
                Nueva tarea
              </Button>
            ) : undefined
          }
        />
      ) : filas.length > 0 ? (
        <Tabla>
          <thead className="border-b bg-secondary/40">
            <tr>
              <Th>Tarea</Th>
              <Th>Tipo</Th>
              <Th>Estado</Th>
              <Th>Fecha</Th>
              <Th>Contacto</Th>
              <Th>Oportunidad</Th>
            </tr>
          </thead>
          <tbody>
            {filas.map((t) => (
              <tr
                key={t.id}
                className="cursor-pointer border-b last:border-0 hover:bg-accent/40"
                onClick={() => abrir(t)}
              >
                <Td className="font-medium">{t.titulo}</Td>
                <Td>{etiqueta(TIPOS_TAREA, t.tipo)}</Td>
                <Td>
                  <EstadoPill opciones={ESTADOS_TAREA} value={t.estado} />
                </Td>
                <Td>{fechaVisible(t.fecha)}</Td>
                <Td>{t.contactoNombre || "—"}</Td>
                <Td>{t.oportunidadNombre || "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      ) : null}
    </Pagina>
  );
}
