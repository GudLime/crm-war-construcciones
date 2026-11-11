"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Filter, MoreHorizontal, Plus, Save, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Menu, MenuItem, MenuSeparador, MenuTitulo } from "@/components/ui/menu";
import { useAvisoGuardado } from "@/components/ui/aviso-guardado";
import { cn } from "@/lib/utils";
import { ESTADOS_OPORTUNIDAD } from "@/lib/ventas";
import {
  RESPONSABLE_SIN,
  RESPONSABLE_YO,
  VISTAS_DE_FABRICA,
  cumpleFiltros,
  difiereDe,
  limpiarFiltros,
  situacionACargar,
  type FilaFiltrable,
  type Filtros,
  type VistaDto,
} from "@/lib/vistas";
import type { PreferenciasDeLista } from "./oportunidades-vistas";

/**
 * Oportunidades — vistas guardadas (pestañas estilo Notion) y la barra de
 * filtros: Responsable (avatares), «+ Filtro» con pastillas «Propiedad:
 * valor», Limpiar y «Cambios sin guardar · Descartar · Guardar vista».
 * Una vista guarda filtros, orden, columnas ocultas y anchos; las del equipo
 * las ven todos y las propias solo quien las guardó. Se recuerda la última.
 */

type Opcion = { value: string; label: string };
export type Miembro = { userId: string; nombre: string };

type Propiedad = "edificios" | "origenes" | "estados" | "unidades" | "paraCerrar";

const NOMBRE_PROPIEDAD: Record<Propiedad, string> = {
  edificios: "Edificio",
  origenes: "Origen",
  estados: "Estado",
  unidades: "Unidad",
  paraCerrar: "Para cerrar",
};

/** Cambia una propiedad de los filtros (undefined la quita). */
function con(f: Filtros, p: Propiedad, valor: string[] | boolean | undefined): Filtros {
  return { ...f, [p]: valor } as Filtros;
}

function iniciales(nombre: string): string {
  const p = nombre.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "?") + (p[1]?.[0] ?? "")).toUpperCase();
}

async function mensaje(res: Response | null): Promise<string> {
  const d = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
  return d?.error?.message ?? "No se pudo guardar";
}

/** Vistas, filtros y cuál está elegida: el estado de la página. */
export function useVistas<F extends FilaFiltrable>({
  filas,
  cargadas,
  pref,
  setPref,
}: {
  filas: F[];
  /** Qué trajo la página del servidor: con eso se puede contar cada pestaña. */
  cargadas: "abiertas" | "cerradas" | "todas" | null;
  pref: PreferenciasDeLista;
  setPref: React.Dispatch<React.SetStateAction<PreferenciasDeLista>>;
}) {
  const [guardadas, setGuardadas] = useState<VistaDto[]>([]);
  const [yo, setYo] = useState<string | null>(null);
  // Por defecto, «Abiertas»: las cerradas no se cargan hasta que se piden.
  const [activa, setActiva] = useState<string>(VISTAS_DE_FABRICA[0]!.id);
  const [filtros, setFiltros] = useState<Filtros>(VISTAS_DE_FABRICA[0]!.filtros);
  const [lista, setLista] = useState(false);

  const vistas = useMemo(() => [...VISTAS_DE_FABRICA, ...guardadas], [guardadas]);
  const vista = vistas.find((v) => v.id === activa) ?? VISTAS_DE_FABRICA[0]!;

  const aplicar = useCallback(
    (v: VistaDto) => {
      setFiltros(v.filtros);
      setPref((base) => ({
        ...base,
        orden: v.orden as PreferenciasDeLista["orden"],
        ...(v.columnas ? { ocultas: v.columnas as PreferenciasDeLista["ocultas"] } : {}),
        ...(v.anchos ? { anchos: v.anchos } : {}),
      }));
    },
    [setPref]
  );

  const cargar = useCallback(async () => {
    const r = await fetch("/api/vistas?pagina=oportunidades").catch(() => null);
    if (!r?.ok) return null;
    const d = (await r.json()) as { vistas: VistaDto[]; ultima: string | null; yo: string };
    setGuardadas(d.vistas);
    setYo(d.yo);
    return d;
  }, []);

  // Al entrar: la última vista que usó esta persona.
  useEffect(() => {
    void (async () => {
      const d = await cargar();
      setLista(true);
      if (!d?.ultima) return;
      const v = [...VISTAS_DE_FABRICA, ...d.vistas].find((x) => x.id === d.ultima);
      if (v && v.id !== VISTAS_DE_FABRICA[0]!.id) {
        setActiva(v.id);
        aplicar(v);
      }
    })();
  }, [cargar, aplicar]);

  function elegir(v: VistaDto) {
    setActiva(v.id);
    aplicar(v);
    void fetch("/api/vistas/ultima", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pagina: "oportunidades", vistaId: v.id }),
    }).catch(() => null);
  }

  const actual = {
    filtros,
    orden: pref.orden,
    columnas: pref.ocultas as string[],
    anchos: pref.anchos as Record<string, number>,
  };
  const sinGuardar = lista && difiereDe(vista, actual);

  async function guardarNueva(nombre: string, compartida: boolean): Promise<string | null> {
    const res = await fetch("/api/vistas", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        pagina: "oportunidades",
        nombre,
        compartida,
        filtros: limpiarFiltros(filtros),
        orden: pref.orden,
        columnas: pref.ocultas,
        anchos: pref.anchos,
      }),
    }).catch(() => null);
    if (!res?.ok) return mensaje(res);
    const { vista: nueva } = (await res.json()) as { vista: VistaDto };
    setGuardadas((g) => [...g, nueva]);
    elegir(nueva);
    return null;
  }

  async function actualizar(v: VistaDto, cambios: Partial<VistaDto>): Promise<string | null> {
    const res = await fetch(`/api/vistas/${v.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(cambios),
    }).catch(() => null);
    if (!res?.ok) return mensaje(res);
    const { vista: nueva } = (await res.json()) as { vista: VistaDto };
    setGuardadas((g) => g.map((x) => (x.id === nueva.id ? nueva : x)));
    return null;
  }

  async function borrar(v: VistaDto) {
    if (!window.confirm(`¿Borrar la vista «${v.nombre}»?`)) return;
    const res = await fetch(`/api/vistas/${v.id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok && res?.status !== 204) return;
    setGuardadas((g) => g.filter((x) => x.id !== v.id));
    if (activa === v.id) elegir(VISTAS_DE_FABRICA[0]!);
  }

  const visibles = useMemo(() => filas.filter((f) => cumpleFiltros(f, filtros, yo)), [filas, filtros, yo]);
  /** Solo se cuenta lo que está cargado: una pestaña de cerradas no se cuenta con las abiertas. */
  const contar = (v: VistaDto): number | null => {
    const necesita = situacionACargar(v.filtros);
    if (cargadas === null || (cargadas !== "todas" && necesita !== cargadas)) return null;
    return filas.filter((f) => cumpleFiltros(f, v.filtros, yo)).length;
  };

  return {
    vistas,
    vista,
    activa,
    filtros,
    setFiltros,
    yo,
    visibles,
    contar,
    elegir,
    sinGuardar,
    descartar: () => aplicar(vista),
    guardarNueva,
    guardarCambios: () =>
      actualizar(vista, {
        filtros: limpiarFiltros(filtros),
        orden: pref.orden,
        columnas: pref.ocultas,
        anchos: pref.anchos,
      }),
    renombrar: (v: VistaDto, nombre: string) => actualizar(v, { nombre }),
    borrar,
  };
}

export type EstadoVistas = ReturnType<typeof useVistas>;

/** Las pestañas: Todas, Para cerrar y las guardadas, con su contador. */
export function PestanasDeVistas({ v }: { v: EstadoVistas }) {
  const avisar = useAvisoGuardado();
  return (
    <div role="tablist" aria-label="Vistas guardadas" className="-mb-px flex gap-1 overflow-x-auto border-b border-border">
      {v.vistas.map((x) => {
        const elegida = x.id === v.activa;
        return (
          <div key={x.id} className="flex shrink-0 items-center">
            <button
              type="button"
              role="tab"
              aria-selected={elegida}
              onClick={() => v.elegir(x)}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 border-b-2 px-3 text-[13.5px] font-medium transition-colors",
                elegida ? "border-foreground text-foreground" : "border-transparent text-text-2 hover:text-foreground"
              )}
            >
              {!x.compartida && <span className="sr-only">(solo tuya)</span>}
              {x.nombre}
              {v.contar(x) !== null && (
                <span className="rounded-full bg-muted px-1.5 text-[11px] font-semibold text-text-2">{v.contar(x)}</span>
              )}
            </button>
            {elegida && !x.deFabrica && (
              <Menu
                boton={(abierto, alternar) => (
                  <button
                    type="button"
                    aria-label={`Opciones de la vista ${x.nombre}`}
                    aria-expanded={abierto}
                    onClick={alternar}
                    className="grid size-7 place-items-center rounded-md text-text-3 hover:bg-accent hover:text-foreground"
                  >
                    <MoreHorizontal className="size-4" />
                  </button>
                )}
              >
                {(cerrar) => (
                  <>
                    <MenuTitulo>{x.compartida ? "Vista del equipo" : "Vista solo tuya"}</MenuTitulo>
                    {v.sinGuardar && (
                      <MenuItem
                        icono={<Save className="size-3.5" />}
                        onClick={async () => {
                          cerrar();
                          const e = await v.guardarCambios();
                          avisar(e ?? "Vista actualizada", e ? "error" : undefined);
                        }}
                      >
                        Guardar los cambios en esta vista
                      </MenuItem>
                    )}
                    <MenuItem
                      onClick={async () => {
                        cerrar();
                        const nombre = window.prompt("Nuevo nombre de la vista", x.nombre)?.trim();
                        if (!nombre || nombre === x.nombre) return;
                        const e = await v.renombrar(x, nombre);
                        if (e) avisar(e, "error");
                      }}
                    >
                      Renombrar
                    </MenuItem>
                    <MenuSeparador />
                    <MenuItem
                      onClick={() => {
                        cerrar();
                        void v.borrar(x);
                      }}
                    >
                      Borrar vista
                    </MenuItem>
                  </>
                )}
              </Menu>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** La barra de filtros. `derecha` va al final (el selector de columnas). */
export function BarraDeFiltros({
  v,
  equipo,
  opciones,
  derecha,
}: {
  v: EstadoVistas;
  equipo: Miembro[];
  opciones: { edificios: Opcion[]; origenes: Opcion[]; unidades: Opcion[] };
  derecha?: React.ReactNode;
}) {
  const [guardando, setGuardando] = useState(false);
  const [nombre, setNombre] = useState("");
  const [compartida, setCompartida] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<Propiedad | null>(null);
  const f = v.filtros;

  const opcionesDe: Record<Exclude<Propiedad, "paraCerrar">, Opcion[]> = {
    edificios: opciones.edificios,
    origenes: opciones.origenes,
    estados: ESTADOS_OPORTUNIDAD.map((e) => ({ value: e.value, label: e.label })),
    unidades: opciones.unidades,
  };
  const activas = (Object.keys(NOMBRE_PROPIEDAD) as Propiedad[]).filter((p) =>
    p === "paraCerrar" ? f.paraCerrar === true : f[p] !== undefined
  );
  const agregables = (Object.keys(NOMBRE_PROPIEDAD) as Propiedad[]).filter((p) => !activas.includes(p));
  const responsables = f.responsables ?? [];

  function alternarResponsable(id: string) {
    const nuevos = responsables.includes(id) ? responsables.filter((x) => x !== id) : [...responsables, id];
    v.setFiltros({ ...f, responsables: nuevos.length ? nuevos : undefined });
  }

  const textoResponsable = !responsables.length
    ? null
    : responsables.length === 1
      ? responsables[0] === RESPONSABLE_SIN
        ? "Sin asignar"
        : (equipo.find((m) => m.userId === (responsables[0] === RESPONSABLE_YO ? v.yo : responsables[0]))?.nombre ?? "Yo")
      : `${responsables.length} responsables`;

  function valorDe(p: Propiedad): string {
    if (p === "paraCerrar") return "Sí";
    const elegidos = f[p] ?? [];
    if (!elegidos.length) return "cualquiera";
    const labels = elegidos.map((x) => opcionesDe[p].find((o) => o.value === x)?.label ?? x);
    return labels.length > 2 ? `${labels[0]} y ${labels.length - 1} más` : labels.join(", ");
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-[13px]">
      {equipo.length > 0 && (
        <div role="group" aria-label="Filtrar por responsable" className="mr-1 inline-flex items-center gap-2 border-r border-border pr-3">
          <span className="text-text-3">Responsable</span>
          <span className="flex -space-x-1">
            {equipo.map((m) => {
              const id = m.userId === v.yo ? RESPONSABLE_YO : m.userId;
              const on = responsables.includes(id);
              return (
                <button
                  key={m.userId}
                  type="button"
                  aria-pressed={on}
                  aria-label={m.nombre}
                  title={m.nombre}
                  onClick={() => alternarResponsable(id)}
                  className={cn(
                    "relative grid size-7 place-items-center rounded-full border-2 border-card bg-brand-soft text-[10.5px] font-bold text-brand-ink transition hover:z-10 hover:-translate-y-0.5",
                    on && "z-10 ring-2 ring-brand",
                    responsables.length > 0 && !on && "opacity-40"
                  )}
                >
                  {iniciales(m.nombre)}
                </button>
              );
            })}
            <button
              type="button"
              aria-pressed={responsables.includes(RESPONSABLE_SIN)}
              aria-label="Sin asignar"
              title="Sin asignar"
              onClick={() => alternarResponsable(RESPONSABLE_SIN)}
              className={cn(
                "relative grid size-7 place-items-center rounded-full border-[1.5px] border-dashed border-border-strong bg-card text-text-3 transition hover:z-10 hover:-translate-y-0.5",
                responsables.includes(RESPONSABLE_SIN) && "z-10 ring-2 ring-brand",
                responsables.length > 0 && !responsables.includes(RESPONSABLE_SIN) && "opacity-40"
              )}
            >
              <Users className="size-3.5" />
            </button>
          </span>
          {textoResponsable && <span className="font-medium">{textoResponsable}</span>}
        </div>
      )}

      {f.situacion && (
        <span className="inline-flex items-center rounded-full border border-border bg-card">
          <Menu
            boton={(abierto, alternar) => (
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={abierto}
                onClick={alternar}
                className="inline-flex h-7 items-center gap-1 rounded-l-full pl-3 pr-1 hover:bg-accent"
              >
                Situación: <strong className="font-semibold">{f.situacion === "abiertas" ? "Abiertas" : "Cerradas"}</strong>
                <ChevronDown className="size-3.5 text-text-3" />
              </button>
            )}
          >
            {(cerrar) => (
              <>
                {(
                  [
                    ["abiertas", "Abiertas", "Recibido, En charlas, Conoce información, Visitó"],
                    ["cerradas", "Cerradas", "Reservó, Compró, Perdido, No calificado"],
                  ] as const
                ).map(([valor, texto, detalle]) => (
                  <MenuItem
                    key={valor}
                    marcado={f.situacion === valor}
                    onClick={() => {
                      v.setFiltros({ ...f, situacion: valor });
                      cerrar();
                    }}
                  >
                    <span className="block">{texto}</span>
                    <span className="block text-[11.5px] text-text-3">{detalle}</span>
                  </MenuItem>
                ))}
              </>
            )}
          </Menu>
          <button
            type="button"
            aria-label="Quitar el filtro Situación (ver todas)"
            onClick={() => v.setFiltros({ ...f, situacion: undefined })}
            className="grid size-7 place-items-center rounded-r-full text-text-3 hover:bg-accent hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </span>
      )}

      {activas.map((p) => (
        <span key={p} className="inline-flex items-center rounded-full border border-border bg-card">
          {p === "paraCerrar" ? (
            <span className="pl-3 pr-1">
              {NOMBRE_PROPIEDAD[p]}: <strong className="font-semibold">Sí</strong>
            </span>
          ) : (
            <Menu
              abierto={abierta === p}
              onAbierto={(a) => setAbierta(a ? p : null)}
              boton={(abierto, alternar) => (
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={abierto}
                  onClick={alternar}
                  className="inline-flex h-7 items-center gap-1 rounded-l-full pl-3 pr-1 hover:bg-accent"
                >
                  {NOMBRE_PROPIEDAD[p]}: <strong className="max-w-[180px] truncate font-semibold">{valorDe(p)}</strong>
                  <ChevronDown className="size-3.5 text-text-3" />
                </button>
              )}
              className="max-h-80 overflow-y-auto"
            >
              {opcionesDe[p as Exclude<Propiedad, "paraCerrar">].map((o) => {
                const elegidos = (f[p as Exclude<Propiedad, "paraCerrar">] ?? []) as string[];
                const on = elegidos.includes(o.value);
                return (
                  <MenuItem
                    key={o.value}
                    casilla={on}
                    onClick={() =>
                      v.setFiltros(con(f, p, on ? elegidos.filter((x) => x !== o.value) : [...elegidos, o.value]))
                    }
                  >
                    {o.label}
                  </MenuItem>
                );
              })}
              {opcionesDe[p as Exclude<Propiedad, "paraCerrar">].length === 0 && <p className="px-2 py-1.5 text-text-3">No hay opciones</p>}
            </Menu>
          )}
          <button
            type="button"
            aria-label={`Quitar el filtro ${NOMBRE_PROPIEDAD[p]}`}
            onClick={() => v.setFiltros(con(f, p, undefined))}
            className="grid size-7 place-items-center rounded-r-full text-text-3 hover:bg-accent hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </span>
      ))}

      {(agregables.length > 0 || !f.situacion) && (
        <Menu
          boton={(abierto, alternar) => (
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={abierto}
              onClick={alternar}
              className="inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-text-2 hover:bg-accent hover:text-foreground"
            >
              <Plus className="size-3.5" /> Filtro
            </button>
          )}
        >
          {(cerrar) => (
            <>
              <MenuTitulo>Filtrar por</MenuTitulo>
              {!f.situacion && (
                <MenuItem
                  icono={<Filter className="size-3.5" />}
                  onClick={() => {
                    cerrar();
                    v.setFiltros({ ...f, situacion: "cerradas" });
                  }}
                >
                  Situación (abiertas / cerradas)
                </MenuItem>
              )}
              {agregables.map((p) => (
                <MenuItem
                  key={p}
                  icono={<Filter className="size-3.5" />}
                  onClick={() => {
                    cerrar();
                    if (p === "paraCerrar") v.setFiltros({ ...f, paraCerrar: true });
                    else {
                      v.setFiltros(con(f, p, []));
                      setAbierta(p);
                    }
                  }}
                >
                  {NOMBRE_PROPIEDAD[p]}
                </MenuItem>
              ))}
            </>
          )}
        </Menu>
      )}

      {(activas.length > 0 || responsables.length > 0 || f.situacion !== "abiertas") && (
        <button
          type="button"
          title="Vuelve a las abiertas, sin otros filtros"
          onClick={() => v.setFiltros({ situacion: "abiertas" })} className="px-1 text-text-3 hover:text-foreground hover:underline">
          Limpiar
        </button>
      )}

      <span className="flex-1" />

      {v.sinGuardar && !guardando && (
        <span className="inline-flex items-center gap-2">
          <span className="text-text-3">Cambios sin guardar</span>
          <Button size="sm" variant="ghost" onClick={v.descartar}>
            Descartar
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setNombre("");
              setError(null);
              setGuardando(true);
            }}
          >
            <Save className="size-3.5" /> Guardar vista
          </Button>
        </span>
      )}
      {guardando && (
        <form
          className="inline-flex flex-wrap items-center gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!nombre.trim()) return;
            const err = await v.guardarNueva(nombre.trim(), compartida);
            if (err) setError(err);
            else setGuardando(false);
          }}
        >
          <Input
            autoFocus
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre de la vista"
            aria-label="Nombre de la vista"
            maxLength={60}
            className="h-8 w-48"
          />
          <label className="inline-flex items-center gap-1.5 text-text-2">
            <input type="checkbox" checked={compartida} onChange={(e) => setCompartida(e.target.checked)} />
            Para todo el equipo
          </label>
          <Button size="sm" type="submit" disabled={!nombre.trim()}>
            Guardar
          </Button>
          <Button size="sm" type="button" variant="ghost" onClick={() => setGuardando(false)}>
            Cancelar
          </Button>
          {error && <span className="text-danger-text">{error}</span>}
        </form>
      )}
      {derecha}
    </div>
  );
}
