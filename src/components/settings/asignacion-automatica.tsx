"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ASIGNAR_A_IA, type Asignacion } from "@/lib/asignacion";

type Datos = {
  asignacion: Asignacion;
  edificios: { id: string; nombre: string }[];
  equipo: { userId: string; nombre: string }[];
  agente: string;
};

/**
 * 0051 — Ajustes → Ventas: a quién va cada lead de Meta según el edificio.
 * Apagada por defecto; lo que no se mapea queda sin asignar (lo ve el admin).
 */
export function AsignacionAutomatica() {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  useEffect(() => {
    void fetch("/api/settings/ventas/asignacion")
      .then((r) => (r.ok ? (r.json() as Promise<Datos>) : null))
      .then((d) => (d ? setDatos(d) : setError(true)))
      .catch(() => setError(true));
  }, []);

  if (error) return null;
  if (!datos) return <p className="text-sm text-text-3">Cargando…</p>;
  const { asignacion, edificios, equipo, agente } = datos;

  function cambiar(cambios: Partial<Asignacion>) {
    setDatos((d) => (d ? { ...d, asignacion: { ...d.asignacion, ...cambios } } : d));
    setAviso(null);
  }

  function destino(edificioId: string, valor: string) {
    const porEdificio = { ...asignacion.porEdificio };
    if (valor) porEdificio[edificioId] = valor;
    else delete porEdificio[edificioId];
    cambiar({ porEdificio });
  }

  async function guardar() {
    setGuardando(true);
    setAviso(null);
    const res = await fetch("/api/settings/ventas/asignacion", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(asignacion),
    }).catch(() => null);
    setGuardando(false);
    if (!res?.ok) {
      const d = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
      setAviso({ tipo: "error", texto: d?.error?.message ?? "No se pudo guardar" });
      return;
    }
    setAviso({ tipo: "ok", texto: "Guardado" });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <CardTitle>Asignación automática de leads de Meta</CardTitle>
            <CardDescription>
              Cuando llega un lead de Meta (formulario o anuncio) para un edificio, la oportunidad
              queda a cargo de quien elijas acá: una persona del equipo o {agente} (IA). Lo que no
              tenga a nadie elegido queda sin asignar, y solo lo ve quien administra. Nunca cambia
              una oportunidad que ya tiene responsable.
            </CardDescription>
          </div>
          <Switch
            checked={asignacion.activa}
            onCheckedChange={(activa) => cambiar({ activa })}
            label="Asignar solos los leads de Meta"
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {edificios.length === 0 ? (
          <p className="text-sm text-text-3">Todavía no hay edificios cargados.</p>
        ) : (
          <div className="divide-y divide-border rounded-lg border border-border">
            {edificios.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3 px-3 py-2 text-[13.5px]">
                <span className="min-w-0 truncate font-medium">{e.nombre}</span>
                <Select
                  aria-label={`A quién van los leads de ${e.nombre}`}
                  value={asignacion.porEdificio[e.id] ?? ""}
                  onValueChange={(v) => destino(e.id, v)}
                  disabled={!asignacion.activa}
                  className="w-56"
                >
                  <option value="">Sin asignar</option>
                  <option value={ASIGNAR_A_IA}>{agente} (IA)</option>
                  {equipo.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.nombre}
                    </option>
                  ))}
                </Select>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center gap-3">
          <Button size="sm" onClick={() => void guardar()} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar"}
          </Button>
          {aviso && (
            <span className={aviso.tipo === "ok" ? "text-sm text-success-text" : "text-sm text-danger-text"}>
              {aviso.texto}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
