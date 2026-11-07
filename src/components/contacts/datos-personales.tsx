"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Search, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SeccionEditable } from "@/components/ui/seccion-editable";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useAvisoGuardado } from "@/components/ui/aviso-guardado";
import {
  formatearCuil,
  formatearDni,
  GENEROS,
  type DatosContactoDto,
} from "@/lib/datos-contacto";
import { formatearTelefono } from "@/lib/telefono-formato";

/**
 * War — Datos personales del contacto (punto 5 de la checklist de Notion):
 * DNI, CUIL/CUIT, nacimiento, dirección, género, newsletter, ID de Google
 * Contacts y parientes. Se ve plegado y se edita con el lápiz.
 */
export function DatosPersonales({ contactId, className }: { contactId: string; className?: string }) {
  const avisar = useAvisoGuardado();
  const [datos, setDatos] = useState<DatosContactoDto | null>(null);
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState<DatosContactoDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    const r = await fetch(`/api/contacts/${contactId}/datos`).catch(() => null);
    if (r?.ok) setDatos(((await r.json()) as { datos: DatosContactoDto }).datos);
  }, [contactId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function guardar() {
    if (!form) return;
    setGuardando(true);
    setError(null);
    const r = await fetch(`/api/contacts/${contactId}/datos`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        dni: form.dni,
        cuil: form.cuil,
        nacimiento: form.nacimiento || null,
        direccion: form.direccion,
        genero: form.genero,
        newsletter: form.newsletter,
        googleContactId: form.googleContactId,
      }),
    }).catch(() => null);
    setGuardando(false);
    if (!r?.ok) {
      const d = (await r?.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(d?.error?.message ?? "No se pudo guardar");
      return;
    }
    setDatos(((await r.json()) as { datos: DatosContactoDto }).datos);
    setEditando(false);
    avisar();
  }

  async function pariente(metodo: "POST" | "DELETE", otro: string, relacion?: string) {
    const r = await fetch(`/api/contacts/${contactId}/datos/parientes`, {
      method: metodo,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contactId: otro, ...(relacion ? { relacion } : {}) }),
    }).catch(() => null);
    if (r?.ok) setDatos(((await r.json()) as { datos: DatosContactoDto }).datos);
  }

  if (!datos) return null;
  const set = (cambio: Partial<DatosContactoDto>) => setForm((f) => (f ? { ...f, ...cambio } : f));
  const filas: [string, string | null][] = [
    ["DNI", formatearDni(datos.dni)],
    ["CUIL/CUIT", formatearCuil(datos.cuil)],
    ["Nacimiento", datos.nacimiento ? new Date(`${datos.nacimiento}T12:00:00`).toLocaleDateString("es-AR") : null],
    ["Dirección", datos.direccion],
    ["Género", GENEROS.find((g) => g.value === datos.genero)?.label ?? null],
    ["Newsletter", datos.newsletter ? "Suscripto" : null],
  ];
  const cargados = filas.filter(([, v]) => v);

  return (
    <SeccionEditable
      className={className}
      titulo="Datos personales"
      editando={editando}
      onEditar={() => {
        setForm(datos);
        setError(null);
        setEditando(true);
      }}
      onCancelar={() => setEditando(false)}
      resumen={
        <div className="space-y-3 text-[13px]">
          {cargados.length ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              {cargados.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-text-3">{k}</dt>
                  <dd className="min-w-0 break-words">{v}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-text-3">Sin datos cargados.</p>
          )}
          <Parientes datos={datos} contactId={contactId} onCambio={pariente} />
        </div>
      }
    >
      {form && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo id="dp-dni" label="DNI">
              <Input id="dp-dni" inputMode="numeric" value={form.dni ?? ""} onChange={(e) => set({ dni: e.target.value })} />
            </Campo>
            <Campo id="dp-cuil" label="CUIL/CUIT">
              <Input
                id="dp-cuil"
                inputMode="numeric"
                placeholder="20-12345678-9"
                value={form.cuil ?? ""}
                onChange={(e) => set({ cuil: e.target.value })}
              />
            </Campo>
            <Campo id="dp-nac" label="Nacimiento">
              <Input id="dp-nac" type="date" value={form.nacimiento ?? ""} onChange={(e) => set({ nacimiento: e.target.value || null })} />
            </Campo>
            <Campo id="dp-genero" label="Género">
              <Select
                value={form.genero ?? ""}
                onValueChange={(v) => set({ genero: (v || null) as DatosContactoDto["genero"] })}
                aria-label="Género"
              >
                <option value="">Sin dato</option>
                {GENEROS.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </Select>
            </Campo>
          </div>
          <Campo id="dp-dir" label="Dirección">
            <Input id="dp-dir" value={form.direccion ?? ""} onChange={(e) => set({ direccion: e.target.value })} />
          </Campo>
          <label className="flex items-center justify-between gap-3 text-sm">
            Suscripto al newsletter
            <Switch size="sm" checked={form.newsletter} onCheckedChange={(v) => set({ newsletter: v })} label="Newsletter" />
          </label>
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button size="sm" disabled={guardando} onClick={() => void guardar()}>
              {guardando ? "Guardando…" : "Guardar"}
            </Button>
            <Button size="sm" variant="outline" disabled={guardando} onClick={() => setEditando(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </SeccionEditable>
  );
}

function Campo({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      {children}
    </div>
  );
}

type Resultado = { id: string; name: string; phone: string | null };

function Parientes({
  datos,
  contactId,
  onCambio,
}: {
  datos: DatosContactoDto;
  contactId: string;
  onCambio: (metodo: "POST" | "DELETE", otro: string, relacion?: string) => Promise<void>;
}) {
  const [buscando, setBuscando] = useState(false);
  const [q, setQ] = useState("");
  const [relacion, setRelacion] = useState("");
  const [resultados, setResultados] = useState<Resultado[]>([]);

  useEffect(() => {
    if (!buscando || q.trim().length < 2) {
      setResultados([]);
      return;
    }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/contacts?q=${encodeURIComponent(q.trim())}`, { signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : { contacts: [] }))
        .then((d: { contacts: Resultado[] }) =>
          setResultados(
            d.contacts.filter((c) => c.id !== contactId && !datos.parientes.some((p) => p.contactId === c.id)).slice(0, 6)
          )
        )
        .catch(() => null);
    }, 250);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q, buscando, contactId, datos.parientes]);

  return (
    <div>
      <p className="mb-1 text-xs font-medium text-text-2">Parientes</p>
      {datos.parientes.length === 0 && !buscando && <p className="text-text-3">Ninguno.</p>}
      <ul className="space-y-1">
        {datos.parientes.map((p) => (
          <li key={p.contactId} className="flex items-center justify-between gap-2">
            <Link href={`/inbox?contact=${p.contactId}`} className="min-w-0 truncate hover:underline">
              {p.nombre}
              {p.relacion && <span className="text-text-3"> · {p.relacion}</span>}
              {p.telefono && <span className="text-text-3"> · {formatearTelefono(p.telefono)}</span>}
            </Link>
            <button
              type="button"
              onClick={() => void onCambio("DELETE", p.contactId)}
              className="rounded p-0.5 text-text-3 hover:bg-accent hover:text-foreground"
              aria-label={`Quitar a ${p.nombre} de parientes`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
      {buscando ? (
        <div className="mt-2 space-y-2 rounded-md border bg-subtle p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-3" />
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nombre o teléfono"
              className="h-8 pl-7 text-[13px]"
            />
          </div>
          <Input
            value={relacion}
            onChange={(e) => setRelacion(e.target.value)}
            placeholder="Relación (opcional): esposa, hijo…"
            className="h-8 text-[13px]"
            maxLength={60}
          />
          {resultados.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                void onCambio("POST", c.id, relacion.trim() || undefined);
                setBuscando(false);
                setQ("");
                setRelacion("");
              }}
              className="block w-full truncate rounded px-2 py-1 text-left text-[13px] hover:bg-accent"
            >
              {c.name}
              {c.phone && <span className="text-text-3"> · {formatearTelefono(c.phone)}</span>}
            </button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setBuscando(false)}>
            Cancelar
          </Button>
        </div>
      ) : (
        <Button size="sm" variant="ghost" className="mt-1 h-7 px-2 text-xs" onClick={() => setBuscando(true)}>
          <UserPlus className="h-3.5 w-3.5" /> Sumar pariente
        </Button>
      )}
    </div>
  );
}
