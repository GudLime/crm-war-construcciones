"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { ESTADOS_EDIFICIO } from "@/lib/ventas";
import { decodificarArchivo } from "@/lib/unidades-csv";
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
  useMoneda,
} from "./ui";
import { ImportarUnidades } from "./importar-unidades";

const vacio = { nombre: "", direccion: "", estado: "en_construccion", enVenta: "" };

export function EdificiosClient() {
  const [edificios, setEdificios] = useState<EdificioDto[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [form, setForm] = useState(vacio);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [listo, setListo] = useState(false);
  // Alta con lista de precios: el CSV se elige en el formulario y, creado el
  // edificio, se muestra su vista previa antes de cargar las unidades.
  const [csv, setCsv] = useState<string | null>(null);
  const [creado, setCreado] = useState<{ id: string; nombre: string } | null>(null);
  const moneda = useMoneda();
  const router = useRouter();

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
    const data = (await res.json().catch(() => null)) as { edificio?: EdificioDto } | null;
    setForm(vacio);
    setAbierto(false);
    if (csv && data?.edificio) setCreado({ id: data.edificio.id, nombre: data.edificio.nombre });
    else setCsv(null);
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
            <div className="flex min-w-0 flex-col gap-1.5 sm:col-span-2 lg:col-span-3">
              <span className="text-xs font-medium text-text-2">
                Unidades desde un CSV (opcional)
              </span>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={async (e) => {
                  const archivo = e.target.files?.[0];
                  setCsv(archivo ? decodificarArchivo(await archivo.arrayBuffer()) : null);
                }}
                className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-secondary file:px-3 file:py-1.5 file:text-sm"
              />
              <span className="text-[11px] text-text-3">
                La lista de precios del edificio. Al guardar vas a ver qué unidades se
                cargan antes de confirmar.
              </span>
            </div>
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

      {creado && csv && (
        <div className="mb-5">
          <p className="mb-2 text-sm font-medium">Unidades de {creado.nombre}</p>
          <ImportarUnidades
            edificioId={creado.id}
            moneda={moneda}
            textoInicial={csv}
            onAplicado={() => {
              const id = creado.id;
              setCreado(null);
              setCsv(null);
              router.push(`/edificios/${id}`);
            }}
            onCancelar={() => {
              setCreado(null);
              setCsv(null);
            }}
          />
        </div>
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
                  {e.memoriaAgente && (
                    <span
                      className="ml-2 rounded-full border border-brand bg-brand-soft px-2 py-0.5 text-[11px] text-brand-text"
                      title="El agente conoce este edificio"
                    >
                      En memoria del agente
                    </span>
                  )}
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
