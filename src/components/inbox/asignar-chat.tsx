"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bot, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Ventana } from "@/components/ui/ventana";
import { AMBIENTES, etiquetaAmbientes } from "@/lib/ventas";
import type { EstadoComercialDto } from "@/server/oportunidades";
import type { InteresDto } from "@/lib/motor/dto";

/**
 * v7 — Clic derecho en un chat de la Bandeja (solo el admin): «Asignar a…»
 * el agente o una persona del equipo. Si el contacto no tiene oportunidad
 * abierta, se crea en una ventana con Tipo, Edificio y Tipología; la Unidad
 * se elige después, opcional, entre las que ofrece ese edificio.
 */

type Responsables = { responsables: { userId: string; nombre: string }[]; agente: string };
type Destino = { userId: string; nombre: string };

let cache: Promise<Responsables | null> | null = null;
function cargarResponsables(): Promise<Responsables | null> {
  cache ??= fetch("/api/oportunidades/responsables")
    .then((r) => (r.ok ? (r.json() as Promise<Responsables>) : null))
    .catch(() => null);
  return cache;
}

async function asignar(contactId: string, cuerpo: object): Promise<Response | null> {
  return fetch(`/api/contacts/${contactId}/asignar`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(cuerpo),
  }).catch(() => null);
}

async function mensaje(res: Response | null): Promise<string> {
  const d = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
  return d?.error?.message ?? "No se pudo asignar. Revisá la conexión.";
}

export function MenuAsignarChat({
  contactId,
  nombre,
  x,
  y,
  onCerrar,
  onHecho,
}: {
  contactId: string;
  nombre: string;
  x: number;
  y: number;
  onCerrar: () => void;
  onHecho: (texto: string) => void;
}) {
  const [datos, setDatos] = useState<Responsables | null>(null);
  const [creando, setCreando] = useState<Destino | null>(null);
  const [error, setError] = useState<string | null>(null);
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void cargarResponsables().then(setDatos);
  }, []);

  // Se cierra al tocar afuera o con Escape (mientras no haya ventana abierta).
  useEffect(() => {
    if (creando) return;
    const fuera = (e: MouseEvent) => {
      if (!caja.current?.contains(e.target as Node)) onCerrar();
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", esc);
    };
  }, [creando, onCerrar]);

  async function elegir(d: Destino) {
    setError(null);
    const res = await asignar(contactId, { userId: d.userId });
    if (res?.status === 409) {
      const cuerpo = (await res.json().catch(() => null)) as { error?: { code?: string } } | null;
      if (cuerpo?.error?.code === "sin_oportunidad") {
        setCreando(d);
        return;
      }
    }
    if (!res?.ok) {
      setError(await mensaje(res));
      return;
    }
    onHecho(`Asignada a ${d.nombre}`);
    onCerrar();
  }

  if (creando) {
    return (
      <VentanaCrearOportunidad
        contactId={contactId}
        nombre={nombre}
        destino={creando}
        onCerrar={onCerrar}
        onHecho={(t) => {
          onHecho(t);
          onCerrar();
        }}
      />
    );
  }

  if (typeof document === "undefined") return null;
  const destinos: Destino[] = datos
    ? [{ userId: "ia", nombre: datos.agente }, ...datos.responsables.map((r) => ({ userId: r.userId, nombre: r.nombre }))]
    : [];
  return createPortal(
    <div
      ref={caja}
      role="menu"
      aria-label={`Asignar el chat de ${nombre}`}
      style={{ left: Math.min(x, window.innerWidth - 230), top: Math.min(y, window.innerHeight - 260) }}
      className="fixed z-50 w-[220px] rounded-xl border border-border-strong bg-popover p-1.5 text-popover-foreground shadow-xl"
    >
      <p className="kicker px-2 pb-1 pt-1 text-text-3">Asignar a…</p>
      {!datos && <p className="px-2 py-1.5 text-[13px] text-text-3">Cargando…</p>}
      {destinos.map((d) => (
        <button
          key={d.userId}
          type="button"
          role="menuitem"
          onClick={() => void elegir(d)}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-accent"
        >
          {d.userId === "ia" ? <Bot className="size-3.5 text-text-3" /> : <UserRound className="size-3.5 text-text-3" />}
          <span className="truncate">{d.nombre}</span>
        </button>
      ))}
      {error && <p className="px-2 py-1.5 text-[12px] text-destructive">{error}</p>}
    </div>,
    document.body
  );
}

function VentanaCrearOportunidad({
  contactId,
  nombre,
  destino,
  onCerrar,
  onHecho,
}: {
  contactId: string;
  nombre: string;
  destino: Destino;
  onCerrar: () => void;
  onHecho: (texto: string) => void;
}) {
  const [edificios, setEdificios] = useState<{ id: string; nombre: string }[]>([]);
  const [tipo, setTipo] = useState<"venta" | "alquiler">("venta");
  const [edificio, setEdificio] = useState("");
  const [ambientes, setAmbientes] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Después de crear: la unidad, opcional.
  const [creada, setCreada] = useState<{ id: string; interes: InteresDto } | null>(null);
  const [unidad, setUnidad] = useState("");

  useEffect(() => {
    void fetch(`/api/contacts/${contactId}/oportunidad`)
      .then((r) => (r.ok ? (r.json() as Promise<EstadoComercialDto>) : null))
      .then((d) => d && setEdificios(d.edificios))
      .catch(() => undefined);
  }, [contactId]);

  async function crear() {
    setGuardando(true);
    setError(null);
    const res = await asignar(contactId, {
      userId: destino.userId,
      crear: { tipo, edificioIds: edificio ? [edificio] : [], ambientes: ambientes.map(Number) },
    });
    if (!res?.ok) {
      setGuardando(false);
      setError(await mensaje(res));
      return;
    }
    const { oportunidadId } = (await res.json()) as { oportunidadId: string };
    // ¿El edificio ofrece unidades para elegir? Si no, listo.
    const r = await fetch(`/api/oportunidades/${oportunidadId}/objetos`).catch(() => null);
    const interes = r?.ok ? ((await r.json()) as { interes: InteresDto | null }).interes : null;
    setGuardando(false);
    if (interes && interes.unidades.some((u) => u.ofrecida)) {
      setCreada({ id: oportunidadId, interes });
      return;
    }
    onHecho(`Oportunidad creada y asignada a ${destino.nombre}`);
  }

  async function guardarUnidad() {
    if (!creada) return;
    if (unidad) {
      setGuardando(true);
      await fetch(`/api/oportunidades/${creada.id}/objetos`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ relacion: creada.interes.relacion, registros: [unidad] }),
      }).catch(() => null);
      setGuardando(false);
    }
    onHecho(`Oportunidad creada y asignada a ${destino.nombre}`);
  }

  if (creada) {
    return (
      <Ventana titulo="Unidad (opcional)" detalle={`La oportunidad de ${nombre} ya quedó creada.`} onCerrar={() => void guardarUnidad()}>
        <Select value={unidad} onValueChange={setUnidad} placeholder="Sin unidad" aria-label="Unidad" className="w-full">
          <option value="">Sin unidad</option>
          {creada.interes.unidades
            .filter((u) => u.ofrecida)
            .map((u) => (
              <option key={u.id} value={u.id}>
                {u.titulo}
              </option>
            ))}
        </Select>
        <div className="mt-5 flex justify-end">
          <Button disabled={guardando} onClick={() => void guardarUnidad()}>
            Listo
          </Button>
        </div>
      </Ventana>
    );
  }

  return (
    <Ventana
      titulo="Crear la oportunidad"
      detalle={`${nombre} no tiene una oportunidad abierta. Se crea y queda asignada a ${destino.nombre}.`}
      onCerrar={onCerrar}
    >
      <div className="space-y-3">
        <label className="block space-y-1">
          <span className="text-[12px] font-medium text-text-2">Tipo</span>
          <Select value={tipo} onValueChange={(v) => setTipo(v as "venta" | "alquiler")} aria-label="Tipo" className="w-full">
            <option value="venta">Venta</option>
            <option value="alquiler">Alquiler</option>
          </Select>
        </label>
        <label className="block space-y-1">
          <span className="text-[12px] font-medium text-text-2">Edificio</span>
          <Select value={edificio} onValueChange={setEdificio} placeholder="Elegí el edificio…" aria-label="Edificio" className="w-full">
            {edificios.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </Select>
        </label>
        <label className="block space-y-1">
          <span className="text-[12px] font-medium text-text-2">Tipología</span>
          <Select
            multiple
            values={ambientes}
            onValuesChange={setAmbientes}
            placeholder="Elegí los ambientes…"
            aria-label="Tipología"
            className="h-auto min-h-9 w-full"
          >
            {AMBIENTES.map((n) => (
              <option key={n} value={String(n)}>
                {etiquetaAmbientes(n)}
              </option>
            ))}
          </Select>
        </label>
        <p className="text-[12px] text-text-3">La unidad se elige en el paso siguiente, si el edificio tiene unidades cargadas.</p>
      </div>
      {error && <p className="mt-3 text-[12.5px] text-destructive">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" disabled={guardando} onClick={onCerrar}>
          Cancelar
        </Button>
        <Button disabled={guardando || !edificio} onClick={() => void crear()}>
          {guardando ? "Creando…" : "Crear y asignar"}
        </Button>
      </div>
    </Ventana>
  );
}
