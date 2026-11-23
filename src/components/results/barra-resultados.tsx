"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, CalendarDays, MoreHorizontal, Plus, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendario } from "@/components/ui/calendario";
import { Menu, MenuItem, MenuTitulo } from "@/components/ui/menu";
import { tonoDeEdificio } from "@/lib/colores-edificio";
import {
  FECHAS_POR_DEFECTO,
  PESTANAS_FECHAS,
  rangoDeAtajo,
  rangoDePestana,
  textoRango,
  type DatosEdificios,
  type FiltrosResultados,
  type PestanaDto,
  type Rango,
} from "@/lib/resultados";
import { TIPOS_OPORTUNIDAD } from "@/lib/ventas";
import { cn } from "@/lib/utils";

/**
 * Resultados — la barra de arriba, en tres filas: Período (pestañas solo de
 * fechas), Edificio (pestañas solo de edificios) y Filtros manuales (no se
 * guardan). Cada fila con su etiqueta gris de 92 px.
 */

export type EstadoBarra = { rango: Rango; edificioIds: string[]; filtros: FiltrosResultados };

type Edificio = { id: string; nombre: string; color: string | null };
type Opcion = { value: string; label: string };

const pastilla = (activa: boolean) =>
  cn(
    "group relative inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium transition-colors",
    activa ? "border-brand bg-brand-tint text-brand-ink" : "border-[#e2e8f0] bg-card hover:bg-accent dark:border-border"
  );

function Fila({ icono: Icono, etiqueta, children, derecha }: { icono: typeof CalendarDays; etiqueta: string; children: React.ReactNode; derecha?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="flex w-[92px] shrink-0 items-center gap-1.5 pt-1.5 text-[12px] font-medium text-text-3">
        <Icono className="size-3.5" /> {etiqueta}
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">{children}</div>
      {derecha && <span className="hidden shrink-0 pt-1.5 text-[12px] text-text-3 md:inline">{derecha}</span>}
    </div>
  );
}

/** «⋯» al pasar el mouse: renombrar o borrar una pestaña propia. */
function MenuPestana({ p, onCambio }: { p: PestanaDto; onCambio: () => void }) {
  return (
    <Menu
      alinear="derecha"
      boton={(_, alternar) => (
        <button
          type="button"
          aria-label={`Opciones de «${p.nombre}»`}
          onClick={(e) => {
            e.stopPropagation();
            alternar();
          }}
          className="-mr-1.5 grid size-5 place-items-center rounded-full opacity-0 hover:bg-accent group-hover:opacity-100 focus-visible:opacity-100"
        >
          <MoreHorizontal className="size-3.5" />
        </button>
      )}
    >
      {(cerrar) => (
        <>
          <MenuItem
            onClick={() => {
              cerrar();
              const nombre = window.prompt("Nuevo nombre de la pestaña", p.nombre)?.trim();
              if (!nombre || nombre === p.nombre) return;
              void fetch(`/api/resultados/pestanas/${p.id}`, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ nombre }),
              }).then(onCambio);
            }}
          >
            Renombrar
          </MenuItem>
          <MenuItem
            onClick={() => {
              cerrar();
              if (!window.confirm(`¿Borrar la pestaña «${p.nombre}»?`)) return;
              void fetch(`/api/resultados/pestanas/${p.id}`, { method: "DELETE" }).then(onCambio);
            }}
          >
            Borrar
          </MenuItem>
        </>
      )}
    </Menu>
  );
}

export function BarraResultados({
  hoy,
  admin,
  valor,
  onCambio,
}: {
  hoy: string;
  admin: boolean;
  valor: EstadoBarra;
  onCambio: (v: EstadoBarra) => void;
}) {
  const [pestanas, setPestanas] = useState<{ fechas: PestanaDto[]; edificios: PestanaDto[] }>({ fechas: [], edificios: [] });
  const [fechaActiva, setFechaActiva] = useState<string>(FECHAS_POR_DEFECTO);
  const [edificioActivo, setEdificioActivo] = useState<string>("todos");
  const [edificios, setEdificios] = useState<Edificio[]>([]);
  const [origenes, setOrigenes] = useState<Opcion[]>([]);
  const [equipo, setEquipo] = useState<Opcion[]>([]);

  const cargarPestanas = useCallback(async () => {
    const r = await fetch("/api/resultados/pestanas").catch(() => null);
    if (!r?.ok) return null;
    const d = (await r.json()) as {
      fechas: PestanaDto[];
      edificios: PestanaDto[];
      ultimaFechas: string | null;
      ultimaEdificios: string | null;
    };
    setPestanas({ fechas: d.fechas, edificios: d.edificios });
    return d;
  }, []);

  // Al entrar: pestañas, edificios, orígenes y equipo; y la última elegida de cada fila.
  useEffect(() => {
    void (async () => {
      const [d, e, o, q] = await Promise.all([
        cargarPestanas(),
        fetch("/api/edificios").then((r) => (r.ok ? r.json() : { edificios: [] })).catch(() => ({ edificios: [] })),
        fetch("/api/origenes").then((r) => (r.ok ? r.json() : { origenes: [] })).catch(() => ({ origenes: [] })),
        fetch("/api/equipo").then((r) => (r.ok ? r.json() : { equipo: [] })).catch(() => ({ equipo: [] })),
      ]);
      const lista = ((e as { edificios: Edificio[] }).edificios ?? []).map((x) => ({ id: x.id, nombre: x.nombre, color: x.color ?? null }));
      setEdificios(lista);
      setOrigenes(((o as { origenes: { nombre: string }[] }).origenes ?? []).map((x) => ({ value: x.nombre, label: x.nombre })));
      setEquipo([
        ...((q as { equipo: { userId: string; nombre: string }[] }).equipo ?? []).map((m) => ({ value: m.userId, label: m.nombre })),
        { value: "sin", label: "Sin asignar" },
      ]);
      if (!d) return;
      let rango = valor.rango;
      let ids = valor.edificioIds;
      if (d.ultimaFechas) {
        const propia = d.fechas.find((p) => p.id === d.ultimaFechas);
        const r = propia ? rangoDePestana(propia, hoy) : PESTANAS_FECHAS.some((p) => p.id === d.ultimaFechas) ? rangoDeAtajo(d.ultimaFechas, hoy) : null;
        if (r) {
          rango = r;
          setFechaActiva(d.ultimaFechas);
        }
      }
      if (d.ultimaEdificios) {
        const propia = d.edificios.find((p) => p.id === d.ultimaEdificios);
        if (propia) ids = (propia.datos as DatosEdificios).edificioIds;
        else if (lista.some((x) => x.id === d.ultimaEdificios)) ids = [d.ultimaEdificios];
        if (propia || lista.some((x) => x.id === d.ultimaEdificios)) setEdificioActivo(d.ultimaEdificios);
      }
      if (rango !== valor.rango || ids !== valor.edificioIds) onCambio({ ...valor, rango, edificioIds: ids });
    })();
    // Solo al entrar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function recordar(tipo: "fechas" | "edificios", id: string) {
    void fetch("/api/resultados/pestanas/ultima", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tipo, id }),
    }).catch(() => undefined);
  }

  function elegirFechas(id: string, r: Rango) {
    setFechaActiva(id);
    recordar("fechas", id);
    onCambio({ ...valor, rango: r });
  }

  function elegirEdificios(id: string, ids: string[]) {
    setEdificioActivo(id);
    recordar("edificios", id);
    onCambio({ ...valor, edificioIds: ids });
  }

  // ---------- Guardar fechas ----------
  const [nuevaFecha, setNuevaFecha] = useState<{ nombre: string; desde: string | null; hasta: string | null }>({
    nombre: "",
    desde: null,
    hasta: null,
  });
  async function guardarFechas(cerrar: () => void) {
    const { nombre, desde, hasta } = nuevaFecha;
    if (!nombre.trim() || !desde) return;
    const r = await fetch("/api/resultados/pestanas", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tipo: "fechas", nombre: nombre.trim(), datos: { desde, hasta: hasta ?? desde } }),
    }).catch(() => null);
    if (!r?.ok) return;
    const { pestana } = (await r.json()) as { pestana: PestanaDto };
    await cargarPestanas();
    cerrar();
    setNuevaFecha({ nombre: "", desde: null, hasta: null });
    const rango = rangoDePestana(pestana, hoy);
    if (rango) elegirFechas(pestana.id, rango);
  }

  // ---------- Guardar grupo ----------
  const [nuevoGrupo, setNuevoGrupo] = useState<{ nombre: string; ids: string[] }>({ nombre: "", ids: [] });
  async function guardarGrupo(cerrar: () => void) {
    if (!nuevoGrupo.nombre.trim() || !nuevoGrupo.ids.length) return;
    const r = await fetch("/api/resultados/pestanas", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tipo: "edificios", nombre: nuevoGrupo.nombre.trim(), datos: { edificioIds: nuevoGrupo.ids } }),
    }).catch(() => null);
    if (!r?.ok) return;
    const { pestana } = (await r.json()) as { pestana: PestanaDto };
    await cargarPestanas();
    cerrar();
    setNuevoGrupo({ nombre: "", ids: [] });
    elegirEdificios(pestana.id, (pestana.datos as DatosEdificios).edificioIds);
  }

  // ---------- Filtros manuales ----------
  const propiedades = useMemo(
    () =>
      [
        { clave: "origen" as const, nombre: "Origen", opciones: origenes },
        ...(admin ? [{ clave: "responsable" as const, nombre: "Responsable", opciones: equipo }] : []),
        {
          clave: "operacion" as const,
          nombre: "Operación",
          opciones: TIPOS_OPORTUNIDAD.map((t) => ({ value: t.value as string, label: t.label as string })),
        },
      ] satisfies { clave: keyof FiltrosResultados; nombre: string; opciones: Opcion[] }[],
    [origenes, equipo, admin]
  );
  const activos = propiedades.filter((p) => valor.filtros[p.clave] !== undefined);
  const agregables = propiedades.filter((p) => valor.filtros[p.clave] === undefined);
  function setFiltro(clave: keyof FiltrosResultados, v: string[] | undefined) {
    const f = { ...valor.filtros };
    if (v === undefined) delete f[clave];
    else f[clave] = v;
    onCambio({ ...valor, filtros: f });
  }

  return (
    <div className="space-y-2 border-b px-4 py-3 sm:px-6">
      <Fila icono={CalendarDays} etiqueta="Período" derecha={textoRango(valor.rango)}>
        {PESTANAS_FECHAS.map((p) => {
          const r = rangoDeAtajo(p.id, hoy);
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={fechaActiva === p.id}
              title={textoRango(r)}
              onClick={() => elegirFechas(p.id, r)}
              className={pastilla(fechaActiva === p.id)}
            >
              {p.nombre}
            </button>
          );
        })}
        {pestanas.fechas.map((p) => {
          const r = rangoDePestana(p, hoy);
          if (!r) return null;
          return (
            <span key={p.id} className={pastilla(fechaActiva === p.id)}>
              <button type="button" title={textoRango(r)} onClick={() => elegirFechas(p.id, r)} aria-pressed={fechaActiva === p.id}>
                {p.nombre}
              </button>
              {(!p.compartida || admin) && <MenuPestana p={p} onCambio={() => void cargarPestanas()} />}
            </span>
          );
        })}
        <Menu
          className="w-[290px] p-3"
          boton={(_, alternar) => (
            <button type="button" onClick={alternar} className={cn(pastilla(false), "border-dashed text-text-2")}>
              <Plus className="size-3.5" /> Guardar fechas
            </button>
          )}
        >
          {(cerrar) => (
            <div className="space-y-2" data-capa-flotante>
              <input
                value={nuevaFecha.nombre}
                onChange={(e) => setNuevaFecha({ ...nuevaFecha, nombre: e.target.value })}
                placeholder="Nombre, por ej. «Lanzamiento Urquiza»"
                aria-label="Nombre de la pestaña"
                className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-[13px]"
              />
              <p className="text-[11.5px] text-text-3">
                {nuevaFecha.desde
                  ? `Desde ${nuevaFecha.desde.split("-").reverse().join("/")}${nuevaFecha.hasta ? ` hasta ${nuevaFecha.hasta.split("-").reverse().join("/")}` : " · elegí el hasta"}`
                  : "Elegí el desde y el hasta en el calendario"}
              </p>
              <Calendario
                valor={null}
                rango={{ desde: nuevaFecha.desde, hasta: nuevaFecha.hasta }}
                deshabilitarDespuesDe={hoy}
                onElegir={(f) =>
                  setNuevaFecha((n) =>
                    !n.desde || n.hasta
                      ? { ...n, desde: f, hasta: null }
                      : f < n.desde
                        ? { ...n, desde: f, hasta: n.desde }
                        : { ...n, hasta: f }
                  )
                }
              />
              <div className="flex justify-end gap-2 pt-1">
                <Button size="sm" variant="ghost" onClick={cerrar}>
                  Cancelar
                </Button>
                <Button size="sm" disabled={!nuevaFecha.nombre.trim() || !nuevaFecha.desde} onClick={() => void guardarFechas(cerrar)}>
                  Guardar pestaña
                </Button>
              </div>
            </div>
          )}
        </Menu>
      </Fila>

      <Fila icono={Building2} etiqueta="Edificio">
        <button type="button" aria-pressed={edificioActivo === "todos"} onClick={() => elegirEdificios("todos", [])} className={pastilla(edificioActivo === "todos")}>
          <span className="size-2 rounded-full bg-[#94a3b8]" /> Todos
        </button>
        {edificios.map((e) => (
          <button
            key={e.id}
            type="button"
            aria-pressed={edificioActivo === e.id}
            onClick={() => elegirEdificios(e.id, [e.id])}
            className={pastilla(edificioActivo === e.id)}
          >
            <span className="size-2 rounded-full" style={{ background: tonoDeEdificio(e.color).punto }} /> {e.nombre}
          </button>
        ))}
        {pestanas.edificios.map((p) => {
          const ids = (p.datos as DatosEdificios).edificioIds;
          return (
            <span key={p.id} className={pastilla(edificioActivo === p.id)}>
              <span className="size-2 rounded-full bg-[#94a3b8]" />
              <button
                type="button"
                aria-pressed={edificioActivo === p.id}
                title={ids.map((id) => edificios.find((e) => e.id === id)?.nombre ?? "").filter(Boolean).join(" + ")}
                onClick={() => elegirEdificios(p.id, ids)}
              >
                {p.nombre}
              </button>
              {(!p.compartida || admin) && <MenuPestana p={p} onCambio={() => void cargarPestanas()} />}
            </span>
          );
        })}
        {edificios.length > 1 && (
          <Menu
            className="w-[260px] p-3"
            boton={(_, alternar) => (
              <button type="button" onClick={alternar} className={cn(pastilla(false), "border-dashed text-text-2")}>
                <Plus className="size-3.5" /> Guardar grupo
              </button>
            )}
          >
            {(cerrar) => (
              <div className="space-y-2">
                <input
                  value={nuevoGrupo.nombre}
                  onChange={(e) => setNuevoGrupo({ ...nuevoGrupo, nombre: e.target.value })}
                  placeholder="Nombre, por ej. «En pozo»"
                  aria-label="Nombre del grupo"
                  className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-[13px]"
                />
                <div className="max-h-56 space-y-0.5 overflow-y-auto">
                  {edificios.map((e) => {
                    const marcado = nuevoGrupo.ids.includes(e.id);
                    return (
                      <label key={e.id} className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-[13px] hover:bg-accent">
                        <input
                          type="checkbox"
                          checked={marcado}
                          onChange={() =>
                            setNuevoGrupo((g) => ({ ...g, ids: marcado ? g.ids.filter((x) => x !== e.id) : [...g.ids, e.id] }))
                          }
                        />
                        <span className="size-2 rounded-full" style={{ background: tonoDeEdificio(e.color).punto }} />
                        {e.nombre}
                      </label>
                    );
                  })}
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button size="sm" variant="ghost" onClick={cerrar}>
                    Cancelar
                  </Button>
                  <Button size="sm" disabled={!nuevoGrupo.nombre.trim() || !nuevoGrupo.ids.length} onClick={() => void guardarGrupo(cerrar)}>
                    Guardar grupo
                  </Button>
                </div>
              </div>
            )}
          </Menu>
        )}
      </Fila>

      <Fila icono={SlidersHorizontal} etiqueta="Filtros">
        {activos.map((p) => {
          const elegidos = valor.filtros[p.clave] ?? [];
          const texto = elegidos.length
            ? elegidos.length === 1
              ? (p.opciones.find((o) => o.value === elegidos[0])?.label ?? elegidos[0])
              : `${elegidos.length} elegidos`
            : "cualquiera";
          return (
            <span key={p.clave} className={pastilla(elegidos.length > 0)}>
              <Menu
                boton={(_, alternar) => (
                  <button type="button" onClick={alternar}>
                    {p.nombre}: <strong className="font-semibold">{texto}</strong> ⌄
                  </button>
                )}
              >
                {p.opciones.map((o) => (
                  <MenuItem
                    key={o.value}
                    casilla={elegidos.includes(o.value)}
                    onClick={() =>
                      setFiltro(p.clave, elegidos.includes(o.value) ? elegidos.filter((x) => x !== o.value) : [...elegidos, o.value])
                    }
                  >
                    {o.label}
                  </MenuItem>
                ))}
              </Menu>
              <button type="button" aria-label={`Quitar ${p.nombre}`} onClick={() => setFiltro(p.clave, undefined)} className="-mr-1.5 grid size-5 place-items-center rounded-full hover:bg-accent">
                <X className="size-3" />
              </button>
            </span>
          );
        })}
        {agregables.length > 0 && (
          <Menu
            boton={(_, alternar) => (
              <button type="button" onClick={alternar} className={cn(pastilla(false), "text-text-2")}>
                <Plus className="size-3.5" /> Filtro
              </button>
            )}
          >
            {(cerrar) => (
              <>
                <MenuTitulo>Filtrar por</MenuTitulo>
                {agregables.map((p) => (
                  <MenuItem
                    key={p.clave}
                    onClick={() => {
                      cerrar();
                      setFiltro(p.clave, []);
                    }}
                  >
                    {p.nombre}
                  </MenuItem>
                ))}
              </>
            )}
          </Menu>
        )}
        {activos.length > 0 ? (
          <button type="button" onClick={() => onCambio({ ...valor, filtros: {} })} className="text-[12px] font-medium text-text-3 hover:text-foreground hover:underline">
            Limpiar
          </button>
        ) : (
          <span className="text-[12px] text-text-3">
            {admin ? "Origen, responsable u operación" : "Origen u operación"} · no se guardan
          </span>
        )}
      </Fila>
    </div>
  );
}

