"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";

/**
 * Cambios 23/11, punto 6 — Ajustes → Ventas: a quién van las tareas que crea
 * la IA cuando deriva una conversación. Vacío = quedan sin asignar.
 */
export function ResponsableDerivaciones() {
  const [equipo, setEquipo] = useState<{ userId: string; nombre: string }[] | null>(null);
  const [userId, setUserId] = useState<string>("");
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([
      fetch("/api/settings/ventas/vendedores").then((r) => (r.ok ? r.json() : { vendedores: [] })),
      fetch("/api/settings/ventas/derivaciones").then((r) => (r.ok ? r.json() : { userId: null })),
    ])
      .then(([v, d]: [{ vendedores: { userId: string; nombre: string }[] }, { userId: string | null }]) => {
        setEquipo(v.vendedores);
        setUserId(d.userId ?? "");
      })
      .catch(() => setEquipo([]));
  }, []);
  if (!equipo) return null;

  async function guardar(valor: string) {
    setUserId(valor);
    const r = await fetch("/api/settings/ventas/derivaciones", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: valor || null }),
    }).catch(() => null);
    setAviso(r?.ok ? "Guardado" : "No se pudo guardar");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Responsable de las derivaciones de la IA</CardTitle>
        <CardDescription>
          Cuando el agente deriva una conversación a una persona, crea una tarea a nombre de quien elijas acá. Se cierra
          sola cuando alguien responde en la conversación.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3">
        <Select value={userId} onValueChange={(v) => void guardar(v)} aria-label="Responsable de las derivaciones" className="w-full max-w-xs">
          <option value="">Sin asignar (la ve el admin)</option>
          {equipo.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.nombre}
            </option>
          ))}
        </Select>
        {aviso && <span className="text-sm text-text-3">{aviso}</span>}
      </CardContent>
    </Card>
  );
}
