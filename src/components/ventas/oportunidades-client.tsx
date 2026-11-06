"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Plus, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAvisoGuardado } from "@/components/ui/aviso-guardado";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { parseMoneyToCents } from "@/lib/money";
import {
  ESTADOS_OPORTUNIDAD,
  MOTIVOS_CIERRE,
  TIPOLOGIAS,
  TIPOS_OPORTUNIDAD,
  etiqueta,
} from "@/lib/ventas";
import { Chips } from "./oportunidad-panel";
import { OrigenIcono } from "./origen-icono";
import type { OrigenDto } from "@/lib/origenes";
import type { DepartamentoDto, EdificioDto, OportunidadDto } from "@/server/ventas";
import {
  Acciones,
  Campo,
  EstadoPill,
  Ficha,
  Pagina,
  Tabla,
  Td,
  Th,
  grilla,
  mensajeDe,
  plata,
  useMoneda,
} from "./ui";
import { Select } from "@/components/ui/select";

type Contacto = { id: string; name: string | null; phone: string | null };

type Formulario = {
  nombre: string;
  origen: string;
  contactId: string;
  /** 068 — Varios edificios y tipologías de interés. */
  edificioIds: string[];
  tipologias: string[];
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
  edificioIds: [],
  tipologias: [],
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
    edificioIds: o.edificios.length
      ? o.edificios.map((e) => e.id)
      : o.edificioId
        ? [o.edificioId]
        : [],
    tipologias: o.tipologias,
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

/** War — "hace 5 min", "hace 3 h", "ayer", o la fecha corta. */
function haceCuanto(iso: string, ahora: number = Date.now()): string {
  const min = Math.max(0, Math.round((ahora - new Date(iso).getTime()) / 60_000));
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  if (d === 1) return "ayer";
  if (d < 7) return `hace ${d} días`;
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function interes(o: OportunidadDto): string {
  const edificios = o.edificios.length
    ? o.edificios.map((e) => e.nombre).join(", ")
    : o.edificioNombre ?? "";
  const partes = [
    edificios,
    o.unidad ? `U. ${o.unidad}` : "",
    o.tipologias.map((t) => etiqueta(TIPOLOGIAS, t)).join(", "),
  ].filter(Boolean);
  return partes.length ? partes.join(" · ") : "—";
}

export function OportunidadesClient() {
  const moneda = useMoneda();
  const avisar = useAvisoGuardado();
  const [filas, setFilas] = useState<OportunidadDto[]>([]);
  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [edificios, setEdificios] = useState<EdificioDto[]>([]);
  const [origenes, setOrigenes] = useState<OrigenDto[]>([]);
  const [unidades, setUnidades] = useState<(DepartamentoDto & { edificioNombre: string })[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [form, setForm] = useState<Formulario>(vacio);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);
  /** Nombre del origen → clave de su ícono (Configuración → Orígenes). */
  const iconoDe = useMemo(() => new Map(origenes.map((o) => [o.nombre, o.icono])), [origenes]);

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
      const [c, e, o] = await Promise.all([
        fetch("/api/contacts").catch(() => null),
        fetch("/api/edificios").catch(() => null),
        fetch("/api/origenes").catch(() => null),
      ]);
      if (o?.ok) {
        const data = (await o.json()) as { origenes: OrigenDto[] };
        setOrigenes(data.origenes);
      }
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

  // 068 — Las unidades de todos los edificios elegidos, para fijar una.
  const edificiosClave = form.edificioIds.join(",");
  useEffect(() => {
    const ids = edificiosClave ? edificiosClave.split(",") : [];
    if (ids.length === 0) {
      setUnidades([]);
      return;
    }
    let vigente = true;
    void (async () => {
      const respuestas = await Promise.all(
        ids.map(async (id) => {
          const res = await fetch(`/api/edificios/${id}`).catch(() => null);
          if (!res?.ok) return [];
          const data = (await res.json()) as {
            edificio?: { nombre?: string };
            departamentos: DepartamentoDto[];
          };
          const nombre = data.edificio?.nombre ?? "";
          return data.departamentos.map((d) => ({ ...d, edificioNombre: nombre }));
        })
      );
      if (vigente) setUnidades(respuestas.flat());
    })();
    return () => {
      vigente = false;
    };
  }, [edificiosClave]);

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
        edificioIds: form.edificioIds,
        tipologias: form.tipologias,
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
    avisar(editando ? "Cambios aplicados" : "Oportunidad creada");
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
    avisar("Oportunidad eliminada");
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
              <Select
                value={form.origen}
                onValueChange={(origen) => setForm({ ...form, origen })}
                iconoDe={(nombre) =>
                  nombre ? <OrigenIcono icono={iconoDe.get(nombre)} /> : null
                }
              >
                <option value="">Sin origen</option>
                {origenes.map((o) => (
                  <option key={o.id} value={o.nombre}>
                    {o.nombre}
                  </option>
                ))}
                {/* Uno que se borró de Configuración: se conserva en esta oportunidad. */}
                {form.origen && !iconoDe.has(form.origen) && (
                  <option value={form.origen}>{form.origen}</option>
                )}
              </Select>
            </Campo>
            <Campo label="Estado">
              <Select value={form.estado} onValueChange={(estado) => setForm({ ...form, estado })}>
                {ESTADOS_OPORTUNIDAD.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo label="Contacto asociado">
              <Select
                value={form.contactId}
                onValueChange={(contactId) => setForm({ ...form, contactId })}
              >
                <option value="">Sin contacto</option>
                {contactos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name || c.phone || c.id}
                  </option>
                ))}
                {form.contactId && !contacto && <option value={form.contactId}>Contacto</option>}
              </Select>
            </Campo>
            <div className="flex min-w-0 flex-col gap-1.5 sm:col-span-2 lg:col-span-3">
              <span className="text-xs font-medium text-text-2">Interés · edificios</span>
              <Chips
                opciones={edificios.map((ed) => ({ value: ed.id, label: ed.nombre }))}
                elegidos={form.edificioIds}
                vacio="Todavía no hay edificios cargados."
                onCambio={(edificioIds) => {
                  const unidad = unidades.find((u) => u.id === form.departamentoId);
                  const sigue = unidad && edificioIds.includes(unidad.edificioId);
                  setForm({ ...form, edificioIds, departamentoId: sigue ? form.departamentoId : "" });
                }}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5 sm:col-span-2 lg:col-span-3">
              <span className="text-xs font-medium text-text-2">Interés · tipologías</span>
              <Chips
                opciones={TIPOLOGIAS.map((t) => ({ value: t.value, label: t.label }))}
                elegidos={form.tipologias}
                onCambio={(tipologias) => setForm({ ...form, tipologias })}
              />
            </div>
            <Campo label="Departamento puntual">
              <Select
                value={form.departamentoId}
                onValueChange={(departamentoId) => setForm({ ...form, departamentoId })}
              >
                <option value="">
                  {form.edificioIds.length ? "Todavía sin unidad" : "Elegí un edificio"}
                </option>
                {unidades.map((u) => (
                  <option key={u.id} value={u.id}>
                    {form.edificioIds.length > 1 ? `${u.edificioNombre} · ${u.unidad}` : u.unidad}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo label="Tipo">
              <Select value={form.tipo} onValueChange={(tipo) => setForm({ ...form, tipo })}>
                <option value="">Sin tipo</option>
                {TIPOS_OPORTUNIDAD.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo label="Valor">
              <Input
                value={form.valor}
                onChange={(e) => setForm({ ...form, valor: e.target.value })}
                inputMode="decimal"
              />
            </Campo>
            <Campo label="Motivo de cierre">
              <Select
                value={form.motivoCierre}
                onValueChange={(motivoCierre) => setForm({ ...form, motivoCierre })}
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
              </Select>
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
              <Th>Última interacción</Th>
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
                <Td>
                  {o.origen ? (
                    <span className="inline-flex items-center gap-1.5">
                      <OrigenIcono icono={iconoDe.get(o.origen)} />
                      {o.origen}
                    </span>
                  ) : (
                    "—"
                  )}
                  {o.formularios > 1 && (
                    <span className="ml-1.5 text-xs text-text-3">· {o.formularios} formularios</span>
                  )}
                </Td>
                <Td>{o.contactoNombre || "—"}</Td>
                <Td>{interes(o)}</Td>
                <Td>
                  <EstadoPill opciones={ESTADOS_OPORTUNIDAD} value={o.estado} />
                </Td>
                <Td className="whitespace-nowrap text-text-2">
                  <span title={new Date(o.ultimaInteraccion).toLocaleString("es-AR")}>
                    {haceCuanto(o.ultimaInteraccion)}
                  </span>
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
