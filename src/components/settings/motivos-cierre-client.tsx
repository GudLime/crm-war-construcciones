"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NOMBRE_MOTIVO_MAX, type MotivoCierreDto } from "@/lib/motivos-cierre";

/**
 * War — Configuración → Motivos de cierre. Por qué se cierra una oportunidad
 * (Compró, Presupuesto insuficiente, No responde…). Lo que se agrega acá
 * aparece en los desplegables de cierre, en este orden.
 */
export function MotivosCierreClient() {
  const [lista, setLista] = useState<MotivoCierreDto[] | null>(null);
  const [puedeEditar, setPuedeEditar] = useState(false);
  // `null` = cerrado; `""` = creando uno nuevo; un id = editando ese.
  const [editando, setEditando] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    const res = await fetch("/api/motivos-cierre?usos=1").catch(() => null);
    if (!res?.ok) return;
    const d = (await res.json()) as { motivos: MotivoCierreDto[]; puedeEditar: boolean };
    setLista(d.motivos);
    setPuedeEditar(d.puedeEditar);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  function abrir(m: MotivoCierreDto | null) {
    setEditando(m?.id ?? "");
    setNombre(m?.nombre ?? "");
    setError(null);
  }

  async function guardar() {
    setGuardando(true);
    setError(null);
    const nuevo = editando === "";
    const res = await fetch(nuevo ? "/api/motivos-cierre" : `/api/motivos-cierre/${editando}`, {
      method: nuevo ? "POST" : "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nombre }),
    }).catch(() => null);
    setGuardando(false);
    if (!res?.ok) {
      setError(await mensajeDeError(res, "No se pudo guardar. Revisá la conexión."));
      return;
    }
    setEditando(null);
    void cargar();
  }

  async function borrar(m: MotivoCierreDto) {
    const usos = m.usos ?? 0;
    const aviso =
      usos > 0
        ? `«${m.nombre}» está en ${usos} oportunidad${usos === 1 ? "" : "es"}: lo van a seguir mostrando, pero ya no se puede elegir. ¿Borrarlo?`
        : `¿Borrar el motivo «${m.nombre}»?`;
    if (!window.confirm(aviso)) return;
    const res = await fetch(`/api/motivos-cierre/${m.id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      window.alert(await mensajeDeError(res, "No se pudo borrar."));
      return;
    }
    void cargar();
  }

  async function mover(i: number, delta: -1 | 1) {
    if (!lista) return;
    const j = i + delta;
    if (j < 0 || j >= lista.length) return;
    const nueva = [...lista];
    [nueva[i], nueva[j]] = [nueva[j]!, nueva[i]!];
    setLista(nueva);
    const res = await fetch("/api/motivos-cierre", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: nueva.map((m) => m.id) }),
    }).catch(() => null);
    if (res?.ok) setLista(((await res.json()) as { motivos: MotivoCierreDto[] }).motivos);
    else void cargar();
  }

  const original = lista?.find((m) => m.id === editando);
  const renombra = Boolean(original && original.nombre !== nombre.replace(/\s+/g, " ").trim());

  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Motivos de cierre</CardTitle>
          <CardDescription>
            Por qué se cierra una oportunidad. Aparecen en este orden en los desplegables de cierre
            (al pasarla a Perdido, No calificado o Compró) y en las estadísticas de Resultados.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {lista === null ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : (
            <ul className="divide-y rounded-md border" data-testid="lista-motivos">
              {lista.map((m, i) => (
                <li key={m.id} className="flex items-center gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{m.nombre}</p>
                    <p className="text-xs text-text-3">
                      {m.usos ? `${m.usos} oportunidad${m.usos === 1 ? "" : "es"}` : "Sin oportunidades"}
                    </p>
                  </div>
                  {puedeEditar && (
                    <span className="flex shrink-0 items-center gap-0.5">
                      <Button variant="ghost" size="icon" aria-label={`Subir ${m.nombre}`} disabled={i === 0} onClick={() => void mover(i, -1)}>
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Bajar ${m.nombre}`}
                        disabled={i === lista.length - 1}
                        onClick={() => void mover(i, 1)}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label={`Editar ${m.nombre}`} onClick={() => abrir(m)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Borrar ${m.nombre}`}
                        disabled={lista.length <= 1}
                        onClick={() => void borrar(m)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {puedeEditar && editando === null && (
            <Button variant="outline" size="sm" onClick={() => abrir(null)}>
              <Plus className="h-4 w-4" /> Nuevo motivo
            </Button>
          )}

          {editando !== null && (
            <div className="space-y-3 rounded-md border bg-subtle p-3" data-testid="form-motivo">
              <div className="space-y-1.5">
                <Label htmlFor="motivo-nombre">Nombre</Label>
                <Input
                  id="motivo-nombre"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Busca con cochera"
                  maxLength={NOMBRE_MOTIVO_MAX}
                  autoFocus
                />
                {renombra && (original?.usos ?? 0) > 0 && (
                  <p className="text-xs text-text-3">
                    Las {original!.usos} oportunidades con «{original!.nombre}» pasan a decir el nombre nuevo.
                  </p>
                )}
              </div>
              {error && (
                <p role="alert" className="text-xs text-destructive">
                  {error}
                </p>
              )}
              <div className="flex gap-2">
                <Button size="sm" disabled={guardando || !nombre.trim()} onClick={() => void guardar()}>
                  {guardando ? "Guardando…" : "Guardar"}
                </Button>
                <Button size="sm" variant="outline" disabled={guardando} onClick={() => setEditando(null)}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

async function mensajeDeError(res: Response | null, porDefecto: string): Promise<string> {
  const d = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
  return d?.error?.message ?? porDefecto;
}
