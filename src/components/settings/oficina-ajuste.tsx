"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** 0058 — Ajustes → Ventas: dónde son las reuniones formales (la oficina). */
export function OficinaAjuste() {
  const [direccion, setDireccion] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  useEffect(() => {
    void fetch("/api/settings/ventas/oficina")
      .then((r) => (r.ok ? r.json() : { direccion: "" }))
      .then((d: { direccion: string }) => setDireccion(d.direccion))
      .catch(() => setDireccion(""));
  }, []);
  if (direccion === null) return null;

  async function guardar() {
    setAviso(null);
    const r = await fetch("/api/settings/ventas/oficina", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ direccion }),
    }).catch(() => null);
    setAviso(r?.ok ? "Guardado" : "No se pudo guardar");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Oficina</CardTitle>
        <CardDescription>
          La ubicación de las reuniones en la oficina (reservas, boletos). Va como ubicación del evento en el
          calendario.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2">
        <input
          value={direccion}
          onChange={(e) => {
            setDireccion(e.target.value);
            setAviso(null);
          }}
          placeholder="Ej.: Oficina · Calle 123, Piso 3"
          aria-label="Dirección de la oficina"
          className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm"
        />
        <Button size="sm" onClick={() => void guardar()}>
          Guardar
        </Button>
        {aviso && <span className="text-sm text-text-3">{aviso}</span>}
      </CardContent>
    </Card>
  );
}
