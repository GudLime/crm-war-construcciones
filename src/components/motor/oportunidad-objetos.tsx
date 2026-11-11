"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useAvisoGuardado } from "@/components/ui/aviso-guardado";
import { mensajeDe } from "@/components/ventas/ui";
import type { InteresDto, ObjetoDto, RegistroDto } from "@/lib/motor/dto";
import { unidadesElegibles } from "@/lib/motor/interes";

/**
 * 070 — En la página de la oportunidad: los objetos del cliente vinculados
 * (unidades, tratamientos…) y las reglas de etapa que necesitan que alguien
 * elija. Sin configuración del cliente no se dibuja nada. Van en el
 * encabezado (una fila por relación) y en un aviso bajo la barra de avance.
 */

export type Vinculo = {
  relacion: string;
  nombre: string;
  objeto: ObjetoDto;
  registros: RegistroDto[];
  /** Adopta los edificios de interés del núcleo: la página ya los muestra. */
  esInteres?: boolean;
};
type Pendiente = { regla: string; relacion: string; descripcion: string; candidatos: { id: string; titulo: string }[] };

function Selector({
  vinculo,
  onGuardar,
  onCancelar,
}: {
  vinculo: Vinculo;
  onGuardar: (ids: string[]) => Promise<string | null>;
  onCancelar: () => void;
}) {
  const [todos, setTodos] = useState<{ id: string; titulo: string }[]>([]);
  const [elegidos, setElegidos] = useState<string[]>(vinculo.registros.map((r) => r.id));
  const [busqueda, setBusqueda] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/objetos/${encodeURIComponent(vinculo.objeto.clave)}?limite=1000`).catch(() => null);
      if (!res?.ok) return;
      const data = (await res.json()) as { registros: RegistroDto[] };
      setTodos(
        data.registros
          .map((r) => ({ id: r.id, titulo: r.titulo }))
          .sort((a, b) => a.titulo.localeCompare(b.titulo, "es", { numeric: true }))
      );
    })();
  }, [vinculo.objeto.clave]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return q ? todos.filter((t) => t.titulo.toLowerCase().includes(q)) : todos;
  }, [todos, busqueda]);

  return (
    <div className="space-y-2">
      <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar" aria-label="Buscar" />
      <ul className="max-h-52 space-y-1 overflow-auto">
        {visibles.map((t) => (
          <li key={t.id}>
            <label className="flex items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                checked={elegidos.includes(t.id)}
                onChange={(e) =>
                  setElegidos(e.target.checked ? [...elegidos, t.id] : elegidos.filter((x) => x !== t.id))
                }
              />
              {t.titulo}
            </label>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={async () => {
            setError(await onGuardar(elegidos));
          }}
        >
          Guardar
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancelar}>
          Cancelar
        </Button>
        {error && <span className="text-sm text-danger-text">{error}</span>}
      </div>
    </div>
  );
}

function ReglaPendiente({
  pendiente,
  onAplicar,
  onOmitir,
}: {
  pendiente: Pendiente;
  onAplicar: (ids: string[]) => Promise<string | null>;
  onOmitir: () => void;
}) {
  const [elegidos, setElegidos] = useState<string[]>(pendiente.candidatos.map((c) => c.id));
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="rounded-xl bg-warning-soft px-3 py-2.5 text-[13px]">
      <p className="mb-1.5 font-medium text-warning-text">¿Cuáles? {pendiente.descripcion}</p>
      <ul className="mb-2 space-y-1">
        {pendiente.candidatos.map((c) => (
          <li key={c.id}>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={elegidos.includes(c.id)}
                onChange={(e) =>
                  setElegidos(e.target.checked ? [...elegidos, c.id] : elegidos.filter((x) => x !== c.id))
                }
              />
              {c.titulo}
            </label>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={!elegidos.length} onClick={async () => setError(await onAplicar(elegidos))}>
          Aplicar
        </Button>
        <Button size="sm" variant="ghost" onClick={onOmitir}>
          Ahora no
        </Button>
        {error && <span className="text-danger-text">{error}</span>}
      </div>
    </div>
  );
}

/**
 * Los vínculos y las reglas pendientes de una oportunidad. La página los
 * dibuja en el encabezado (una fila por relación) y como aviso debajo de la
 * barra de avance. Cada vez que cambia la etapa se pregunta si alguna regla
 * necesita que alguien elija.
 */
export function useObjetosDeOportunidad(
  oportunidadId: string,
  estado: string,
  /** Después de guardar un vínculo (el Valor de la oportunidad puede haber cambiado). */
  onCambio?: () => void
) {
  const [vinculos, setVinculos] = useState<Vinculo[]>([]);
  /** El interés encadenado (Edificio → Ambientes → Unidades), si la configuración lo tiene. */
  const [interes, setInteres] = useState<InteresDto | null>(null);
  const [pendientes, setPendientes] = useState<Pendiente[]>([]);
  const avisar = useAvisoGuardado();
  const base = `/api/oportunidades/${encodeURIComponent(oportunidadId)}`;

  const cargar = useCallback(async () => {
    const res = await fetch(`${base}/objetos`).catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as { vinculos: Vinculo[]; interes?: InteresDto | null };
    setVinculos(data.vinculos);
    setInteres(data.interes ?? null);
  }, [base]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    if (!estado) return;
    void (async () => {
      const res = await fetch(`${base}/reglas?etapa=${encodeURIComponent(estado)}`).catch(() => null);
      if (!res?.ok) return;
      setPendientes(((await res.json()) as { pendientes: Pendiente[] }).pendientes);
      void cargar();
    })();
  }, [base, estado, cargar]);

  async function guardarVinculo(relacion: string, ids: string[]): Promise<string | null> {
    const res = await fetch(`${base}/objetos`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ relacion, registros: ids }),
    }).catch(() => null);
    if (!res?.ok) return res ? await mensajeDe(res) : "No se pudo guardar";
    const data = (await res.json()) as { vinculos: Vinculo[]; interes?: InteresDto | null };
    setVinculos(data.vinculos);
    setInteres(data.interes ?? null);
    avisar();
    onCambio?.();
    return null;
  }

  async function aplicarRegla(regla: string, ids: string[]): Promise<string | null> {
    const res = await fetch(`${base}/reglas`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ regla, registros: ids }),
    }).catch(() => null);
    if (!res?.ok) return res ? await mensajeDe(res) : "No se pudo aplicar";
    setPendientes((p) => p.filter((x) => x.regla !== regla));
    avisar();
    void cargar();
    return null;
  }

  function omitirRegla(regla: string) {
    setPendientes((p) => p.filter((x) => x.regla !== regla));
  }

  return { vinculos, interes, pendientes, guardarVinculo, aplicarRegla, omitirRegla, recargar: cargar };
}

export type ObjetosDeOportunidad = ReturnType<typeof useObjetosDeOportunidad>;

/** Una relación en el encabezado: etiquetas con link a cada registro y un lápiz para elegir. */
export function VinculoEnLinea({
  vinculo,
  onGuardar,
}: {
  vinculo: Vinculo;
  onGuardar: (ids: string[]) => Promise<string | null>;
}) {
  const [editando, setEditando] = useState(false);
  if (editando) {
    return (
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-3 shadow-pop">
        <Selector
          vinculo={vinculo}
          onCancelar={() => setEditando(false)}
          onGuardar={async (ids) => {
            const error = await onGuardar(ids);
            if (!error) setEditando(false);
            return error;
          }}
        />
      </div>
    );
  }
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1.5">
      {vinculo.registros.length === 0 && <span className="font-normal text-text-3">Ninguno</span>}
      {vinculo.registros.map((r) => (
        <Link
          key={r.id}
          href={`/objetos/${vinculo.objeto.clave}/${r.id}`}
          className="inline-block rounded-full border border-border px-2.5 py-0.5 text-[12.5px] font-medium hover:bg-accent"
        >
          {r.titulo}
        </Link>
      ))}
      <button
        type="button"
        onClick={() => setEditando(true)}
        aria-label={`Elegir ${vinculo.nombre.toLowerCase()}`}
        title={`Elegir ${vinculo.nombre.toLowerCase()}`}
        className="grid size-7 place-items-center rounded-md text-text-3 hover:bg-accent hover:text-foreground"
      >
        <Pencil className="size-3.5" />
      </button>
    </span>
  );
}

/**
 * 0049 — Las unidades de interés, encadenadas: se ofrecen solo las de los
 * edificios de interés con alguno de los ambientes elegidos (y en un estado
 * que se ofrece). Las elegidas siempre aparecen, para poder sacarlas. Cada
 * toque guarda.
 */
export function UnidadesDeInteres({
  interes,
  ambientes,
  edificios,
  onGuardar,
}: {
  interes: InteresDto;
  /** Ambientes de interés de la oportunidad. */
  ambientes: readonly number[];
  /** Edificios de interés (para agrupar y nombrar). */
  edificios: readonly { id: string; nombre: string }[];
  onGuardar: (ids: string[]) => Promise<string | null>;
}) {
  const [error, setError] = useState<string | null>(null);
  const opciones = useMemo(
    () =>
      unidadesElegibles(interes.unidades, interes.elegidas, ambientes).sort((a, b) =>
        a.titulo.localeCompare(b.titulo, "es", { numeric: true })
      ),
    [interes.unidades, interes.elegidas, ambientes]
  );
  const etiqueta = (u: InteresDto["unidades"][number]) =>
    [u.titulo, u.ambientes !== null ? `${u.ambientes} amb.` : null, u.ofrecida ? null : "no disponible"]
      .filter(Boolean)
      .join(" · ");
  const nombreEdificio = new Map(edificios.map((e) => [e.id, e.nombre] as const));
  const grupos = new Map<string, typeof opciones>();
  for (const u of opciones) {
    const g = (u.edificioId && nombreEdificio.get(u.edificioId)) || "Otros";
    grupos.set(g, [...(grupos.get(g) ?? []), u]);
  }
  const agrupar = grupos.size > 1;

  if (!opciones.length) {
    return (
      <span className="font-normal text-text-3">
        {edificios.length ? `Sin ${interes.objeto.nombrePlural.toLowerCase()} disponibles` : "Elegí un edificio"}
      </span>
    );
  }
  return (
    <span className="flex min-w-0 flex-col gap-1">
      <Select
        multiple
        values={interes.elegidas}
        onValuesChange={(v) => void onGuardar(v).then(setError)}
        placeholder="Elegir…"
        aria-label={interes.nombre}
        className="h-auto min-h-7 w-auto max-w-full rounded-full px-2 py-0.5 text-[13px]"
      >
        {agrupar
          ? [...grupos].map(([g, us]) => (
              <optgroup key={g} label={g}>
                {us.map((u) => (
                  <option key={u.id} value={u.id}>
                    {etiqueta(u)}
                  </option>
                ))}
              </optgroup>
            ))
          : opciones.map((u) => (
              <option key={u.id} value={u.id}>
                {etiqueta(u)}
              </option>
            ))}
      </Select>
      {error && <span className="text-[12px] text-danger-text">{error}</span>}
    </span>
  );
}

/** Las reglas de etapa que necesitan que alguien elija, como aviso. */
export function AvisosDeReglas({ objetos }: { objetos: ObjetosDeOportunidad }) {
  if (!objetos.pendientes.length) return null;
  return (
    <div className="mt-3 space-y-2">
      {objetos.pendientes.map((p) => (
        <ReglaPendiente
          key={p.regla}
          pendiente={p}
          onOmitir={() => objetos.omitirRegla(p.regla)}
          onAplicar={(ids) => objetos.aplicarRegla(p.regla, ids)}
        />
      ))}
    </div>
  );
}
