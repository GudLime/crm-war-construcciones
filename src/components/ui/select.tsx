"use client";

import { Check, ChevronDown, Search } from "lucide-react";
import {
  Children,
  Fragment,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/**
 * El desplegable del CRM. Reemplaza al `<select>` nativo, que en cada sistema
 * se abre con el menú de fábrica (en Mac, la lista gris del sistema) y no
 * respeta el diseño ni el tema oscuro.
 *
 * Se escribe igual que un `<select>`: los mismos `<option>` y `<optgroup>`
 * adentro, así que pasar de uno a otro es cambiar la etiqueta y el
 * `onChange` por `onValueChange`. `tests/unit/select.test.ts` impide que
 * vuelvan a aparecer `<select>` nativos.
 *
 * Accesible como el patrón "select-only combobox" de WAI-ARIA: el botón es
 * el `combobox`, la lista un `listbox`, y se maneja entero con el teclado
 * (flechas, Inicio/Fin, Enter/Espacio, Escape y escribir para saltar). Con
 * muchas opciones suma un buscador.
 */

export type OpcionSelect = {
  value: string;
  label: string;
  disabled: boolean;
  grupo: string | null;
};

/** El texto de un `<option>`: `{t.name} ({t.language})` → "Nombre (es)". */
function textoDe(nodo: ReactNode): string {
  if (nodo === null || nodo === undefined || typeof nodo === "boolean") return "";
  if (typeof nodo === "string" || typeof nodo === "number") return String(nodo);
  if (Array.isArray(nodo)) return nodo.map(textoDe).join("");
  if (isValidElement<{ children?: ReactNode }>(nodo)) return textoDe(nodo.props.children);
  return "";
}

/** Lee los `<option>`/`<optgroup>` (también dentro de fragmentos y condicionales). */
export function leerOpciones(
  children: ReactNode,
  grupo: string | null = null,
  out: OpcionSelect[] = []
): OpcionSelect[] {
  Children.forEach(children, (hijo) => {
    if (!isValidElement(hijo)) return;
    const props = hijo.props as {
      value?: string | number;
      children?: ReactNode;
      disabled?: boolean;
      label?: string;
    };
    if (hijo.type === "option") {
      const label = textoDe(props.children);
      out.push({
        value: props.value === undefined ? label : String(props.value),
        label,
        disabled: Boolean(props.disabled),
        grupo,
      });
    } else if (hijo.type === "optgroup") {
      leerOpciones(props.children, props.label ?? null, out);
    } else if (hijo.type === Fragment) {
      leerOpciones(props.children, grupo, out);
    }
  });
  return out;
}

/** Sin tildes ni mayúsculas, para buscar y para saltar escribiendo. */
function plano(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Desde cuántas opciones aparece el buscador. */
const CON_BUSCADOR = 12;
const ALTO_MAX = 288;
const MARGEN = 6;

type Posicion = {
  /** Abre hacia abajo: `top`; hacia arriba (no entra abajo): `bottom`. */
  top?: number;
  bottom?: number;
  left: number;
  width: number;
  alto: number;
};

export function Select({
  value,
  onValueChange,
  children,
  id,
  disabled,
  placeholder = "Elegí una opción",
  buscador,
  className,
  iconoDe,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
}: {
  value: string | number | null | undefined;
  onValueChange: (value: string) => void;
  children: ReactNode;
  id?: string;
  disabled?: boolean;
  /** Lo que se ve si el valor no es ninguna opción. */
  placeholder?: string;
  /** Forzar o apagar el buscador (por defecto, desde 12 opciones). */
  buscador?: boolean;
  /** Clases del botón (ancho, alto, tamaño de letra). */
  className?: string;
  /** Un ícono delante de cada opción (y de la elegida). `null` = sin ícono. */
  iconoDe?: (value: string) => ReactNode;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}) {
  const opciones = useMemo(() => leerOpciones(children), [children]);
  const actual = value === null || value === undefined ? "" : String(value);
  const elegida = opciones.find((o) => o.value === actual) ?? null;
  const conBuscador = buscador ?? opciones.length >= CON_BUSCADOR;

  const baseId = useId();
  const listaId = `${baseId}-lista`;
  const botonRef = useRef<HTMLButtonElement>(null);
  const listaRef = useRef<HTMLUListElement>(null);
  const buscarRef = useRef<HTMLInputElement>(null);
  const tecleo = useRef({ texto: "", hasta: 0 });

  const [abierto, setAbierto] = useState(false);
  const [activa, setActiva] = useState(-1);
  const [filtro, setFiltro] = useState("");
  const [pos, setPos] = useState<Posicion | null>(null);

  const visibles = useMemo(() => {
    const f = plano(filtro.trim());
    return f ? opciones.filter((o) => plano(o.label).includes(f)) : opciones;
  }, [opciones, filtro]);

  const ubicar = useCallback(() => {
    const boton = botonRef.current;
    if (!boton) return;
    const r = boton.getBoundingClientRect();
    const abajo = window.innerHeight - r.bottom - MARGEN * 2;
    const arribaDisp = r.top - MARGEN * 2;
    const arriba = abajo < Math.min(ALTO_MAX, 200) && arribaDisp > abajo;
    const alto = Math.min(ALTO_MAX, arriba ? arribaDisp : abajo);
    const width = Math.max(r.width, 200);
    const left = Math.min(r.left, window.innerWidth - width - MARGEN);
    setPos({
      ...(arriba
        ? { bottom: window.innerHeight - r.top + MARGEN }
        : { top: r.bottom + MARGEN }),
      left: Math.max(MARGEN, left),
      width,
      alto,
    });
  }, []);

  const abrir = useCallback(() => {
    if (disabled) return;
    setFiltro("");
    const i = opciones.findIndex((o) => o.value === actual);
    setActiva(i >= 0 ? i : opciones.findIndex((o) => !o.disabled));
    ubicar();
    setAbierto(true);
  }, [actual, disabled, opciones, ubicar]);

  const cerrar = useCallback((devolverFoco = true) => {
    setAbierto(false);
    setFiltro("");
    if (devolverFoco) botonRef.current?.focus();
  }, []);

  const elegir = useCallback(
    (o: OpcionSelect | undefined) => {
      if (!o || o.disabled) return;
      if (o.value !== actual) onValueChange(o.value);
      cerrar();
    },
    [actual, cerrar, onValueChange]
  );

  // Seguir al botón si la página (o un diálogo) se desplaza o cambia de tamaño.
  useLayoutEffect(() => {
    if (!abierto) return;
    ubicar();
    window.addEventListener("resize", ubicar);
    window.addEventListener("scroll", ubicar, true);
    return () => {
      window.removeEventListener("resize", ubicar);
      window.removeEventListener("scroll", ubicar, true);
    };
  }, [abierto, ubicar]);

  // Click afuera: se cierra sin robarle el foco a lo que se tocó.
  useEffect(() => {
    if (!abierto) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (botonRef.current?.contains(t) || listaRef.current?.parentElement?.contains(t)) return;
      cerrar(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [abierto, cerrar]);

  useEffect(() => {
    if (abierto && conBuscador) buscarRef.current?.focus();
  }, [abierto, conBuscador]);

  // La activa siempre a la vista.
  useEffect(() => {
    if (!abierto || activa < 0) return;
    document.getElementById(`${baseId}-op-${activa}`)?.scrollIntoView({ block: "nearest" });
  }, [abierto, activa, baseId]);

  /** Al filtrar, la primera que coincide queda activa. */
  function filtrar(texto: string) {
    setFiltro(texto);
    const f = plano(texto.trim());
    const lista = f ? opciones.filter((o) => plano(o.label).includes(f)) : opciones;
    setActiva(lista.findIndex((o) => !o.disabled));
  }

  function mover(desde: number, paso: 1 | -1): number {
    const lista = visibles;
    if (!lista.length) return -1;
    let i = desde;
    for (let n = 0; n < lista.length; n++) {
      i = i + paso;
      if (i < 0 || i >= lista.length) return desde;
      if (!lista[i]!.disabled) return i;
    }
    return desde;
  }

  function extremo(ultimo: boolean): number {
    const idx = visibles.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0);
    return (ultimo ? idx[idx.length - 1] : idx[0]) ?? -1;
  }

  /** Escribir letras salta a la opción que empieza así (como el nativo). */
  function saltarEscribiendo(letra: string) {
    const ahora = Date.now();
    const t = tecleo.current;
    t.texto = ahora < t.hasta ? t.texto + letra : letra;
    t.hasta = ahora + 600;
    const buscado = plano(t.texto);
    const desde = abierto ? activa : opciones.findIndex((o) => o.value === actual);
    const orden = [...opciones.slice(desde + 1), ...opciones.slice(0, desde + 1)];
    const hallada =
      orden.find((o) => !o.disabled && plano(o.label).startsWith(buscado)) ??
      (buscado.length > 1 ? undefined : orden.find((o) => !o.disabled && plano(o.label).startsWith(buscado[0]!)));
    if (!hallada) return;
    if (abierto) setActiva(opciones.indexOf(hallada));
    else if (hallada.value !== actual) onValueChange(hallada.value);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;
    const enBuscador = e.target === buscarRef.current;
    if (!abierto) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        abrir();
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        saltarEscribiendo(e.key);
      }
      return;
    }
    switch (e.key) {
      case "Escape":
        e.preventDefault();
        // Que no cierre también el diálogo donde está el desplegable.
        e.stopPropagation();
        cerrar();
        return;
      case "Tab":
        cerrar(false);
        return;
      case "ArrowDown":
        e.preventDefault();
        setActiva((i) => mover(i, 1));
        return;
      case "ArrowUp":
        e.preventDefault();
        setActiva((i) => mover(i, -1));
        return;
      case "Home":
        if (enBuscador) return;
        e.preventDefault();
        setActiva(extremo(false));
        return;
      case "End":
        if (enBuscador) return;
        e.preventDefault();
        setActiva(extremo(true));
        return;
      case "Enter":
        e.preventDefault();
        elegir(visibles[activa]);
        return;
      case " ":
        if (enBuscador) return;
        e.preventDefault();
        elegir(visibles[activa]);
        return;
      default:
        if (!enBuscador && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          saltarEscribiendo(e.key);
        }
    }
  }

  const activaId = abierto && activa >= 0 ? `${baseId}-op-${activa}` : undefined;

  return (
    <>
      <button
        ref={botonRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-controls={abierto ? listaId : undefined}
        aria-activedescendant={conBuscador ? undefined : activaId}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
        disabled={disabled}
        data-abierto={abierto || undefined}
        onClick={() => (abierto ? cerrar() : abrir())}
        onKeyDown={onKeyDown}
        className={cn(
          "flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-left text-sm shadow-sm transition-[border-color,box-shadow]",
          "hover:border-text-4 focus-visible:border-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-soft",
          "data-[abierto]:border-brand data-[abierto]:ring-[3px] data-[abierto]:ring-brand-soft",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
      >
        {elegida && iconoDe?.(elegida.value)}
        <span className={cn("min-w-0 flex-1 truncate", !elegida && "text-text-3")}>
          {elegida?.label || placeholder}
        </span>
        <ChevronDown
          aria-hidden
          className={cn(
            "size-4 shrink-0 text-text-3 transition-transform duration-150",
            abierto && "rotate-180"
          )}
        />
      </button>

      {abierto &&
        pos &&
        createPortal(
          <div
            // Las capas que se cierran "al hacer clic fuera" ignoran lo que
            // pasa acá: la lista vive en <body>, fuera de su árbol.
            data-capa-flotante
            className={cn(
              "fixed z-[80] flex flex-col overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-pop",
              pos.bottom !== undefined ? "origin-bottom" : "origin-top",
              "motion-safe:animate-[desplegable-entrada_120ms_ease-out]"
            )}
            style={{
              top: pos.top,
              bottom: pos.bottom,
              left: pos.left,
              width: pos.width,
              maxHeight: pos.alto,
            }}
          >
            {conBuscador && (
              <div className="flex items-center gap-2 border-b border-border px-2.5">
                <Search aria-hidden className="size-4 shrink-0 text-text-3" />
                <input
                  ref={buscarRef}
                  value={filtro}
                  onChange={(e) => filtrar(e.target.value)}
                  onKeyDown={onKeyDown}
                  role="combobox"
                  aria-expanded
                  aria-controls={listaId}
                  aria-activedescendant={activaId}
                  aria-autocomplete="list"
                  aria-label="Buscar"
                  placeholder="Buscar…"
                  className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-text-3"
                />
              </div>
            )}
            <ul
              ref={listaRef}
              id={listaId}
              role="listbox"
              data-desplegable
              aria-label={ariaLabel}
              aria-labelledby={ariaLabel ? undefined : (ariaLabelledby ?? id)}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1"
            >
              {visibles.length === 0 && (
                <li className="px-2.5 py-2 text-sm text-text-3" role="presentation">
                  Sin resultados
                </li>
              )}
              {visibles.map((o, i) => {
                const nuevoGrupo = o.grupo && o.grupo !== visibles[i - 1]?.grupo;
                const sel = o.value === actual;
                return (
                  <Fragment key={`${o.grupo ?? ""}::${o.value}::${i}`}>
                    {nuevoGrupo && (
                      <li
                        role="presentation"
                        className="px-2.5 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-text-3"
                      >
                        {o.grupo}
                      </li>
                    )}
                    <li
                      id={`${baseId}-op-${i}`}
                      role="option"
                      aria-selected={sel}
                      aria-disabled={o.disabled || undefined}
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseMove={() => {
                        if (!o.disabled && activa !== i) setActiva(i);
                      }}
                      onClick={() => elegir(o)}
                      className={cn(
                        "flex cursor-pointer select-none items-center gap-2 rounded-md px-2.5 py-1.5 text-sm",
                        i === activa && "bg-accent",
                        sel ? "font-medium text-foreground" : "text-text-2",
                        o.disabled && "cursor-not-allowed opacity-50"
                      )}
                    >
                      {iconoDe?.(o.value)}
                      <span className="min-w-0 flex-1 truncate">{o.label || " "}</span>
                      {sel && <Check aria-hidden className="size-4 shrink-0 text-brand-ink" />}
                    </li>
                  </Fragment>
                );
              })}
            </ul>
          </div>,
          document.body
        )}
    </>
  );
}
