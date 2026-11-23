"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

/**
 * 071 — Configuración → Sectores: los sectores del local (Salón,
 * Semidescubierto). Las mesas de Configuración → Reservas y el sector de cada
 * reserva se eligen de esta lista. El orden decide a qué sector va una reserva
 * cuando en los dos quedan las mismas mesas.
 */

type Sector = { id: string | null; nombre: string };

export function SectoresClient() {
  const [sectores, setSectores] = useState<Sector[] | null>(null);
  const [puedeEditar, setPuedeEditar] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/reservas/sectores").catch(() => null);
      if (!res?.ok) return;
      const d = (await res.json()) as { sectores: Sector[]; puedeEditar: boolean };
      setSectores(d.sectores);
      setPuedeEditar(d.puedeEditar);
    })();
  }, []);

  if (!sectores) return <p className="text-sm text-text-3">Cargando…</p>;
  const lista = sectores;

  function mover(i: number, salto: -1 | 1) {
    const j = i + salto;
    if (j < 0 || j >= lista.length) return;
    const copia = [...lista];
    [copia[i], copia[j]] = [copia[j]!, copia[i]!];
    setSectores(copia);
  }

  async function guardar() {
    setGuardando(true);
    setAviso(null);
    const res = await fetch("/api/reservas/sectores", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sectores: lista.filter((s) => s.nombre.trim()) }),
    }).catch(() => null);
    setGuardando(false);
    if (!res?.ok) {
      const d = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
      setAviso({ tipo: "error", texto: d?.error?.message ?? "No se pudo guardar" });
      return;
    }
    const d = (await res.json()) as { sectores: Sector[] };
    setSectores(d.sectores);
    setAviso({ tipo: "ok", texto: "Guardado" });
  }

  return (
    <div className="max-w-xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Sectores</CardTitle>
          <CardDescription>
            Las partes del local donde hay mesas. Cuando en dos sectores queda el mismo lugar, la reserva va al
            primero de la lista.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {lista.length === 0 && <p className="text-sm text-text-3">Todavía no hay sectores.</p>}
          {lista.map((s, i) => (
            <div key={s.id ?? `nuevo-${i}`} className="flex items-center gap-2">
              <Input
                aria-label={`Sector ${i + 1}`}
                value={s.nombre}
                maxLength={40}
                disabled={!puedeEditar}
                placeholder="Nombre del sector"
                onChange={(e) => setSectores(lista.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)))}
                className="max-w-xs"
              />
              {puedeEditar && (
                <>
                  <Button variant="ghost" size="sm" aria-label="Subir" disabled={i === 0} onClick={() => mover(i, -1)}>
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Bajar"
                    disabled={i === lista.length - 1}
                    onClick={() => mover(i, 1)}
                  >
                    <ArrowDown className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Quitar ${s.nombre || "sector"}`}
                    onClick={() => setSectores(lista.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </>
              )}
            </div>
          ))}
          {puedeEditar && (
            <Button variant="outline" size="sm" onClick={() => setSectores([...lista, { id: null, nombre: "" }])}>
              <Plus className="size-4" /> Agregar sector
            </Button>
          )}
        </CardContent>
      </Card>

      {puedeEditar ? (
        <div className="flex items-center gap-3">
          <Button onClick={() => void guardar()} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar"}
          </Button>
          {aviso && (
            <span className={aviso.tipo === "ok" ? "text-sm text-success-text" : "text-sm text-danger-text"}>
              {aviso.texto}
            </span>
          )}
        </div>
      ) : (
        <p className="text-sm text-text-3">Solo quien administra puede cambiar los sectores.</p>
      )}
    </div>
  );
}
