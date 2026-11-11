"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAvisoGuardado } from "@/components/ui/aviso-guardado";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { parseMoneyToCents } from "@/lib/money";
import {
  ESTADOS_OPORTUNIDAD,
  AMBIENTES,
  MOTIVOS_CIERRE,
  TIPOS_OPORTUNIDAD,
  etiquetaAmbientes,
} from "@/lib/ventas";
import { Chips } from "./oportunidad-panel";
import { OrigenIcono } from "./origen-icono";
import { SelectorDeColumnas, SelectorDeForma, VistaOportunidades, usePreferenciasDeLista } from "./oportunidades-vistas";
import { BarraDeFiltros, PestanasDeVistas, useVistas, type Miembro } from "./filtros-oportunidades";
import { situacionACargar } from "@/lib/vistas";
import type { OrigenDto } from "@/lib/origenes";
import type { DepartamentoDto, EdificioDto, OportunidadDto } from "@/server/ventas";
import {
  Acciones,
  Campo,
  Ficha,
  Pagina,
  grilla,
  mensajeDe,
  useMoneda,
} from "./ui";
import { Select } from "@/components/ui/select";

type Contacto = { id: string; name: string | null; phone: string | null };

type Formulario = {
  nombre: string;
  origen: string;
  contactId: string;
  /** 068 — Varios edificios de interés. */
  edificioIds: string[];
  /** 0047 — Ambientes de interés («2», «3»). Las unidades se eligen en la página de la oportunidad. */
  ambientes: string[];
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
  ambientes: [],
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
    ambientes: o.ambientes.map(String),
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

/** 0049 — Las unidades de interés que aparecen en la lista, para el filtro «Unidad». */
function unidadesDeFiltro(filas: readonly OportunidadDto[]): { value: string; label: string }[] {
  const vistas = new Map<string, string>();
  for (const o of filas) for (const u of o.unidades) vistas.set(u.id, u.titulo);
  return [...vistas]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "es", { numeric: true }));
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
  /** 0049 — El Valor es el promedio de las unidades de interés: no se carga a mano. */
  const [valorCalculado, setValorCalculado] = useState(false);
  const router = useRouter();
  /** War — Se vino a editar desde la página de la oportunidad: al terminar, se vuelve ahí. */
  const volverA = useRef<string | null>(null);
  /** Nombre del origen → su ícono o imagen (Configuración → Orígenes). */
  const iconoDe = useMemo(() => new Map(origenes.map((o) => [o.nombre, o])), [origenes]);
  const [pref, setPref] = usePreferenciasDeLista();
  /** Qué hay cargado: la lista arranca con las abiertas y trae las cerradas solo si se piden. */
  const [cargadas, setCargadas] = useState<"abiertas" | "cerradas" | "todas" | null>(null);
  const vistas = useVistas({ filas, cargadas, pref, setPref });
  const situacion = situacionACargar(vistas.filtros);
  /** El equipo, para filtrar por responsable (si la instancia tiene responsables). */
  const [equipo, setEquipo] = useState<Miembro[]>([]);
  useEffect(() => {
    void fetch("/api/oportunidades/responsables")
      .then((r) => (r.ok ? r.json() : { responsables: [] }))
      .then((d: { responsables: Miembro[] }) => setEquipo(d.responsables ?? []))
      .catch(() => undefined);
  }, []);

  const cargar = useCallback(async () => {
    const res = await fetch(
      `/api/oportunidades${situacion === "todas" ? "" : `?situacion=${situacion}`}`
    ).catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as { oportunidades: OportunidadDto[]; valorCalculado?: boolean };
    setFilas(data.oportunidades);
    setCargadas(situacion);
    setValorCalculado(data.valorCalculado === true);
    setListo(true);
  }, [situacion]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Los contactos (pueden ser miles) solo hacen falta en el formulario.
  const [conContactos, setConContactos] = useState(false);
  useEffect(() => {
    if (!abierto || conContactos) return;
    setConContactos(true);
    void fetch("/api/contacts")
      .then((r) => (r.ok ? r.json() : { contacts: [] }))
      .then((d: { contacts: Contacto[] }) => setContactos(d.contacts))
      .catch(() => undefined);
  }, [abierto, conContactos]);

  useEffect(() => {
    void (async () => {
      const [e, o] = await Promise.all([
        fetch("/api/edificios").catch(() => null),
        fetch("/api/origenes").catch(() => null),
      ]);
      if (o?.ok) {
        const data = (await o.json()) as { origenes: OrigenDto[] };
        setOrigenes(data.origenes);
      }
      if (e?.ok) {
        const data = (await e.json()) as { edificios: EdificioDto[] };
        setEdificios(data.edificios);
      }
    })();
  }, []);

  // War — `?editar=<id>` (el botón Editar de la página de la oportunidad).
  useEffect(() => {
    if (!listo) return;
    const id = new URLSearchParams(window.location.search).get("editar");
    if (!id) return;
    const abrirCon = (o: OportunidadDto) => {
      volverA.current = `/oportunidades/${id}`;
      setEditando(o.id);
      setForm(desde(o));
      setError(null);
      setAbierto(true);
      window.history.replaceState(null, "", "/oportunidades");
    };
    const o = filas.find((f) => f.id === id);
    if (o) {
      abrirCon(o);
      return;
    }
    // Puede ser una cerrada (no está cargada): se pide sola.
    void fetch(`/api/oportunidades/${encodeURIComponent(id)}/detalle`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { oportunidad?: OportunidadDto } | null) => {
        if (d?.oportunidad) abrirCon(d.oportunidad);
      })
      .catch(() => undefined);
  }, [listo, filas]);

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
        ambientes: form.ambientes.map(Number),
        departamentoId: form.departamentoId || null,
        estado: form.estado,
        tipo: form.tipo || null,
        motivoCierre: form.motivoCierre || null,
        // Con el Valor calculado (promedio de las unidades) no se manda: lo calcula el servidor.
        ...(valorCalculado ? {} : { valorCents, moneda: valorCents == null ? null : moneda }),
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
    if (volverA.current) {
      router.push(volverA.current);
      volverA.current = null;
      return;
    }
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
        <div className="flex flex-wrap items-center gap-2">
          <SelectorDeForma forma={pref.forma} onCambio={(forma) => setPref({ ...pref, forma })} />
        <Button size="sm" onClick={abrirNueva}>
          <Plus className="h-4 w-4" strokeWidth={1.8} />
          Nueva oportunidad
        </Button>
        </div>
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
                  nombre ? (
                    <OrigenIcono icono={iconoDe.get(nombre)?.icono} imagen={iconoDe.get(nombre)?.imagen} />
                  ) : null
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
              <span className="text-xs font-medium text-text-2">Interés · ambientes</span>
              <Chips
                opciones={AMBIENTES.map((n) => ({ value: String(n), label: etiquetaAmbientes(n) }))}
                elegidos={form.ambientes}
                onCambio={(ambientes) => setForm({ ...form, ambientes })}
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
              {valorCalculado ? (
                <p className="py-1.5 text-[13px] text-text-3">
                  Se calcula solo: el promedio de las unidades de interés (o de los ambientes elegidos).
                </p>
              ) : (
                <Input
                  value={form.valor}
                  onChange={(e) => setForm({ ...form, valor: e.target.value })}
                  inputMode="decimal"
                />
              )}
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

      {listo && filas.length === 0 && cargadas === "todas" && !abierto ? (
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
      ) : listo ? (
        <div className="space-y-3">
          <PestanasDeVistas v={vistas} />
          <BarraDeFiltros
            v={vistas}
            equipo={equipo}
            opciones={{
              edificios: edificios.map((e) => ({ value: e.id, label: e.nombre })),
              origenes: origenes.map((o) => ({ value: o.nombre, label: o.nombre })),
              unidades: unidadesDeFiltro(filas),
            }}
            derecha={pref.forma === "lista" ? <SelectorDeColumnas pref={pref} setPref={setPref} /> : undefined}
          />
          <VistaOportunidades
            onMover={async (id, estado) => {
              setFilas((fs) => fs.map((f) => (f.id === id ? { ...f, estado } : f)));
              const res = await fetch(`/api/oportunidades/${id}/estado`, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ estado }),
              }).catch(() => null);
              if (!res?.ok) avisar(res ? await mensajeDe(res) : "No se pudo mover", "error");
              void cargar();
            }}
            filas={vistas.visibles}
            forma={pref.forma}
            pref={pref}
            setPref={setPref}
            iconoDe={iconoDe}
            moneda={moneda}
          />
        </div>
      ) : null}
    </Pagina>
  );
}
