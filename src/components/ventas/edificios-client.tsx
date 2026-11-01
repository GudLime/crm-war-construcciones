"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { Building2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { ESTADOS_EDIFICIO } from "@/lib/ventas";
import type { EdificioDto } from "@/server/ventas";
import {
  Acciones,
  Campo,
  EstadoPill,
  Ficha,
  Pagina,
  SelectNativo,
  Tabla,
  Td,
  Th,
  grilla,
  mensajeDe,
} from "./ui";

const vacio = { nombre: "", direccion: "", estado: "en_construccion", enVenta: "" };

export function EdificiosClient() {
  const [edificios, setEdificios] = useState<EdificioDto[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [form, setForm] = useState(vacio);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [listo, setListo] = useState(false);

  const cargar = useCallback(async () => {
    const res = await fetch("/api/edificios").catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as { edificios: EdificioDto[] };
    setEdificios(data.edificios);
    setListo(true);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function crear(e: FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    const res = await fetch("/api/edificios", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        nombre: form.nombre,
        direccion: form.direccion || null,
        estado: form.estado,
        enVenta: form.enVenta || null,
      }),
    }).catch(() => null);
    setGuardando(false);
    if (!res?.ok) {
      setError(res ? await mensajeDe(res) : "No se pudo guardar");
      return;
    }
    setForm(vacio);
    setAbierto(false);
    void cargar();
  }

  return (
    <Pagina
      titulo="Edificios"
      detalle="Cada edificio agrupa sus departamentos."
      accion={
        <Button size="sm" onClick={() => setAbierto((v) => !v)}>
          <Plus className="h-4 w-4" strokeWidth={1.8} />
          Nuevo edificio
        </Button>
      }
    >
      {abierto && (
        <Ficha titulo="Nuevo edificio">
          <form onSubmit={crear} className={grilla}>
            <Campo label="Nombre">
              <Input
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                required
                maxLength={160}
                placeholder="Torre Norte"
              />
            </Campo>
            <Campo label="Dirección">
              <Input
                value={form.direccion}
                onChange={(e) => setForm({ ...form, direccion: e.target.value })}
                maxLength={400}
                placeholder="Calle, ciudad"
              />
            </Campo>
            <Campo label="Estado">
              <SelectNativo value={form.estado} onChange={(estado) => setForm({ ...form, estado })}>
                {ESTADOS_EDIFICIO.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </SelectNativo>
            </Campo>
            <Campo label="En venta" className="sm:col-span-2">
              <Input
                value={form.enVenta}
                onChange={(e) => setForm({ ...form, enVenta: e.target.value })}
                maxLength={400}
                placeholder="Unidades de 2 y 3 ambientes"
              />
            </Campo>
            <Acciones error={error}>
              <Button type="submit" size="sm" disabled={guardando}>
                Guardar
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setAbierto(false);
                  setError(null);
                }}
              >
                Cancelar
              </Button>
            </Acciones>
          </form>
        </Ficha>
      )}

      {listo && edificios.length === 0 && !abierto ? (
        <EmptyState
          icon={Building2}
          title="Todavía no hay edificios"
          description="Cargá el primero y después sus departamentos: unidad, orientación, metros y valor."
          action={
            <Button size="sm" onClick={() => setAbierto(true)}>
              Nuevo edificio
            </Button>
          }
        />
      ) : edificios.length > 0 ? (
        <Tabla>
          <thead className="border-b bg-secondary/40">
            <tr>
              <Th>Edificio</Th>
              <Th>Dirección</Th>
              <Th>Estado</Th>
              <Th>En venta</Th>
              <Th className="text-right">Unidades</Th>
            </tr>
          </thead>
          <tbody>
            {edificios.map((e) => (
              <tr key={e.id} className="border-b last:border-0 hover:bg-accent/40">
                <Td>
                  <Link href={`/edificios/${e.id}`} className="font-medium hover:underline">
                    {e.nombre}
                  </Link>
                </Td>
                <Td className="text-text-2">{e.direccion || "—"}</Td>
                <Td>
                  <EstadoPill opciones={ESTADOS_EDIFICIO} value={e.estado} />
                </Td>
                <Td className="text-text-2">{e.enVenta || "—"}</Td>
                <Td className="text-right tabular-nums">{e.departamentos}</Td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      ) : null}
    </Pagina>
  );
}
