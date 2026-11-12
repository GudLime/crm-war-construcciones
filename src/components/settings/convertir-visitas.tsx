"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * 0054 — Visita y Reunión son la misma cita (Agenda). Las tareas de esos tipos
 * que ya existían se pasan a citas cuando lo pide el admin. Solo aparece
 * mientras quede alguna.
 */
export function ConvertirVisitas() {
  const [cuenta, setCuenta] = useState<{ conFecha: number; sinFecha: number } | null>(null);
  const [corriendo, setCorriendo] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);

  async function contar() {
    const r = await fetch("/api/settings/ventas/convertir-visitas").catch(() => null);
    if (r?.ok) setCuenta((await r.json()) as { conFecha: number; sinFecha: number });
  }
  useEffect(() => {
    void contar();
  }, []);

  if (!cuenta || (cuenta.conFecha === 0 && cuenta.sinFecha === 0 && !resultado)) return null;

  async function convertir() {
    if (!cuenta) return;
    const ok = window.confirm(
      `Se van a pasar ${cuenta.conFecha} tareas de Visita o Reunión a la Agenda como citas, y dejan de estar en Tareas. ¿Seguimos?`
    );
    if (!ok) return;
    setCorriendo(true);
    const r = await fetch("/api/settings/ventas/convertir-visitas", { method: "POST" }).catch(() => null);
    setCorriendo(false);
    if (!r?.ok) {
      setResultado("No se pudo convertir. Probá de nuevo.");
      return;
    }
    const d = (await r.json()) as { convertidas: number; chocan: number; sinFecha: number };
    const partes = [`${d.convertidas} pasaron a la Agenda`];
    if (d.chocan) partes.push(`${d.chocan} quedaron en Tareas porque ya hay otra cita a esa hora`);
    if (d.sinFecha) partes.push(`${d.sinFecha} quedaron en Tareas porque no tienen fecha`);
    setResultado(`${partes.join(" · ")}.`);
    void contar();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Visitas y reuniones: de Tareas a la Agenda</CardTitle>
        <CardDescription>
          Visita y Reunión ahora son la misma cita, en la Agenda: la agenda una persona o el agente, y alguien la
          confirma. Las tareas de esos tipos que ya existían se pasan a citas con su fecha, contacto, estado y
          comentario. No se le avisa nada a los clientes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p>
          Hay <strong>{cuenta.conFecha}</strong> con fecha para pasar
          {cuenta.sinFecha > 0 && (
            <>
              {" "}
              y <strong>{cuenta.sinFecha}</strong> sin fecha (esas quedan en Tareas)
            </>
          )}
          .
        </p>
        {cuenta.conFecha > 0 && (
          <Button size="sm" onClick={() => void convertir()} disabled={corriendo}>
            {corriendo ? "Pasando…" : `Pasar ${cuenta.conFecha} a la Agenda`}
          </Button>
        )}
        {resultado && <p className="text-text-2">{resultado}</p>}
      </CardContent>
    </Card>
  );
}
