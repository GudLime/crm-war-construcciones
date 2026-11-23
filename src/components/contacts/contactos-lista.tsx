"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Archive, ArchiveRestore, ChevronLeft, ChevronRight, MessageSquareText, Pencil, Search, Send, X } from "lucide-react";
import type { ContactDto } from "@/lib/types";
import { paginasVisibles, POR_PAGINA_CONTACTOS, rangoMostrado, type OrdenContacto } from "@/lib/contactos-lista";
import { TIPOS_CONTACTO } from "@/lib/ventas";
import { cn, formatPhone } from "@/lib/utils";
import { ContactAvatar } from "@/components/avatar";
import { SOURCE_LABELS } from "@/server/contact-source";
import { Select } from "@/components/ui/select";
import { SelectorColumnasTabla, TablaConfigurable, usePrefTabla, type ColumnaTabla } from "@/components/ui/tabla-configurable";

/**
 * Cambios 23/11, punto 8 — Contactos compacta: buscador y filtros como
 * pastillas, una línea por contacto (nombre, teléfono, alta), orden por
 * columna y páginas de a 50 resueltas en el servidor.
 */

type Filtro = "tipo" | "fuente" | "agente" | "archivados";
type Valores = Partial<Record<Filtro, string>>;

const OPCIONES: Record<Filtro, { titulo: string; opciones: { value: string; label: string }[] }> = {
  tipo: {
    titulo: "Tipo de contacto",
    opciones: [...TIPOS_CONTACTO.map((t) => ({ value: t.value, label: t.label })), { value: "sin", label: "Sin clasificar" }],
  },
  fuente: {
    titulo: "Fuente",
    opciones: (["anuncio", "referido", "organico", "conocido", "otro", "desconocida"] as const).map((v) => ({
      value: v,
      label: SOURCE_LABELS[v],
    })),
  },
  agente: {
    titulo: "Agente",
    opciones: [
      { value: "con", label: "Con agente" },
      { value: "sin", label: "Sin agente" },
    ],
  },
  archivados: { titulo: "Archivados", opciones: [{ value: "solo", label: "Solo archivados" }] },
};

const COLUMNAS: { clave: OrdenContacto; titulo: string }[] = [
  { clave: "nombre", titulo: "Nombre" },
  { clave: "telefono", titulo: "Teléfono" },
  { clave: "creado", titulo: "Creado" },
];

const fechaAlta = (iso?: string) =>
  iso ? new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso)) : "—";

export function ContactosLista({
  version,
  onEditar,
  onEscribir,
  onArchivar,
}: {
  /** Cambia cuando algo se guardó afuera (alta, edición, importación): se vuelve a pedir. */
  version: number;
  onEditar: (c: ContactDto) => void;
  onEscribir: (c: ContactDto) => void;
  onArchivar: (c: ContactDto) => void;
}) {
  const [q, setQ] = useState("");
  const [filtros, setFiltros] = useState<Valores>({});
  // v2, punto 5 — La tabla configurable; el orden lo resuelve el servidor (paginado).
  const [prefTabla, setPrefTabla] = usePrefTabla("contactos");
  const orden =
    prefTabla.orden && (["nombre", "telefono", "creado"] as string[]).includes(prefTabla.orden.columna)
      ? { clave: prefTabla.orden.columna as OrdenContacto, dir: prefTabla.orden.dir }
      : null;
  const setOrden = (o: null) => setPrefTabla({ ...prefTabla, orden: o });
  const ordenClave = orden ? `${orden.clave}:${orden.dir}` : "";
  const [pagina, setPagina] = useState(1);
  const [datos, setDatos] = useState<{ items: ContactDto[]; total: number } | null>(null);
  const [error, setError] = useState(false);

  // Al buscar, filtrar u ordenar se vuelve a la página 1.
  useEffect(() => setPagina(1), [q, filtros, ordenClave]);

  useEffect(() => {
    const ctl = new AbortController();
    const t = window.setTimeout(async () => {
      const p = new URLSearchParams({ pagina: String(pagina), porPagina: String(POR_PAGINA_CONTACTOS) });
      if (q.trim()) p.set("q", q.trim());
      for (const [k, v] of Object.entries(filtros)) if (v) p.set(k, v);
      if (ordenClave) p.set("orden", ordenClave);
      const r = await fetch(`/api/contacts?${p.toString()}`, { signal: ctl.signal }).catch(() => null);
      if (ctl.signal.aborted) return;
      if (!r?.ok) {
        setError(true);
        return;
      }
      setError(false);
      setDatos((await r.json()) as { items: ContactDto[]; total: number });
    }, 200);
    return () => {
      ctl.abort();
      window.clearTimeout(t);
    };
  }, [q, filtros, ordenClave, pagina, version]);

  const total = datos?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA_CONTACTOS));
  const activos = (Object.keys(filtros) as Filtro[]).filter((k) => filtros[k]);
  const libres = (Object.keys(OPCIONES) as Filtro[]).filter((k) => !filtros[k]);
  const ordenTexto = orden
    ? `${COLUMNAS.find((c) => c.clave === orden.clave)!.titulo} · ${
        orden.clave === "creado"
          ? orden.dir === "desc"
            ? "más nuevo primero"
            : "más viejo primero"
          : orden.dir === "asc"
            ? "A → Z"
            : "Z → A"
      }`
    : null;

  const columnasContactos: ColumnaTabla<ContactDto>[] = [
    {
      clave: "nombre",
      titulo: "Nombre",
      ancho: 300,
      fija: true,
      valor: (c) => c.name,
      criterioAsc: "A → Z",
      criterioDesc: "Z → A",
      celda: (c) => (
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="shrink-0 [&>*]:size-7 [&>*]:text-[11px]">
            <ContactAvatar name={c.name} seed={c.id} />
          </span>
          <span className="truncate font-medium">{c.name}</span>
        </span>
      ),
    },
    {
      clave: "telefono",
      titulo: "Teléfono",
      ancho: 190,
      valor: (c) => c.phone,
      celda: (c) => <span className="tabular-nums text-text-2">{c.phone ? formatPhone(c.phone) : "—"}</span>,
    },
    {
      clave: "creado",
      titulo: "Creado",
      ancho: 150,
      valor: (c) => c.createdAt ?? null,
      criterioAsc: "más viejo primero",
      criterioDesc: "más nuevo primero",
      celda: (c) => <span className="text-text-3">{fechaAlta(c.createdAt)}</span>,
    },
    {
      clave: "acciones",
      titulo: `${total.toLocaleString("es-AR")} contactos`,
      ancho: 160,
      fija: true,
      alinear: "derecha",
      celda: (c) => (
        <span className="flex items-center justify-end gap-0.5 opacity-35 transition-opacity group-hover:opacity-100">
          <button type="button" aria-label="Editar" title="Editar" onClick={() => onEditar(c)} className="grid size-7 place-items-center rounded-md hover:bg-accent">
            <Pencil className="size-3.5" />
          </button>
          <button type="button" aria-label="Escribir primero" title="Escribir primero (con plantilla)" onClick={() => onEscribir(c)} className="grid size-7 place-items-center rounded-md hover:bg-accent">
            <Send className="size-3.5" />
          </button>
          <Link href={`/inbox?contact=${c.id}`} aria-label="Abrir conversación" title="Abrir conversación" className="grid size-7 place-items-center rounded-md hover:bg-accent">
            <MessageSquareText className="size-3.5" />
          </Link>
          <button
            type="button"
            aria-label={c.archivedAt ? "Desarchivar" : "Archivar"}
            title={c.archivedAt ? "Desarchivar" : "Archivar"}
            onClick={() => onArchivar(c)}
            className="grid size-7 place-items-center rounded-md hover:bg-accent"
          >
            {c.archivedAt ? <ArchiveRestore className="size-3.5" /> : <Archive className="size-3.5" />}
          </button>
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-3" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre o teléfono…"
            aria-label="Buscar contacto"
            className="h-8 w-64 rounded-full border border-border bg-card pl-9 pr-3 text-[13px]"
          />
        </label>
        {activos.map((k) => (
          <span key={k} className="inline-flex h-8 items-center gap-1 rounded-full border border-border bg-card pl-3 pr-1 text-[13px]">
            <span className="text-text-3">{OPCIONES[k].titulo}:</span>
            <Select
              value={filtros[k]}
              onValueChange={(v) => setFiltros({ ...filtros, [k]: v })}
              aria-label={OPCIONES[k].titulo}
              className="h-7 w-auto min-w-[120px] border-0 bg-transparent px-1 font-semibold shadow-none"
            >
              {OPCIONES[k].opciones.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
            <button
              type="button"
              aria-label={`Quitar ${OPCIONES[k].titulo}`}
              onClick={() => {
                const n = { ...filtros };
                delete n[k];
                setFiltros(n);
              }}
              className="grid size-6 place-items-center rounded-full text-text-3 hover:bg-accent hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </span>
        ))}
        {libres.length > 0 &&
          (
            <Select
              value=""
              placeholder="+ Filtro"
              aria-label="Agregar un filtro"
              onValueChange={(v) => {
                const k = v as Filtro;
                if (k in OPCIONES) setFiltros({ ...filtros, [k]: OPCIONES[k].opciones[0]!.value });
              }}
              className="h-8 w-auto min-w-[110px] rounded-full border-dashed text-[13px]"
            >
              {libres.map((k) => (
                <option key={k} value={k}>
                  {OPCIONES[k].titulo}
                </option>
              ))}
            </Select>
          )}
        {(activos.length > 0 || q) && (
          <button
            type="button"
            onClick={() => {
              setFiltros({});
              setQ("");
            }}
            className="text-[13px] font-medium text-text-2 hover:text-foreground"
          >
            Limpiar
          </button>
        )}
        <span className={cn("flex items-center gap-2", !ordenTexto && "ml-auto")}>
          <SelectorColumnasTabla columnas={columnasContactos} pref={prefTabla} setPref={setPrefTabla} />
        </span>
        {ordenTexto && (
          <span className="ml-auto inline-flex h-7 items-center gap-1 rounded-full bg-muted pl-2.5 pr-1 text-[12px] text-text-2">
            Orden: {ordenTexto}
            <button type="button" aria-label="Quitar orden" onClick={() => setOrden(null)} className="grid size-5 place-items-center rounded-full hover:bg-accent">
              <X className="size-3" />
            </button>
          </span>
        )}
      </div>

      {error && <p className="text-sm text-danger-text">No se pudieron cargar los contactos.</p>}

      {datos && datos.items.length === 0 ? (
        <p className="rounded-xl border border-border bg-card px-4 py-10 text-center text-sm text-text-3">
          {q || activos.length ? "Nadie coincide con la búsqueda." : "Todavía no hay contactos."}
        </p>
      ) : (
        <TablaConfigurable
          columnas={columnasContactos}
          filas={datos?.items ?? []}
          pref={prefTabla}
          setPref={setPrefTabla}
          claveDe={(c) => c.id}
          ordenExterno
        />
      )}

      {total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-text-3">
          <span>
            {rangoMostrado(pagina, POR_PAGINA_CONTACTOS, total)} · de a {POR_PAGINA_CONTACTOS}
          </span>
          {paginas > 1 && (
            <span className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Página anterior"
                disabled={pagina <= 1}
                onClick={() => setPagina(pagina - 1)}
                className="grid size-7 place-items-center rounded-md hover:bg-accent disabled:opacity-40"
              >
                <ChevronLeft className="size-4" />
              </button>
              {paginasVisibles(pagina, paginas).map((n, i) =>
                n === "…" ? (
                  <span key={`g${i}`} className="px-1">
                    …
                  </span>
                ) : (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setPagina(n)}
                    className={cn(
                      "h-7 min-w-7 rounded-md px-1.5 tabular-nums",
                      n === pagina ? "bg-foreground font-semibold text-background" : "hover:bg-accent hover:text-foreground"
                    )}
                  >
                    {n}
                  </button>
                )
              )}
              <button
                type="button"
                aria-label="Página siguiente"
                disabled={pagina >= paginas}
                onClick={() => setPagina(pagina + 1)}
                className="grid size-7 place-items-center rounded-md hover:bg-accent disabled:opacity-40"
              >
                <ChevronRight className="size-4" />
              </button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
