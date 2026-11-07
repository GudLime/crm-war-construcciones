"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAvisoGuardado } from "@/components/ui/aviso-guardado";
import { mensajeDe } from "@/components/ventas/ui";
import type { ObjetoDto, RegistroDto } from "@/lib/motor/dto";

/**
 * 070 — En la página de la oportunidad: los objetos del cliente vinculados
 * (unidades, tratamientos…) y las reglas de etapa que necesitan que alguien
 * elija. Sin configuración del cliente no se dibuja nada.
 */

const TARJETA = "rounded-tarjeta border border-border bg-card shadow-tarjeta";

type Vinculo = { relacion: string; nombre: string; objeto: ObjetoDto; registros: RegistroDto[] };
type Pendiente = { regla: string; relacion: string; descripcion: string; candidatos: { id: string; titulo: string }[] };

function Selector({
  vinculo,
  onGuardar,
  onCancelar,
}: {
  vinculo: Vinculo;
  onGuardar: (ids: string[]) => Promise<string | null>;
  onCancelar: () => void;
}) {
  const [todos, setTodos] = useState<{ id: string; titulo: string }[]>([]);
  const [elegidos, setElegidos] = useState<string[]>(vinculo.registros.map((r) => r.id));
  const [busqueda, setBusqueda] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/objetos/${encodeURIComponent(vinculo.objeto.clave)}?limite=1000`).catch(() => null);
      if (!res?.ok) return;
      const data = (await res.json()) as { registros: RegistroDto[] };
      setTodos(
        data.registros
          .map((r) => ({ id: r.id, titulo: r.titulo }))
          .sort((a, b) => a.titulo.localeCompare(b.titulo, "es", { numeric: true }))
      );
    })();
  }, [vinculo.objeto.clave]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return q ? todos.filter((t) => t.titulo.toLowerCase().includes(q)) : todos;
  }, [todos, busqueda]);

  return (
    <div className="space-y-2">
      <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar" aria-label="Buscar" />
      <ul className="max-h-52 space-y-1 overflow-auto">
        {visibles.map((t) => (
          <li key={t.id}>
            <label className="flex items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                checked={elegidos.includes(t.id)}
                onChange={(e) =>
                  setElegidos(e.target.checked ? [...elegidos, t.id] : elegidos.filter((x) => x !== t.id))
                }
              />
              {t.titulo}
            </label>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={async () => {
            setError(await onGuardar(elegidos));
          }}
        >
          Guardar
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancelar}>
          Cancelar
        </Button>
        {error && <span className="text-sm text-danger-text">{error}</span>}
      </div>
    </div>
  );
}

function ReglaPendiente({
  pendiente,
  onAplicar,
  onOmitir,
}: {
  pendiente: Pendiente;
  onAplicar: (ids: string[]) => Promise<string | null>;
  onOmitir: () => void;
}) {
  const [elegidos, setElegidos] = useState<string[]>(pendiente.candidatos.map((c) => c.id));
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="rounded-xl bg-warning-soft px-3 py-2.5 text-[13px]">
      <p className="mb-1.5 font-medium text-warning-text">¿Cuáles? {pendiente.descripcion}</p>
      <ul className="mb-2 space-y-1">
        {pendiente.candidatos.map((c) => (
          <li key={c.id}>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={elegidos.includes(c.id)}
                onChange={(e) =>
                  setElegidos(e.target.checked ? [...elegidos, c.id] : elegidos.filter((x) => x !== c.id))
                }
              />
              {c.titulo}
            </label>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={!elegidos.length} onClick={async () => setError(await onAplicar(elegidos))}>
          Aplicar
        </Button>
        <Button size="sm" variant="ghost" onClick={onOmitir}>
          Ahora no
        </Button>
        {error && <span className="text-danger-text">{error}</span>}
      </div>
    </div>
  );
}

export function ObjetosDeOportunidad({ oportunidadId, estado }: { oportunidadId: string; estado: string }) {
  const [vinculos, setVinculos] = useState<Vinculo[]>([]);
  const [pendientes, setPendientes] = useState<Pendiente[]>([]);
  const [editando, setEditando] = useState<string | null>(null);
  const avisar = useAvisoGuardado();
  const base = `/api/oportunidades/${encodeURIComponent(oportunidadId)}`;

  const cargar = useCallback(async () => {
    const res = await fetch(`${base}/objetos`).catch(() => null);
    if (!res?.ok) return;
    setVinculos(((await res.json()) as { vinculos: Vinculo[] }).vinculos);
  }, [base]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Cada vez que cambia la etapa: ¿hay alguna regla que necesite elegir?
  useEffect(() => {
    void (async () => {
      const res = await fetch(`${base}/reglas?etapa=${encodeURIComponent(estado)}`).catch(() => null);
      if (!res?.ok) return;
      setPendientes(((await res.json()) as { pendientes: Pendiente[] }).pendientes);
      void cargar();
    })();
  }, [base, estado, cargar]);

  if (!vinculos.length) return null;

  return (
    <section className={`${TARJETA} p-5`}>
      <h2 className="mb-3 text-[15px] font-semibold">Interés</h2>
      <div className="space-y-4">
        {pendientes.map((p) => (
          <ReglaPendiente
            key={p.regla}
            pendiente={p}
            onOmitir={() => setPendientes(pendientes.filter((x) => x.regla !== p.regla))}
            onAplicar={async (ids) => {
              const res = await fetch(`${base}/reglas`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ regla: p.regla, registros: ids }),
              }).catch(() => null);
              if (!res?.ok) return res ? await mensajeDe(res) : "No se pudo aplicar";
              setPendientes(pendientes.filter((x) => x.regla !== p.regla));
              avisar();
              void cargar();
              return null;
            }}
          />
        ))}
        {vinculos.map((v) => (
          <div key={v.relacion}>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-text-3">{v.nombre}</p>
              {editando !== v.relacion && (
                <button
                  type="button"
                  onClick={() => setEditando(v.relacion)}
                  className="text-text-3 hover:text-text"
                  aria-label={`Editar ${v.nombre}`}
                >
                  <Pencil className="size-3.5" />
                </button>
              )}
            </div>
            {editando === v.relacion ? (
              <Selector
                vinculo={v}
                onCancelar={() => setEditando(null)}
                onGuardar={async (ids) => {
                  const res = await fetch(`${base}/objetos`, {
                    method: "PUT",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ relacion: v.relacion, registros: ids }),
                  }).catch(() => null);
                  if (!res?.ok) return res ? await mensajeDe(res) : "No se pudo guardar";
                  setVinculos(((await res.json()) as { vinculos: Vinculo[] }).vinculos);
                  setEditando(null);
                  avisar();
                  return null;
                }}
              />
            ) : v.registros.length === 0 ? (
              <p className="text-[13px] text-text-3">Ninguno todavía.</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {v.registros.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/objetos/${v.objeto.clave}/${r.id}`}
                      className="inline-block rounded-full border px-2.5 py-0.5 text-[12.5px] hover:bg-accent"
                    >
                      {r.titulo}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
