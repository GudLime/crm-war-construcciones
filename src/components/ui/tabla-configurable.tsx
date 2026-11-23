"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Columns3, EyeOff, RotateCcw, X } from "lucide-react";
import { Menu, MenuItem, MenuSeparador, MenuTitulo } from "@/components/ui/menu";
import {
  ANCHO_MINIMO_TABLA,
  enPosicion,
  leerPrefTabla,
  moverColumna,
  ordenarFilas,
  PREF_TABLA_VACIA,
  type PrefTabla,
} from "@/lib/tabla";
import { cn } from "@/lib/utils";

/**
 * v2, punto 5 — La tabla de trabajo diario, igual a la de Oportunidades: tocar
 * el título abre «Ordenar ↑ / ↓ / Quitar orden» y «Ocultar columna»; el borde
 * del título cambia el ancho (doble clic, el de siempre); y el título se
 * arrastra para mover la columna de lugar. «Columnas N/M» elige cuáles se ven
 * y restablece. Todo se recuerda en este navegador, por tabla.
 */

export type ColumnaTabla<T> = {
  clave: string;
  titulo: string;
  /** Ancho por defecto, en px. */
  ancho: number;
  /** No se puede ocultar. */
  fija?: boolean;
  alinear?: "derecha";
  /** Sin esto la columna no ordena. */
  valor?: (fila: T) => string | number | null;
  criterioAsc?: string;
  criterioDesc?: string;
  celda: (fila: T) => React.ReactNode;
  /** Algo al lado del título (un botón propio de la columna). */
  extraTitulo?: React.ReactNode;
};

const GUARDADO = "vocero:tabla:";

/** Las preferencias de una tabla (por `clave`), recordadas en este navegador. */
export function usePrefTabla(clave: string): [PrefTabla, (p: PrefTabla) => void] {
  const [pref, setPref] = useState<PrefTabla>(PREF_TABLA_VACIA);
  const cargado = useRef(false);
  useEffect(() => {
    try {
      setPref(leerPrefTabla(JSON.parse(window.localStorage.getItem(GUARDADO + clave) ?? "null")));
    } catch {
      // sin almacenamiento
    }
    cargado.current = true;
  }, [clave]);
  useEffect(() => {
    if (!cargado.current) return;
    try {
      window.localStorage.setItem(GUARDADO + clave, JSON.stringify(pref));
    } catch {
      // sin almacenamiento: queda en memoria
    }
  }, [pref, clave]);
  return [pref, setPref];
}

/** «Columnas N/M»: cuáles se ven, mostrar todas y restablecer orden y anchos. */
export function SelectorColumnasTabla<T>({
  columnas,
  pref,
  setPref,
}: {
  columnas: readonly ColumnaTabla<T>[];
  pref: PrefTabla;
  setPref: (p: PrefTabla) => void;
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
      {enPosicion(columnas, pref.posiciones).map((c) => {
        const on = !pref.ocultas.includes(c.clave);
        return (
          <MenuItem
            key={c.clave}
            casilla={on}
            disabled={c.fija}
            onClick={() => setPref({ ...pref, ocultas: on ? [...pref.ocultas, c.clave] : pref.ocultas.filter((x) => x !== c.clave) })}
            extra={c.fija ? <span className="text-[11px] text-text-3">fija</span> : undefined}
          >
            {c.titulo}
          </MenuItem>
        );
      })}
      <MenuSeparador />
      {pref.ocultas.length > 0 && <MenuItem onClick={() => setPref({ ...pref, ocultas: [] })}>Mostrar todas</MenuItem>}
      <MenuItem
        icono={<RotateCcw className="size-3.5" />}
        onClick={() => setPref({ ...pref, posiciones: [], anchos: {} })}
      >
        Restablecer orden y anchos
      </MenuItem>
    </Menu>
  );
}

export function TablaConfigurable<T>({
  columnas,
  filas,
  pref,
  setPref,
  claveDe,
  onFila,
  propsFila,
  ordenExterno = false,
  antesDeFila,
  despuesDeFila,
  filaCompleta,
}: {
  columnas: readonly ColumnaTabla<T>[];
  filas: readonly T[];
  pref: PrefTabla;
  setPref: (p: PrefTabla) => void;
  claveDe: (fila: T) => string;
  onFila?: (fila: T) => void;
  /** Clase y estilo de cada fila (por ejemplo, el fondo por etapa). */
  propsFila?: (fila: T) => { className?: string; style?: React.CSSProperties };
  /** El orden lo resuelve el servidor (lista paginada): las filas llegan ordenadas. */
  ordenExterno?: boolean;
  /** Algo antes de una fila (por ejemplo, el título de un grupo); recibe el índice. */
  antesDeFila?: (fila: T, i: number, colSpan: number) => React.ReactNode;
  /** Algo después de una fila (por ejemplo, su formulario de edición abierto). */
  despuesDeFila?: (fila: T, colSpan: number) => React.ReactNode;
  /** Una fila que no es de datos (el título de un grupo): si devuelve algo, se pinta eso en lugar de las celdas. */
  filaCompleta?: (fila: T, colSpan: number) => React.ReactNode | null;
}) {
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const visibles = useMemo(
    () => enPosicion(columnas, pref.posiciones).filter((c) => !pref.ocultas.includes(c.clave)),
    [columnas, pref.posiciones, pref.ocultas]
  );
  const anchoDe = (c: ColumnaTabla<T>) => pref.anchos[c.clave] ?? c.ancho;
  const total = visibles.reduce((s, c) => s + anchoDe(c), 0);
  const ordenadas = useMemo(() => {
    if (ordenExterno || !pref.orden) return filas;
    const col = columnas.find((c) => c.clave === pref.orden!.columna);
    if (!col?.valor) return filas;
    return ordenarFilas(filas, pref.orden, (f) => col.valor!(f));
  }, [filas, pref.orden, columnas, ordenExterno]);

  function cambiarAncho(e: React.MouseEvent, c: ColumnaTabla<T>) {
    e.preventDefault();
    e.stopPropagation();
    const x0 = e.clientX;
    const inicial = anchoDe(c);
    const mover = (ev: MouseEvent) => {
      const ancho = Math.max(ANCHO_MINIMO_TABLA, Math.round(inicial + ev.clientX - x0));
      setPref({ ...pref, anchos: { ...pref.anchos, [c.clave]: ancho } });
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

  function soltarEn(destino: string) {
    if (!arrastrando || arrastrando === destino) return;
    const orden = enPosicion(columnas, pref.posiciones).map((c) => c.clave);
    setPref({ ...pref, posiciones: moverColumna(orden, arrastrando, destino) });
  }

  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="table-fixed border-collapse text-left text-sm" style={{ width: Math.max(total, 0), minWidth: "100%" }}>
        <colgroup>
          {visibles.map((c) => (
            <col key={c.clave} style={{ width: anchoDe(c) }} />
          ))}
        </colgroup>
        <thead className="border-b bg-subtle">
          <tr>
            {visibles.map((c) => {
              const dir = pref.orden?.columna === c.clave ? pref.orden.dir : null;
              return (
                <th
                  key={c.clave}
                  aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : undefined}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", c.clave);
                    setArrastrando(c.clave);
                  }}
                  onDragOver={(e) => {
                    if (!arrastrando) return;
                    e.preventDefault();
                    if (sobre !== c.clave) setSobre(c.clave);
                  }}
                  onDragLeave={() => setSobre((s) => (s === c.clave ? null : s))}
                  onDrop={(e) => {
                    e.preventDefault();
                    soltarEn(c.clave);
                    setArrastrando(null);
                    setSobre(null);
                  }}
                  onDragEnd={() => {
                    setArrastrando(null);
                    setSobre(null);
                  }}
                  title="Arrastrá el título para mover la columna"
                  className={cn(
                    "group relative cursor-grab px-1.5 py-1 text-xs font-medium text-text-3 active:cursor-grabbing",
                    arrastrando === c.clave && "opacity-50",
                    sobre === c.clave && arrastrando !== c.clave && "bg-brand-tint shadow-[inset_2px_0_0_var(--accent)]"
                  )}
                >
                  <span className={cn("flex min-w-0 items-center gap-0.5", c.alinear === "derecha" && "justify-end")}>
                  <Menu
                    boton={(abierto, alternar) => (
                      <button
                        type="button"
                        aria-haspopup="menu"
                        aria-expanded={abierto}
                        onClick={alternar}
                        className={cn(
                          "inline-flex h-7 max-w-full items-center gap-1 rounded-md px-1.5 hover:bg-accent hover:text-foreground",
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
                        {c.valor && (
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
                              Ascendente{c.criterioAsc ? ` · ${c.criterioAsc}` : ""}
                            </MenuItem>
                            <MenuItem
                              icono={<ArrowDown className="size-3.5" />}
                              marcado={dir === "desc"}
                              onClick={() => {
                                setPref({ ...pref, orden: { columna: c.clave, dir: "desc" } });
                                cerrar();
                              }}
                            >
                              Descendente{c.criterioDesc ? ` · ${c.criterioDesc}` : ""}
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
                          </>
                        )}
                        {!c.fija && (
                          <>
                            {c.valor && <MenuSeparador />}
                            <MenuItem
                              icono={<EyeOff className="size-3.5" />}
                              onClick={() => {
                                setPref({ ...pref, ocultas: [...pref.ocultas, c.clave], orden: dir ? null : pref.orden });
                                cerrar();
                              }}
                            >
                              Ocultar columna
                            </MenuItem>
                          </>
                        )}
                        {c.fija && !c.valor && <p className="px-3 py-2 text-[12px] text-text-3">Columna fija</p>}
                      </>
                    )}
                  </Menu>
                  {c.extraTitulo}
                  </span>
                  <span
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={`Ancho de ${c.titulo}`}
                    title="Arrastrá para cambiar el ancho · doble clic para restablecer"
                    draggable={false}
                    onDragStart={(e) => e.preventDefault()}
                    onMouseDown={(e) => cambiarAncho(e, c)}
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
          {ordenadas.map((f, i) => {
            const completa = filaCompleta?.(f, visibles.length);
            if (completa) return <FilaConAntes key={claveDe(f)} antes={null}>{completa}</FilaConAntes>;
            const extra = propsFila?.(f);
            return (
              <FilaConAntes key={claveDe(f)} antes={antesDeFila?.(f, i, visibles.length)} despues={despuesDeFila?.(f, visibles.length)}>
                <tr
                  onClick={onFila ? () => onFila(f) : undefined}
                  className={cn("group border-b last:border-0", onFila && "cursor-pointer", extra?.className ?? "hover:bg-subtle")}
                  style={extra?.style}
                >
                  {visibles.map((c) => (
                    <td key={c.clave} className={cn("overflow-hidden px-3 py-2.5 align-middle", c.alinear === "derecha" && "text-right")}>
                      {c.celda(f)}
                    </td>
                  ))}
                </tr>
              </FilaConAntes>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FilaConAntes({ antes, despues, children }: { antes: React.ReactNode; despues?: React.ReactNode; children: React.ReactNode }) {
  return (
    <>
      {antes}
      {children}
      {despues}
    </>
  );
}
