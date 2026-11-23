"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { MAX_TECLAS } from "@/lib/asignaciones";

type Vendedor = { userId: string; nombre: string; role: string; recibe: boolean; tecla: number | null };

const ROL: Record<string, string> = { owner: "Propietario", admin: "Admin", member: "Vendedor" };

/** Recalcula las teclas como lo hace el servidor: 1–9 para los que reciben, en orden. */
function conTeclas(lista: Vendedor[]): Vendedor[] {
  let n = 0;
  return lista.map((v) => ({ ...v, tecla: v.recibe && n < MAX_TECLAS ? ++n : null }));
}

/** Asignaciones — Ajustes → Ventas: quién recibe en la mesa de reparto y en qué orden (su tecla). */
export function VendedoresAsignacion() {
  const [lista, setLista] = useState<Vendedor[] | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  useEffect(() => {
    void fetch("/api/settings/ventas/vendedores")
      .then((r) => (r.ok ? r.json() : { vendedores: [] }))
      .then((d: { vendedores: Vendedor[] }) => setLista(d.vendedores))
      .catch(() => setLista([]));
  }, []);
  if (lista === null) return null;

  const cambiar = (next: Vendedor[]) => {
    setLista(conTeclas(next));
    setAviso(null);
  };
  const mover = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= lista.length) return;
    const next = [...lista];
    [next[i], next[j]] = [next[j]!, next[i]!];
    cambiar(next);
  };

  async function guardar() {
    const r = await fetch("/api/settings/ventas/vendedores", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ vendedores: lista!.map((v) => ({ userId: v.userId, recibe: v.recibe })) }),
    }).catch(() => null);
    if (r?.ok) {
      setLista(((await r.json()) as { vendedores: Vendedor[] }).vendedores);
      setAviso("Guardado");
    } else setAviso("No se pudo guardar");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Asignaciones</CardTitle>
        <CardDescription>
          Quién recibe en la mesa de reparto y en qué orden: el orden define su número de tecla (1–9). El tope de carga es
          de 30 abiertas por persona.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {lista.length === 0 ? (
          <p className="text-sm text-text-3">No hay nadie en el equipo.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {lista.map((v, i) => (
              <li key={v.userId} className="flex items-center gap-3 px-3 py-2">
                <span className="inline-flex w-7 justify-center">
                  {v.tecla !== null ? (
                    <kbd className="rounded border border-border bg-muted px-1.5 font-mono text-[11px] font-semibold">{v.tecla}</kbd>
                  ) : (
                    <span className="text-text-3">—</span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{v.nombre}</span>
                  <span className="block text-[11.5px] text-text-3">{ROL[v.role] ?? v.role}</span>
                </span>
                <span className="flex gap-1">
                  <button
                    type="button"
                    aria-label={`Subir a ${v.nombre}`}
                    disabled={i === 0}
                    onClick={() => mover(i, -1)}
                    className="grid size-7 place-items-center rounded-md border border-border hover:bg-subtle disabled:opacity-40"
                  >
                    <ArrowUp className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Bajar a ${v.nombre}`}
                    disabled={i === lista.length - 1}
                    onClick={() => mover(i, 1)}
                    className="grid size-7 place-items-center rounded-md border border-border hover:bg-subtle disabled:opacity-40"
                  >
                    <ArrowDown className="size-3.5" />
                  </button>
                </span>
                <Switch
                  checked={v.recibe}
                  onCheckedChange={(recibe) => cambiar(lista.map((x) => (x.userId === v.userId ? { ...x, recibe } : x)))}
                  label={`${v.nombre} recibe asignaciones`}
                />
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => void guardar()}>
            Guardar
          </Button>
          {aviso && <span className="text-sm text-text-3">{aviso}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
