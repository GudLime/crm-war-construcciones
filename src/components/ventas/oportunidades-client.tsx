"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Plus, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { parseMoneyToCents } from "@/lib/money";
import {
  ESTADOS_OPORTUNIDAD,
  MOTIVOS_CIERRE,
  ORIGENES_OPORTUNIDAD,
  TIPOS_OPORTUNIDAD,
} from "@/lib/ventas";
import type { DepartamentoDto, EdificioDto, OportunidadDto } from "@/server/ventas";
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
  grilla,
  mensajeDe,
  plata,
  useMoneda,
} from "./ui";

type Contacto = { id: string; name: string | null; phone: string | null };

type Formulario = {
  nombre: string;
  origen: string;
  contactId: string;
  edificioId: string;
  departamentoId: string;
  estado: string;
  tipo: string;
  motivoCierre: string;
  valor: string;
};

const vacio: Formulario = {
  nombre: "",
  origen: "",
  contactId: "",
  edificioId: "",
  departamentoId: "",
  estado: "recibido",
  tipo: "venta",
  motivoCierre: "",
  valor: "",
};

function desde(o: OportunidadDto): Formulario {
  return {
    nombre: o.nombre,
    origen: o.origen ?? "",
    contactId: o.contactId ?? "",
    edificioId: o.edificioId ?? "",
    departamentoId: o.departamentoId ?? "",
    estado: o.estado,
    tipo: o.tipo ?? "",
    motivoCierre: o.motivoCierre ?? "",
    valor:
      o.valorCents == null
        ? ""
        : (o.valorCents / 100).toLocaleString("es-AR", { maximumFractionDigits: 2 }),
  };
}

function interes(o: OportunidadDto): string {
  if (o.edificioNombre && o.unidad) return `${o.edificioNombre} · ${o.unidad}`;
  return o.edificioNombre || "—";
}

export function OportunidadesClient() {
  const moneda = useMoneda();
  const [filas, setFilas] = useState<OportunidadDto[]>([]);
  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [edificios, setEdificios] = useState<EdificioDto[]>([]);
  const [unidades, setUnidades] = useState<DepartamentoDto[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [form, setForm] = useState<Formulario>(vacio);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  const cargar = useCallback(async () => {
    const res = await fetch("/api/oportunidades").catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as { oportunidades: OportunidadDto[] };
    setFilas(data.oportunidades);
    setListo(true);
  }, []);

  useEffect(() => {
    void cargar();
    void (async () => {
      const [c, e] = await Promise.all([
        fetch("/api/contacts").catch(() => null),
        fetch("/api/edificios").catch(() => null),
      ]);
      if (c?.ok) {
        const data = (await c.json()) as { contacts: Contacto[] };
        setContactos(data.contacts);
      }
      if (e?.ok) {
        const data = (await e.json()) as { edificios: EdificioDto[] };
        setEdificios(data.edificios);
      }
    })();
  }, [cargar]);

  useEffect(() => {
    if (!form.edificioId) {
      setUnidades([]);
      return;
    }
    void (async () => {
      const res = await fetch(`/api/edificios/${form.edificioId}`).catch(() => null);
      if (!res?.ok) return;
      const data = (await res.json()) as { departamentos: DepartamentoDto[] };
      setUnidades(data.departamentos);
    })();
  }, [form.edificioId]);

  function abrirNueva() {
    setEditando(null);
    setForm(vacio);
    setError(null);
    setAbierto(true);
  }

  function abrir(o: OportunidadDto) {
    setEditando(o.id);
    setForm(desde(o));
    setError(null);
    setAbierto(true);
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    const valorTexto = form.valor.trim();
    const valorCents = valorTexto ? parseMoneyToCents(valorTexto) : null;
    if (valorTexto && valorCents == null) {
      setError("El valor no se entiende");
      return;
    }
    setError(null);
    const res = await fetch(editando ? `/api/oportunidades/${editando}` : "/api/oportunidades", {
      method: editando ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        nombre: form.nombre,
        origen: form.origen || null,
        contactId: form.contactId || null,
        edificioId: form.edificioId || null,
        departamentoId: form.departamentoId || null,
        estado: form.estado,
        tipo: form.tipo || null,
        motivoCierre: form.motivoCierre || null,
        valorCents,
        moneda: valorCents == null ? null : moneda,
      }),
    }).catch(() => null);
    if (!res?.ok) {
      setError(res ? await mensajeDe(res) : "No se pudo guardar");
      return;
    }
    setAbierto(false);
    setEditando(null);
    setForm(vacio);
    void cargar();
  }

  async function eliminar() {
    if (!editando || !window.confirm("¿Borrar esta oportunidad?")) return;
    const res = await fetch(`/api/oportunidades/${editando}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok && res?.status !== 204) {
      setError(res ? await mensajeDe(res) : "No se pudo borrar");
      return;
    }
    setAbierto(false);
    setEditando(null);
    void cargar();
  }

  const contacto = contactos.find((c) => c.id === form.contactId);

  return (
    <Pagina
      titulo="Oportunidades"
      detalle="De dónde llegó, a quién pertenece y qué edificio o departamento está mirando."
      accion={
        <Button size="sm" onClick={abrirNueva}>
          <Plus className="h-4 w-4" strokeWidth={1.8} />
          Nueva oportunidad
        </Button>
      }
    >
      {abierto && (
        <Ficha titulo={editando ? "Editar oportunidad" : "Nueva oportunidad"}>
          <form onSubmit={guardar} className={grilla}>
            <Campo label="Nombre">
              <Input
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                required
                maxLength={160}
                placeholder="García · 2 ambientes"
              />
            </Campo>
            <Campo label="Origen">
              <SelectNativo value={form.origen} onChange={(origen) => setForm({ ...form, origen })}>
                <option value="">Sin origen</option>
                {ORIGENES_OPORTUNIDAD.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
                {form.origen && !(ORIGENES_OPORTUNIDAD as readonly string[]).includes(form.origen) && (
                  <option value={form.origen}>{form.origen}</option>
                )}
              </SelectNativo>
            </Campo>
            <Campo label="Estado">
              <SelectNativo value={form.estado} onChange={(estado) => setForm({ ...form, estado })}>
                {ESTADOS_OPORTUNIDAD.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </SelectNativo>
            </Campo>
            <Campo label="Contacto asociado">
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
                {form.contactId && !contacto && <option value={form.contactId}>Contacto</option>}
              </SelectNativo>
            </Campo>
            <Campo label="Interés · edificio">
              <SelectNativo
                value={form.edificioId}
                onChange={(edificioId) => setForm({ ...form, edificioId, departamentoId: "" })}
              >
                <option value="">Sin edificio</option>
                {edificios.map((ed) => (
                  <option key={ed.id} value={ed.id}>
                    {ed.nombre}
                  </option>
                ))}
              </SelectNativo>
            </Campo>
            <Campo label="Interés · departamento">
              <SelectNativo
                value={form.departamentoId}
                onChange={(departamentoId) => setForm({ ...form, departamentoId })}
              >
                <option value="">{form.edificioId ? "El edificio, sin unidad" : "Elegí un edificio"}</option>
                {unidades.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.unidad}
                  </option>
                ))}
              </SelectNativo>
            </Campo>
            <Campo label="Tipo">
              <SelectNativo value={form.tipo} onChange={(tipo) => setForm({ ...form, tipo })}>
                <option value="">Sin tipo</option>
                {TIPOS_OPORTUNIDAD.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </SelectNativo>
            </Campo>
            <Campo label="Valor">
              <Input
                value={form.valor}
                onChange={(e) => setForm({ ...form, valor: e.target.value })}
                inputMode="decimal"
              />
            </Campo>
            <Campo label="Motivo de cierre">
              <SelectNativo
                value={form.motivoCierre}
                onChange={(motivoCierre) => setForm({ ...form, motivoCierre })}
              >
                <option value="">Sin motivo</option>
                {MOTIVOS_CIERRE.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
                {form.motivoCierre &&
                  !(MOTIVOS_CIERRE as readonly string[]).includes(form.motivoCierre) && (
                    <option value={form.motivoCierre}>{form.motivoCierre}</option>
                  )}
              </SelectNativo>
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
          icon={Tag}
          title="Todavía no hay oportunidades"
          description="Una oportunidad junta el origen, el contacto y el edificio o departamento que le interesa."
          action={
            <Button size="sm" onClick={abrirNueva}>
              Nueva oportunidad
            </Button>
          }
        />
      ) : filas.length > 0 ? (
        <Tabla>
          <thead className="border-b bg-secondary/40">
            <tr>
              <Th>Oportunidad</Th>
              <Th>Origen</Th>
              <Th>Contacto</Th>
              <Th>Interés</Th>
              <Th>Estado</Th>
              <Th className="text-right">Valor</Th>
            </tr>
          </thead>
          <tbody>
            {filas.map((o) => (
              <tr
                key={o.id}
                className="cursor-pointer border-b last:border-0 hover:bg-accent/40"
                onClick={() => abrir(o)}
              >
                <Td className="font-medium">{o.nombre}</Td>
                <Td>{o.origen || "—"}</Td>
                <Td>{o.contactoNombre || "—"}</Td>
                <Td>{interes(o)}</Td>
                <Td>
                  <EstadoPill opciones={ESTADOS_OPORTUNIDAD} value={o.estado} />
                </Td>
                <Td className="text-right tabular-nums">{plata(o.valorCents, o.moneda, moneda)}</Td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      ) : null}
    </Pagina>
  );
}
