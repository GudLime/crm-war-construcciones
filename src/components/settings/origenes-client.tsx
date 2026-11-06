"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OrigenIcono } from "@/components/ventas/origen-icono";
import {
  ICONO_POR_DEFECTO,
  ICONOS_ORIGEN,
  NOMBRE_ORIGEN_MAX,
  type OrigenDto,
} from "@/lib/origenes";
import { cn } from "@/lib/utils";

/**
 * War — Configuración → Orígenes. De dónde llegan las oportunidades (Meta Ads,
 * Zonaprop, Cartel…), con su ícono. Lo que se agrega acá aparece en el
 * desplegable de Oportunidades y lo acepta la entrada de leads de Make.
 */
export function OrigenesClient() {
  const [lista, setLista] = useState<OrigenDto[] | null>(null);
  const [puedeEditar, setPuedeEditar] = useState(false);
  // `null` = cerrado; `""` = creando uno nuevo; un id = editando ese.
  const [editando, setEditando] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  const [icono, setIcono] = useState(ICONO_POR_DEFECTO);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    const res = await fetch("/api/origenes?usos=1").catch(() => null);
    if (!res?.ok) return;
    const d = (await res.json()) as { origenes: OrigenDto[]; puedeEditar: boolean };
    setLista(d.origenes);
    setPuedeEditar(d.puedeEditar);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  function abrir(o: OrigenDto | null) {
    setEditando(o?.id ?? "");
    setNombre(o?.nombre ?? "");
    setIcono(o?.icono ?? ICONO_POR_DEFECTO);
    setError(null);
  }

  async function guardar() {
    setGuardando(true);
    setError(null);
    const nuevo = editando === "";
    const res = await fetch(nuevo ? "/api/origenes" : `/api/origenes/${editando}`, {
      method: nuevo ? "POST" : "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nombre, icono }),
    }).catch(() => null);
    setGuardando(false);
    if (!res?.ok) {
      const d = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(d?.error?.message ?? "No se pudo guardar. Revisá la conexión.");
      return;
    }
    setEditando(null);
    void cargar();
  }

  async function borrar(o: OrigenDto) {
    const usos = o.usos ?? 0;
    const aviso =
      usos > 0
        ? `«${o.nombre}» está en ${usos} oportunidad${usos === 1 ? "" : "es"}: lo van a seguir mostrando, pero ya no se puede elegir ni mandar desde Make. ¿Borrarlo?`
        : `¿Borrar el origen «${o.nombre}»? Si un escenario de Make lo manda, va a dar error.`;
    if (!window.confirm(aviso)) return;
    const res = await fetch(`/api/origenes/${o.id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      const d = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
      window.alert(d?.error?.message ?? "No se pudo borrar.");
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
    const res = await fetch("/api/origenes", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: nueva.map((o) => o.id) }),
    }).catch(() => null);
    if (res?.ok) {
      const d = (await res.json()) as { origenes: OrigenDto[] };
      setLista(d.origenes);
    } else {
      void cargar();
    }
  }

  const original = lista?.find((o) => o.id === editando);
  const renombra = Boolean(original && original.nombre !== nombre.replace(/\s+/g, " ").trim());

  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Orígenes de los leads</CardTitle>
          <CardDescription>
            De dónde llega cada oportunidad, con su ícono. Aparecen en este orden en el
            desplegable de Oportunidades. La entrada de leads de Make acepta estos nombres en el
            campo <span className="font-mono">origen</span> (sin importar mayúsculas ni espacios).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {lista === null ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : (
            <ul className="divide-y rounded-md border" data-testid="lista-origenes">
              {lista.map((o, i) => (
                <li key={o.id} className="flex items-center gap-3 px-3 py-2">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-subtle">
                    <OrigenIcono icono={o.icono} className="text-foreground" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{o.nombre}</p>
                    <p className="text-xs text-text-3">
                      {o.usos ? `${o.usos} oportunidad${o.usos === 1 ? "" : "es"}` : "Sin oportunidades"}
                    </p>
                  </div>
                  {puedeEditar && (
                    <span className="flex shrink-0 items-center gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Subir ${o.nombre}`}
                        disabled={i === 0}
                        onClick={() => void mover(i, -1)}
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Bajar ${o.nombre}`}
                        disabled={i === lista.length - 1}
                        onClick={() => void mover(i, 1)}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label={`Editar ${o.nombre}`} onClick={() => abrir(o)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Borrar ${o.nombre}`}
                        disabled={lista.length <= 1}
                        onClick={() => void borrar(o)}
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
              <Plus className="h-4 w-4" /> Nuevo origen
            </Button>
          )}

          {editando !== null && (
            <div className="space-y-3 rounded-md border bg-subtle p-3" data-testid="form-origen">
              <div className="space-y-1.5">
                <Label htmlFor="origen-nombre">Nombre</Label>
                <Input
                  id="origen-nombre"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Properati"
                  maxLength={NOMBRE_ORIGEN_MAX}
                  autoFocus
                />
                {renombra && (original?.usos ?? 0) > 0 && (
                  <p className="text-xs text-text-3">
                    Las {original!.usos} oportunidades con «{original!.nombre}» pasan a decir el
                    nombre nuevo. Si Make manda el nombre viejo, cambialo también en el escenario.
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <span className="text-sm font-medium" id="origen-icono-label">
                  Ícono
                </span>
                <div
                  role="radiogroup"
                  aria-labelledby="origen-icono-label"
                  className="grid grid-cols-8 gap-1.5 sm:grid-cols-10"
                >
                  {ICONOS_ORIGEN.map(({ clave, label, Icono }) => {
                    const sel = clave === icono;
                    return (
                      <button
                        key={clave}
                        type="button"
                        role="radio"
                        aria-checked={sel}
                        aria-label={label}
                        title={label}
                        onClick={() => setIcono(clave)}
                        className={cn(
                          "flex aspect-square items-center justify-center rounded-md border bg-background transition-colors",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          sel
                            ? "border-brand bg-brand-tint text-brand-text"
                            : "border-border text-text-2 hover:bg-accent hover:text-foreground"
                        )}
                      >
                        <Icono aria-hidden className="size-4" />
                      </button>
                    );
                  })}
                </div>
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
