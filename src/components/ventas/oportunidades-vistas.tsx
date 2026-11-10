"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Columns3,
  EyeOff,
  KanbanSquare,
  LayoutGrid,
  List,
  Maximize2,
  X,
} from "lucide-react";
import { Menu, MenuItem, MenuSeparador, MenuTitulo } from "@/components/ui/menu";
import { PanelLateral } from "@/components/ui/panel-lateral";
import { WhatsAppLogo } from "@/components/whatsapp-logo";
import {
  COLUMNAS,
  OCULTAS_POR_DEFECTO,
  anchoArrastrado,
  columnasPipeline,
  ordenar,
  type ClaveColumna,
  type FormaDeVer,
  type Orden,
} from "@/lib/oportunidades-lista";
import type { OrigenDto } from "@/lib/origenes";
import { cn } from "@/lib/utils";
import { CAMINO_OPORTUNIDAD, ESTADOS_OPORTUNIDAD, TIPOLOGIAS, etiqueta } from "@/lib/ventas";
import type { OportunidadDto } from "@/server/ventas";
import { OrigenIcono } from "./origen-icono";
import { PildoraEdificio, estiloDeEdificio } from "./pildora-edificio";
import { EstadoPill, plata } from "./ui";

/**
 * Las tres formas de ver las oportunidades: Lista (tabla con orden, columnas
 * ocultables y ancho ajustable), Mosaico y Pipeline. Un clic en la fila o la
 * tarjeta abre el panel lateral; el ícono de dos flechas abre la página.
 * Forma, columnas, orden y anchos se recuerdan en este navegador.
 */

const GUARDADO = "oportunidades.vista.v1";

type Preferencias = {
  forma: FormaDeVer;
  ocultas: ClaveColumna[];
  orden: Orden;
  anchos: Partial<Record<ClaveColumna, number>>;
};

const PREFERENCIAS: Preferencias = {
  forma: "lista",
  ocultas: [...OCULTAS_POR_DEFECTO],
  orden: null,
  anchos: {},
};

function leerPreferencias(): Preferencias {
  try {
    const t = window.localStorage.getItem(GUARDADO);
    if (!t) return PREFERENCIAS;
    return { ...PREFERENCIAS, ...(JSON.parse(t) as Partial<Preferencias>) };
  } catch {
    return PREFERENCIAS;
  }
}

/** "hace 5 min", "hace 3 h", "ayer", o la fecha corta. */
export function haceCuanto(iso: string, ahora: number = Date.now()): string {
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

function iniciales(nombre: string): string {
  const partes = nombre.replace(/[^\p{L}\s]/gu, " ").trim().split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] ?? "?") + (partes[1]?.[0] ?? "")).toUpperCase();
}

function edificiosDe(o: OportunidadDto) {
  return o.edificios.length
    ? o.edificios
    : o.edificioId && o.edificioNombre
      ? [{ id: o.edificioId, nombre: o.edificioNombre, color: null }]
      : [];
}

function Avatar({ o, grande }: { o: OportunidadDto; grande?: boolean }) {
  const color = edificiosDe(o)[0]?.color;
  return (
    <span
      aria-hidden
      style={color ? estiloDeEdificio(color) : undefined}
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-bold",
        grande ? "size-9 text-[12.5px]" : "size-7 text-[11px]",
        color ? "pildora-edificio" : "bg-brand-tint text-brand-ink"
      )}
    >
      {iniciales(o.nombre)}
    </span>
  );
}

function BotonAbrir({ o, className }: { o: OportunidadDto; className?: string }) {
  return (
    <Link
      href={`/oportunidades/${o.id}`}
      aria-label={`Abrir ${o.nombre}`}
      title="Abrir oportunidad"
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "grid size-[26px] shrink-0 place-items-center rounded-md border border-border bg-card text-text-2 shadow-sm transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100",
        "[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100",
        className
      )}
    >
      <Maximize2 className="size-3.5" />
    </Link>
  );
}

function Etiquetas({ valores }: { valores: string[] }) {
  if (!valores.length) return <span className="text-text-3">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {valores.map((v) => (
        <span key={v} className="rounded-md bg-subtle px-1.5 py-px text-[12px] font-medium text-text-2">
          {v}
        </span>
      ))}
    </span>
  );
}

function Alerta({ o }: { o: OportunidadDto }) {
  if (o.paraCerrar) {
    return (
      <span className="rounded-full bg-danger-tint px-2 py-px text-[11px] font-medium text-danger-text">
        Para cerrar · no responde
      </span>
    );
  }
  return o.sinRespuesta ? <span className="text-[11px] text-warning-text">{o.sinRespuesta}</span> : null;
}

type IconoDe = Map<string, OrigenDto>;

function Origen({ o, iconoDe, conFormularios = true }: { o: OportunidadDto; iconoDe: IconoDe; conFormularios?: boolean }) {
  if (!o.origen) return <span className="text-text-3">—</span>;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <OrigenIcono icono={iconoDe.get(o.origen)?.icono} imagen={iconoDe.get(o.origen)?.imagen} />
      <span className="truncate">{o.origen}</span>
      {conFormularios && o.formularios > 1 && (
        <span className="shrink-0 text-xs text-text-3">· {o.formularios} formularios</span>
      )}
    </span>
  );
}

/** War — la oportunidad con el nombre de su responsable. */
type Fila = OportunidadDto & { responsableNombre?: string | null };

/** Lo que se ve en cada celda de la Lista. */
function celda(c: ClaveColumna, o: Fila, iconoDe: IconoDe, moneda: string) {
  switch (c) {
    case "nombre":
      return (
        <span className="flex min-w-0 items-center gap-2.5 font-medium">
          <Avatar o={o} />
          <span className="truncate">{o.nombre}</span>
          <BotonAbrir o={o} />
        </span>
      );
    case "origen":
      return <Origen o={o} iconoDe={iconoDe} />;
    case "interes": {
      const eds = edificiosDe(o);
      return eds.length ? (
        <span className="flex flex-wrap gap-1">
          {eds.map((e) => (
            <PildoraEdificio key={e.id} nombre={e.nombre} color={e.color} />
          ))}
        </span>
      ) : (
        <span className="text-text-3">—</span>
      );
    }
    case "tipologia":
      return <Etiquetas valores={o.tipologias.map((t) => etiqueta(TIPOLOGIAS, t))} />;
    case "departamento":
      return o.unidad ? (
        <span className="inline-block rounded-full border border-border px-2 py-px text-[12px]">{o.unidad}</span>
      ) : (
        <span className="text-text-3">—</span>
      );
    case "estado":
      return (
        <span className="flex flex-col items-start gap-1">
          <EstadoPill opciones={ESTADOS_OPORTUNIDAD} value={o.estado} />
          <Alerta o={o} />
        </span>
      );
    case "responsable":
      return o.responsableNombre ? (
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <span className="grid size-5 shrink-0 place-items-center rounded-full bg-brand-soft text-[10px] font-bold text-brand-ink">
            {o.responsableNombre.trim()[0]?.toUpperCase()}
          </span>
          <span className="truncate">{o.responsableNombre}</span>
        </span>
      ) : (
        <span className="text-text-3">Sin asignar</span>
      );
    case "ultima":
      return (
        <span className="whitespace-nowrap text-text-2" title={new Date(o.ultimaInteraccion).toLocaleString("es-AR")}>
          {haceCuanto(o.ultimaInteraccion)}
        </span>
      );
    case "valor":
      return <span className="tabular-nums">{plata(o.valorCents, o.moneda, moneda)}</span>;
  }
}

export function SelectorDeForma({ forma, onCambio }: { forma: FormaDeVer; onCambio: (f: FormaDeVer) => void }) {
  const opciones: [FormaDeVer, string, typeof List][] = [
    ["lista", "Lista", List],
    ["mosaico", "Mosaico", LayoutGrid],
    ["pipeline", "Pipeline", KanbanSquare],
  ];
  return (
    <div role="tablist" aria-label="Forma de ver" className="inline-flex gap-0.5 rounded-full bg-muted p-[3px]">
      {opciones.map(([valor, texto, Icono]) => (
        <button
          key={valor}
          type="button"
          role="tab"
          aria-selected={forma === valor}
          onClick={() => onCambio(valor)}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-colors",
            forma === valor ? "bg-card text-foreground shadow-sm" : "text-text-2 hover:text-foreground"
          )}
        >
          <Icono className="size-3.5" />
          {texto}
        </button>
      ))}
    </div>
  );
}

/** El estado de la página: forma de ver, columnas, orden y anchos (recordados en este navegador). */
export function usePreferenciasDeLista() {
  const [pref, setPref] = useState<Preferencias>(PREFERENCIAS);
  const cargado = useRef(false);
  useEffect(() => {
    setPref(leerPreferencias());
    cargado.current = true;
  }, []);
  useEffect(() => {
    if (!cargado.current) return;
    try {
      window.localStorage.setItem(GUARDADO, JSON.stringify(pref));
    } catch {
      // sin almacenamiento: queda en memoria
    }
  }, [pref]);
  return [pref, setPref] as const;
}

export type PreferenciasDeLista = Preferencias;

/** «Columnas N/M», solo en la Lista. */
export function SelectorDeColumnas({
  pref,
  setPref,
  columnas = COLUMNAS,
}: {
  pref: Preferencias;
  setPref: (p: Preferencias) => void;
  columnas?: readonly (typeof COLUMNAS)[number][];
}) {
  const visibles = columnas.filter((c) => !pref.ocultas.includes(c.clave)).length;
  return (
    <Menu
      alinear="derecha"
      boton={(abierto, alternar) => (
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={abierto}
          onClick={alternar}
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-[13px] font-medium hover:bg-accent"
        >
          <Columns3 className="size-3.5" /> Columnas
          <span className="text-text-3">
            {visibles}/{columnas.length}
          </span>
        </button>
      )}
    >
      <MenuTitulo>Columnas visibles</MenuTitulo>
      {columnas.map((c) => {
        const on = !pref.ocultas.includes(c.clave);
        return (
          <MenuItem
            key={c.clave}
            casilla={on}
            disabled={c.fija}
            onClick={() =>
              setPref({
                ...pref,
                ocultas: on ? [...pref.ocultas, c.clave] : pref.ocultas.filter((x) => x !== c.clave),
              })
            }
            extra={c.fija ? <span className="text-[11px] text-text-3">fija</span> : undefined}
          >
            {c.titulo}
          </MenuItem>
        );
      })}
      {pref.ocultas.length > 0 && (
        <>
          <MenuSeparador />
          <MenuItem onClick={() => setPref({ ...pref, ocultas: [] })}>Mostrar todas</MenuItem>
        </>
      )}
    </Menu>
  );
}

export function VistaOportunidades({
  filas,
  forma,
  pref,
  setPref,
  iconoDe,
  moneda,
}: {
  filas: OportunidadDto[];
  forma: FormaDeVer;
  pref: Preferencias;
  setPref: (p: Preferencias) => void;
  iconoDe: IconoDe;
  moneda: string;
}) {
  const [panel, setPanel] = useState<string | null>(null);
  // War — los nombres del equipo, para la columna Responsable.
  const [equipo, setEquipo] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    void fetch("/api/oportunidades/responsables")
      .then((r) => (r.ok ? r.json() : { responsables: [] }))
      .then((d: { responsables: { userId: string; nombre: string }[] }) =>
        setEquipo(new Map(d.responsables.map((r) => [r.userId, r.nombre])))
      )
      .catch(() => undefined);
  }, []);
  const conResponsable = useMemo<Fila[]>(
    () => filas.map((o) => ({ ...o, responsableNombre: o.responsableId ? (equipo.get(o.responsableId) ?? null) : null })),
    [filas, equipo]
  );
  const ordenadas = useMemo(() => ordenar(conResponsable, pref.orden), [conResponsable, pref.orden]);
  const abierta = panel ? filas.find((f) => f.id === panel) : undefined;

  return (
    <>
      {forma === "lista" && (
        <Lista filas={ordenadas} pref={pref} setPref={setPref} iconoDe={iconoDe} moneda={moneda} onElegir={setPanel} />
      )}
      {forma === "mosaico" && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3">
          {ordenadas.map((o) => (
            <Tarjeta key={o.id} o={o} iconoDe={iconoDe} onElegir={setPanel} />
          ))}
        </div>
      )}
      {forma === "pipeline" && <Pipeline filas={ordenadas} iconoDe={iconoDe} moneda={moneda} onElegir={setPanel} />}
      {abierta && <PanelOportunidad o={abierta} iconoDe={iconoDe} moneda={moneda} onCerrar={() => setPanel(null)} />}
    </>
  );
}

function Lista({
  filas,
  pref,
  setPref,
  iconoDe,
  moneda,
  onElegir,
}: {
  filas: Fila[];
  pref: Preferencias;
  setPref: (p: Preferencias) => void;
  iconoDe: IconoDe;
  moneda: string;
  onElegir: (id: string) => void;
}) {
  const columnas = COLUMNAS.filter((c) => !pref.ocultas.includes(c.clave));
  const anchoDe = (c: (typeof COLUMNAS)[number]) => pref.anchos[c.clave] ?? c.ancho;
  const total = columnas.reduce((s, c) => s + anchoDe(c), 0);

  function arrastrar(e: React.MouseEvent, c: (typeof COLUMNAS)[number]) {
    e.preventDefault();
    e.stopPropagation();
    const x0 = e.clientX;
    const inicial = anchoDe(c);
    let ultimo = inicial;
    const mover = (ev: MouseEvent) => {
      ultimo = anchoArrastrado(inicial, ev.clientX - x0);
      setPref({ ...pref, anchos: { ...pref.anchos, [c.clave]: ultimo } });
    };
    const soltar = () => {
      document.removeEventListener("mousemove", mover);
      document.removeEventListener("mouseup", soltar);
      document.body.style.cursor = "";
    };
    document.body.style.cursor = "col-resize";
    document.addEventListener("mousemove", mover);
    document.addEventListener("mouseup", soltar);
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="table-fixed border-collapse text-left text-sm" style={{ width: Math.max(total, 0), minWidth: "100%" }}>
        <colgroup>
          {columnas.map((c) => (
            <col key={c.clave} style={{ width: anchoDe(c) }} />
          ))}
        </colgroup>
        <thead className="border-b bg-subtle">
          <tr>
            {columnas.map((c) => {
              const dir = pref.orden?.columna === c.clave ? pref.orden.dir : null;
              return (
                <th
                  key={c.clave}
                  aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : undefined}
                  className="group relative px-1.5 py-1 text-xs font-medium text-text-3"
                >
                  <Menu
                    boton={(abierto, alternar) => (
                      <button
                        type="button"
                        aria-haspopup="menu"
                        aria-expanded={abierto}
                        onClick={alternar}
                        className={cn(
                          "inline-flex h-7 max-w-full items-center gap-1 rounded-md px-1.5 hover:bg-accent hover:text-foreground",
                          c.alinear === "derecha" && "ml-auto",
                          dir && "text-foreground"
                        )}
                      >
                        <span className="truncate">{c.titulo}</span>
                        {dir === "asc" && <ArrowUp className="size-3.5 shrink-0 text-brand-ink" />}
                        {dir === "desc" && <ArrowDown className="size-3.5 shrink-0 text-brand-ink" />}
                      </button>
                    )}
                  >
                    {(cerrar) => (
                      <>
                        <MenuTitulo>Ordenar</MenuTitulo>
                        <MenuItem
                          icono={<ArrowUp className="size-3.5" />}
                          marcado={dir === "asc"}
                          onClick={() => {
                            setPref({ ...pref, orden: { columna: c.clave, dir: "asc" } });
                            cerrar();
                          }}
                        >
                          Ascendente · {c.criterioAsc}
                        </MenuItem>
                        <MenuItem
                          icono={<ArrowDown className="size-3.5" />}
                          marcado={dir === "desc"}
                          onClick={() => {
                            setPref({ ...pref, orden: { columna: c.clave, dir: "desc" } });
                            cerrar();
                          }}
                        >
                          Descendente · {c.criterioDesc}
                        </MenuItem>
                        {dir && (
                          <MenuItem
                            icono={<X className="size-3.5" />}
                            onClick={() => {
                              setPref({ ...pref, orden: null });
                              cerrar();
                            }}
                          >
                            Quitar orden
                          </MenuItem>
                        )}
                        {!c.fija && (
                          <>
                            <MenuSeparador />
                            <MenuItem
                              icono={<EyeOff className="size-3.5" />}
                              onClick={() => {
                                setPref({
                                  ...pref,
                                  ocultas: [...pref.ocultas, c.clave],
                                  orden: dir ? null : pref.orden,
                                });
                                cerrar();
                              }}
                            >
                              Ocultar columna
                            </MenuItem>
                          </>
                        )}
                      </>
                    )}
                  </Menu>
                  <span
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={`Ancho de ${c.titulo}`}
                    title="Arrastrá para cambiar el ancho · doble clic para restablecer"
                    onMouseDown={(e) => arrastrar(e, c)}
                    onDoubleClick={() => {
                      const { [c.clave]: _fuera, ...resto } = pref.anchos;
                      setPref({ ...pref, anchos: resto });
                    }}
                    className="absolute inset-y-0 right-0 z-10 flex w-2 cursor-col-resize justify-center opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <span className="my-1.5 w-[3px] rounded-full bg-border-strong hover:bg-brand" />
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {filas.map((o) => (
            <tr
              key={o.id}
              onClick={() => onElegir(o.id)}
              className="group cursor-pointer border-b last:border-0 hover:bg-accent/40"
            >
              {columnas.map((c) => (
                <td
                  key={c.clave}
                  className={cn("overflow-hidden px-3 py-2.5 align-middle", c.alinear === "derecha" && "text-right")}
                >
                  {celda(c.clave, o, iconoDe, moneda)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {filas.length === 0 && <p className="p-6 text-center text-sm text-text-3">No hay oportunidades para mostrar.</p>}
    </div>
  );
}

function Tarjeta({
  o,
  iconoDe,
  onElegir,
  compacta,
}: {
  o: OportunidadDto;
  iconoDe: IconoDe;
  onElegir: (id: string) => void;
  compacta?: boolean;
}) {
  const eds = edificiosDe(o);
  const detalle = [o.unidad ? `U. ${o.unidad}` : "", o.tipologias.map((t) => etiqueta(TIPOLOGIAS, t)).join(", ")]
    .filter(Boolean)
    .join(" · ");
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onElegir(o.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onElegir(o.id);
        }
      }}
      className="group relative flex cursor-pointer flex-col gap-2.5 rounded-[10px] border border-border bg-card p-3.5 text-[13px] transition-shadow hover:border-border-strong hover:shadow-sm"
    >
      <BotonAbrir o={o} className="absolute right-2.5 top-2.5" />
      <div className="flex items-center gap-2.5 pr-8">
        <Avatar o={o} grande={!compacta} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{o.nombre}</p>
          {!compacta && <p className="text-[12px] text-text-3">{haceCuanto(o.ultimaInteraccion)}</p>}
        </div>
      </div>
      {(eds.length > 0 || detalle) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {eds.map((e) => (
            <PildoraEdificio key={e.id} nombre={e.nombre} color={e.color} />
          ))}
          {detalle && <span className="text-[12px] text-text-3">{detalle}</span>}
        </div>
      )}
      <div className="flex items-center justify-between gap-2 text-[12.5px] text-text-2">
        <Origen o={o} iconoDe={iconoDe} conFormularios={false} />
        {compacta ? (
          <span className="shrink-0 text-[12px] text-text-3">{haceCuanto(o.ultimaInteraccion)}</span>
        ) : (
          <EstadoPill opciones={ESTADOS_OPORTUNIDAD} value={o.estado} />
        )}
      </div>
      <Alerta o={o} />
    </div>
  );
}

const PUNTO_ETAPA: Record<string, string> = {
  recibido: "bg-text-3",
  en_charlas: "bg-info",
  conoce_informacion: "bg-warning",
  visito: "bg-brand",
  reservo: "bg-brand",
  compro: "bg-success",
};

function Pipeline({
  filas,
  iconoDe,
  moneda,
  onElegir,
}: {
  filas: OportunidadDto[];
  iconoDe: IconoDe;
  moneda: string;
  onElegir: (id: string) => void;
}) {
  const columnas = columnasPipeline(filas, CAMINO_OPORTUNIDAD);
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {columnas.map((c) => (
        <section
          key={c.estado}
          className="flex w-64 shrink-0 flex-col gap-2 rounded-[10px] border border-border bg-subtle p-2.5"
        >
          <header className="flex items-center justify-between gap-2 px-1 pb-1">
            <span className="inline-flex items-center gap-2">
              <span aria-hidden className={cn("size-2 rounded-full", PUNTO_ETAPA[c.estado] ?? "bg-text-3")} />
              <span className="text-[13.5px] font-semibold">{etiqueta(ESTADOS_OPORTUNIDAD, c.estado)}</span>
              <span className="rounded-full bg-muted px-[7px] py-px text-[11.5px] font-semibold text-text-2">
                {c.items.length}
              </span>
            </span>
            {c.total > 0 && (
              <span className="text-[11.5px] tabular-nums text-text-3">{plata(c.total, null, moneda)}</span>
            )}
          </header>
          {c.items.map((o) => (
            <Tarjeta key={o.id} o={o} iconoDe={iconoDe} onElegir={onElegir} compacta />
          ))}
          {c.items.length === 0 && <p className="px-1 py-3 text-center text-[12px] text-text-3">Nada acá</p>}
        </section>
      ))}
    </div>
  );
}

/** Lo esencial de una oportunidad sin salir de la lista. */
function PanelOportunidad({
  o,
  iconoDe,
  moneda,
  onCerrar,
}: {
  o: OportunidadDto;
  iconoDe: IconoDe;
  moneda: string;
  onCerrar: () => void;
}) {
  const eds = edificiosDe(o);
  const filas: [string, React.ReactNode][] = [
    ["Estado", <EstadoPill key="e" opciones={ESTADOS_OPORTUNIDAD} value={o.estado} />],
    ["Origen", <Origen key="o" o={o} iconoDe={iconoDe} />],
    [
      "Interés",
      eds.length ? (
        <span key="i" className="flex flex-wrap gap-1">
          {eds.map((e) => (
            <PildoraEdificio key={e.id} nombre={e.nombre} color={e.color} href={`/edificios/${e.id}`} />
          ))}
        </span>
      ) : (
        "—"
      ),
    ],
    ["Tipología", <Etiquetas key="t" valores={o.tipologias.map((t) => etiqueta(TIPOLOGIAS, t))} />],
    ["Departamento", o.unidad ?? "—"],
    ["Valor", plata(o.valorCents, o.moneda, moneda)],
    ["Última interacción", haceCuanto(o.ultimaInteraccion)],
    ["Contacto", o.contactId ? <Link key="c" href={`/contacts/${o.contactId}`} className="text-brand-ink hover:underline">{o.contactoNombre ?? "Ver contacto"}</Link> : "—"],
  ];
  return (
    <PanelLateral
      onCerrar={onCerrar}
      titulo={
        <div className="flex items-center gap-2.5">
          <Avatar o={o} grande />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold">{o.nombre}</p>
            <Alerta o={o} />
          </div>
        </div>
      }
      pie={
        <div className="flex gap-2">
          <Link
            href={`/oportunidades/${o.id}`}
            className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full border border-border text-sm font-medium hover:bg-accent"
          >
            <Maximize2 className="size-3.5" /> Abrir oportunidad
          </Link>
          {o.contactId && (
            <Link
              href={`/inbox?contact=${o.contactId}`}
              className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full bg-brand text-sm font-semibold text-brand-fg hover:bg-brand-hover"
            >
              <WhatsAppLogo /> Ir al chat
            </Link>
          )}
        </div>
      }
    >
      <dl className="space-y-0.5 p-4 text-[13.5px]">
        {filas.map(([k, v]) => (
          <div key={k} className="flex min-h-[32px] items-center gap-3">
            <dt className="w-[120px] shrink-0 text-text-3">{k}</dt>
            <dd className="min-w-0 flex-1 font-medium">{v}</dd>
          </div>
        ))}
      </dl>
    </PanelLateral>
  );
}
