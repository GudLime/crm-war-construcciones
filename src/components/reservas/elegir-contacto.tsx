"use client";

import { Plus, Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Ventana } from "@/components/ui/ventana";
import { Campo } from "@/components/ventas/ui";
import { SEGMENTOS, type Segmento } from "@/lib/reservas";
import { formatearTelefono } from "@/lib/telefono-formato";
import { cn } from "@/lib/utils";

/**
 * 071 — El contacto de una reserva: un desplegable con buscador (nombre o
 * teléfono). Si nadie coincide, ofrece crear el contacto en una ventana que se
 * abre encima; al guardarlo queda elegido.
 */

export type ContactoElegido = { id: string; name: string; phone: string | null };
type Encontrado = ContactoElegido & { segmento: Segmento };

const TONOS = [
  "bg-brand-tint text-brand-ink",
  "bg-success-tint text-success-text",
  "bg-warning-tint text-warning-text",
  "bg-danger-tint text-danger-text",
];

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "")).toUpperCase() || "?";
}

function tonoDe(id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TONOS[h % TONOS.length]!;
}

export function ElegirContacto({
  value,
  onChange,
}: {
  value: ContactoElegido | null;
  onChange: (c: ContactoElegido | null) => void;
}) {
  const id = useId();
  const [q, setQ] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [resultados, setResultados] = useState<Encontrado[] | null>(null);
  const [activo, setActivo] = useState(0);
  const [creando, setCreando] = useState(false);
  const segmentos = useRef<Record<string, Segmento>>({});
  const caja = useRef<HTMLDivElement>(null);

  // El segmento de cada persona, para mostrarlo al lado del nombre.
  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/reservas/comensales").catch(() => null);
      if (!res?.ok) return;
      const d = (await res.json()) as { porContacto: Record<string, { segmento: Segmento }> };
      segmentos.current = Object.fromEntries(Object.entries(d.porContacto).map(([k, v]) => [k, v.segmento]));
    })();
  }, []);

  useEffect(() => {
    const texto = q.trim();
    if (!texto) {
      setResultados(null);
      return;
    }
    let vigente = true;
    const t = setTimeout(async () => {
      const res = await fetch(`/api/contacts?q=${encodeURIComponent(texto)}`).catch(() => null);
      if (!vigente || !res?.ok) return;
      const d = (await res.json()) as { contacts: { id: string; name: string; phone: string | null }[] };
      setResultados(
        d.contacts.slice(0, 6).map((c) => ({ ...c, segmento: segmentos.current[c.id] ?? "nuevo" }))
      );
      setActivo(0);
    }, 200);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [q]);

  // Tocar afuera cierra la lista.
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (!caja.current?.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [abierto]);

  function elegir(c: ContactoElegido) {
    onChange({ id: c.id, name: c.name, phone: c.phone });
    setQ("");
    setResultados(null);
    setAbierto(false);
  }

  if (value) {
    return (
      <div className="flex h-10 items-center gap-2.5 rounded-[10px] border px-2.5">
        <span className={cn("grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-bold", tonoDe(value.id))}>
          {iniciales(value.name)}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm">
          <span className="font-semibold">{value.name}</span>
          {value.phone && <span className="text-text-3"> · {formatearTelefono(value.phone)}</span>}
        </span>
        <button
          type="button"
          aria-label="Cambiar contacto"
          onClick={() => onChange(null)}
          className="grid size-7 place-items-center rounded-md text-text-3 hover:bg-accent hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
    );
  }

  const lista = abierto && resultados !== null;
  return (
    <div ref={caja} className="relative">
      <div className="flex h-10 items-center gap-2 rounded-[10px] border bg-card px-3 focus-within:border-brand focus-within:ring-[3px] focus-within:ring-brand-soft">
        <Search className="size-4 shrink-0 text-text-3" aria-hidden="true" />
        <input
          role="combobox"
          aria-label="Buscar contacto"
          aria-expanded={lista}
          aria-controls={`${id}-lista`}
          aria-autocomplete="list"
          autoFocus
          value={q}
          placeholder="Nombre o teléfono"
          onChange={(e) => {
            setQ(e.target.value);
            setAbierto(true);
          }}
          onFocus={() => setAbierto(true)}
          onKeyDown={(e) => {
            if (!resultados?.length) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActivo((a) => Math.min(a + 1, resultados.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActivo((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              const c = resultados[activo];
              if (c) elegir(c);
            } else if (e.key === "Escape" && abierto) {
              e.preventDefault();
              setAbierto(false);
            }
          }}
          className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-text-4"
        />
      </div>
      {lista && (
        <div
          id={`${id}-lista`}
          role="listbox"
          aria-label="Contactos"
          className="mt-1.5 flex flex-col gap-0.5 rounded-xl border bg-popover p-1.5 shadow-md"
        >
          {resultados.length === 0 ? (
            <div className="flex flex-col items-start gap-2.5 px-2.5 pb-2.5 pt-3.5">
              <span className="text-[13px] text-text-3">No hay contactos con «{q.trim()}».</span>
              <Button type="button" size="sm" onClick={() => setCreando(true)}>
                <Plus className="size-3.5" /> Crear contacto
              </Button>
            </div>
          ) : (
            resultados.map((c, i) => (
              <button
                key={c.id}
                type="button"
                role="option"
                aria-selected={i === activo}
                onMouseEnter={() => setActivo(i)}
                onClick={() => elegir(c)}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left",
                  i === activo && "bg-subtle"
                )}
              >
                <span className={cn("grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-bold", tonoDe(c.id))}>
                  {iniciales(c.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{c.name}</span>
                  <span className="text-[12px] text-text-3">
                    {c.phone ? `${formatearTelefono(c.phone)} · ` : ""}
                    {SEGMENTOS.find((s) => s.value === c.segmento)?.label}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
      {creando && (
        <NuevoContacto
          nombreInicial={q.trim()}
          onCerrar={() => setCreando(false)}
          onCreado={(c) => {
            setCreando(false);
            elegir(c);
          }}
        />
      )}
    </div>
  );
}

/** El alta de un contacto, en una ventana sobre la reserva. */
function NuevoContacto({
  nombreInicial,
  onCerrar,
  onCreado,
}: {
  nombreInicial: string;
  onCerrar: () => void;
  onCreado: (c: ContactoElegido) => void;
}) {
  // Lo que se buscó suele ser el nombre; si son números, el teléfono.
  const esTelefono = /^[\d\s+()-]{6,}$/.test(nombreInicial);
  const [nombre, setNombre] = useState(esTelefono ? "" : nombreInicial.split(/\s+/)[0] ?? "");
  const [apellido, setApellido] = useState(esTelefono ? "" : nombreInicial.split(/\s+/).slice(1).join(" "));
  const [telefono, setTelefono] = useState(esTelefono ? nombreInicial : "");
  const [notas, setNotas] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    setError(null);
    setGuardando(true);
    const res = await fetch("/api/contacts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: `${nombre.trim()} ${apellido.trim()}`.trim(),
        phone: telefono.trim(),
        notes: notas.trim() || undefined,
        source: "otro",
      }),
    }).catch(() => null);
    setGuardando(false);
    const d = (await res?.json().catch(() => null)) as {
      contact?: ContactoElegido;
      error?: { message?: string };
    } | null;
    if (res?.ok && d?.contact) return onCreado(d.contact);
    // Ese teléfono ya era de alguien: se elige esa persona en vez de duplicarla.
    if (res?.status === 409) {
      const digitos = telefono.replace(/\D/g, "");
      const busca = await fetch(`/api/contacts?q=${encodeURIComponent(digitos)}`).catch(() => null);
      const lista = busca?.ok ? ((await busca.json()) as { contacts: ContactoElegido[] }).contacts : [];
      const mismo = lista.find((c) => (c.phone ?? "").replace(/\D/g, "").endsWith(digitos.slice(-8)));
      if (mismo) return onCreado(mismo);
    }
    setError(d?.error?.message ?? "No se pudo crear el contacto");
  }

  return (
    <Ventana titulo="Nuevo contacto" detalle="Al guardarlo queda elegido en la reserva." onCerrar={onCerrar} encima className="sm:max-w-md">
      <form onSubmit={(e) => void crear(e)} className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Nombre">
            <Input required autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </Campo>
          <Campo label="Apellido">
            <Input value={apellido} placeholder="Pérez" onChange={(e) => setApellido(e.target.value)} />
          </Campo>
        </div>
        <Campo label="Teléfono">
          <Input
            required
            inputMode="tel"
            value={telefono}
            placeholder="11 2345 6789"
            onChange={(e) => setTelefono(e.target.value)}
          />
        </Campo>
        <Campo label="Notas fijas (opcional)">
          <Input value={notas} placeholder="Celíaca, silla de bebé…" onChange={(e) => setNotas(e.target.value)} />
        </Campo>
        {error && <p className="text-sm text-danger-text">{error}</p>}
        <div className="mt-2 flex gap-2">
          <Button type="submit" size="sm" disabled={guardando}>
            Crear contacto
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onCerrar}>
            Cancelar
          </Button>
        </div>
      </form>
    </Ventana>
  );
}
