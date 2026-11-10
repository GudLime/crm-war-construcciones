"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Box, Download, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/select";
import { useAvisoGuardado } from "@/components/ui/aviso-guardado";
import {
  Acciones,
  Campo,
  Ficha,
  Pagina,
  Tabla,
  Td,
  Th,
  fechaVisible,
  grilla,
  mensajeDe,
  useMoneda,
} from "@/components/ventas/ui";
import type { CampoDto, ObjetoDto, RegistroDto } from "@/lib/motor/dto";
import { aEntrada, CampoEditor, desdeRegistro, valorVisible, type Formulario } from "./campos";
import { usePadres } from "./objeto-lista-client";
import { ImportarCsv } from "./importar-csv";
import { ArchivosVista } from "./archivos";
import { esTipoArchivo } from "@/lib/motor/config";

/**
 * Motor — la página de un registro de cualquier objeto: sus datos, de quién
 * cuelga, qué cuelga de él (con alta rápida ya relacionada), su historial y
 * el borrado, que pregunta qué hacer con los asociados.
 */

type Hijo = { relacion: string; nombre: string; objeto: ObjetoDto; registros: RegistroDto[]; total: number };
type Cambio = {
  id: string;
  accion: "creado" | "actualizado" | "borrado";
  campo: string | null;
  antes: unknown;
  despues: unknown;
  actorTipo: string;
  createdAt: string;
};
type Detalle = {
  objeto: ObjetoDto;
  registro: RegistroDto;
  padres: Record<string, { id: string; titulo: string; objeto: string } | null>;
  hijos: Hijo[];
  asociados: { relacion: string; objeto: string; nombre: string; cantidad: number }[];
  historial: Cambio[];
};

const ACTOR: Record<string, string> = {
  usuario: "una persona",
  agente: "el agente",
  importacion: "una importación",
  sistema: "el sistema",
};

function cambioVisible(c: Cambio, objeto: ObjetoDto, moneda: string): string {
  if (c.accion === "creado") return "Creado";
  if (c.accion === "borrado") return "Borrado";
  const campo = objeto.campos.find((x) => x.clave === c.campo);
  const padre = objeto.padres.find((x) => x.clave === c.campo);
  const nombre = campo?.nombre ?? padre?.nombre ?? c.campo ?? "";
  const ver = (v: unknown) =>
    campo ? valorVisible(campo, (v ?? null) as RegistroDto["valores"][string], moneda) : v ? "otro" : "—";
  return `${nombre}: ${ver(c.antes)} → ${ver(c.despues)}`;
}

function FormRegistro({
  objeto,
  inicial,
  padresIniciales,
  padresFijos,
  onGuardar,
  onCancelar,
}: {
  objeto: ObjetoDto;
  inicial: RegistroDto["valores"] | null;
  padresIniciales: Record<string, string | null>;
  /** Relaciones ya decididas (alta desde el padre): no se muestran. */
  padresFijos?: Record<string, string>;
  onGuardar: (cuerpo: { valores: Record<string, unknown>; padres: Record<string, string | null> }) => Promise<string | null>;
  onCancelar: () => void;
}) {
  const [form, setForm] = useState<Formulario>(() => desdeRegistro(objeto.campos, inicial));
  const [padresForm, setPadresForm] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(padresIniciales)) out[k] = v ?? "";
    return out;
  });
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const opciones = usePadres(objeto);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    const padres: Record<string, string | null> = {};
    for (const p of objeto.padres) padres[p.clave] = padresFijos?.[p.clave] ?? (padresForm[p.clave] || null);
    const err = await onGuardar({ valores: aEntrada(objeto.campos, form), padres });
    setGuardando(false);
    if (err) setError(err);
  }

  return (
    <form onSubmit={enviar} className={grilla}>
      {objeto.padres
        .filter((p) => !padresFijos?.[p.clave])
        .map((p) => (
          <Campo key={p.clave} label={p.nombre + (p.obligatoria ? " *" : "")}>
            <Select
              value={padresForm[p.clave] ?? ""}
              onValueChange={(v) => setPadresForm({ ...padresForm, [p.clave]: v })}
              aria-label={p.nombre}
            >
              {!p.obligatoria && <option value="">Sin {p.nombre.toLowerCase()}</option>}
              {(opciones[p.clave] ?? []).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.titulo}
                </option>
              ))}
            </Select>
          </Campo>
        ))}
      {objeto.campos
        .filter((c) => c.editable)
        .map((c) => (
          <Campo key={c.clave} label={c.nombre + (c.obligatorio ? " *" : "")}>
            <CampoEditor
              campo={c}
              valor={form[c.clave]}
              onChange={(v) => setForm({ ...form, [c.clave]: v })}
              objeto={objeto.clave}
            />
          </Campo>
        ))}
      <Acciones error={error}>
        <Button type="submit" size="sm" disabled={guardando}>
          Guardar
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancelar}>
          Cancelar
        </Button>
      </Acciones>
    </form>
  );
}

function celdaNumerica(c: CampoDto): boolean {
  return c.tipo === "numero" || c.tipo === "moneda" || c.tipo === "calculado";
}

export function RegistroClient({ clave, id }: { clave: string; id: string }) {
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [noExiste, setNoExiste] = useState(false);
  const [editando, setEditando] = useState(false);
  const [altaHijo, setAltaHijo] = useState<string | null>(null);
  const [importarHijo, setImportarHijo] = useState<string | null>(null);
  const [borrando, setBorrando] = useState(false);
  const [errorBorrar, setErrorBorrar] = useState<string | null>(null);
  const moneda = useMoneda();
  const avisar = useAvisoGuardado();
  const router = useRouter();

  const cargar = useCallback(async () => {
    const res = await fetch(`/api/objetos/${encodeURIComponent(clave)}/${encodeURIComponent(id)}`).catch(() => null);
    if (res?.status === 404) {
      setNoExiste(true);
      return;
    }
    if (!res?.ok) return;
    setDetalle((await res.json()) as Detalle);
  }, [clave, id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  if (noExiste) {
    return (
      <Pagina titulo="No encontrado">
        <EmptyState
          icon={Box}
          title="Este registro no existe"
          description="Puede que lo hayan borrado."
          action={
            <Link href={`/objetos/${clave}`} className="text-sm underline">
              Volver a la lista
            </Link>
          }
        />
      </Pagina>
    );
  }
  if (!detalle) return <Pagina titulo="">{null}</Pagina>;

  const { objeto, registro, padres, hijos, asociados, historial } = detalle;
  const totalAsociados = asociados.reduce((n, a) => n + a.cantidad, 0);

  async function guardar(cuerpo: { valores: Record<string, unknown>; padres: Record<string, string | null> }) {
    const res = await fetch(`/api/objetos/${encodeURIComponent(clave)}/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(cuerpo),
    }).catch(() => null);
    if (!res?.ok) return res ? await mensajeDe(res) : "No se pudo guardar";
    setEditando(false);
    avisar();
    void cargar();
    return null;
  }

  async function borrar(modo: "cascada" | "soltar") {
    setErrorBorrar(null);
    const res = await fetch(`/api/objetos/${encodeURIComponent(clave)}/${encodeURIComponent(id)}?modo=${modo}`, {
      method: "DELETE",
    }).catch(() => null);
    if (!res?.ok) {
      setErrorBorrar(res ? await mensajeDe(res) : "No se pudo borrar");
      return;
    }
    avisar(`${objeto.nombre} borrado`);
    router.push(`/objetos/${clave}`);
  }

  return (
    <Pagina
      titulo={
        <span className="flex items-center gap-2">
          <Link href={`/objetos/${clave}`} className="text-text-3 hover:text-text" aria-label={`Volver a ${objeto.nombrePlural}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
          {registro.titulo || "(sin nombre)"}
        </span>
      }
      detalle={objeto.nombre}
      accion={
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setEditando((v) => !v)}>
            <Pencil className="h-4 w-4" strokeWidth={1.8} />
            Editar
          </Button>
          <Button size="sm" variant="outline" onClick={() => setBorrando((v) => !v)}>
            <Trash2 className="h-4 w-4" strokeWidth={1.8} />
            Borrar
          </Button>
        </div>
      }
    >
      {borrando && (
        <Ficha titulo={`Borrar «${registro.titulo}»`}>
          {totalAsociados > 0 ? (
            <>
              <p className="mb-3 text-sm text-text-2">
                Tiene asociados:{" "}
                {asociados
                  .filter((a) => a.cantidad > 0)
                  .map((a) => `${a.cantidad} en ${a.nombre}`)
                  .join(", ")}
                . ¿Qué hacemos con ellos? El historial queda guardado igual.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="destructive" onClick={() => void borrar("cascada")}>
                  Borrar también los asociados
                </Button>
                <Button size="sm" variant="outline" onClick={() => void borrar("soltar")}>
                  Dejarlos sin {objeto.nombre.toLowerCase()}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setBorrando(false)}>
                  Cancelar
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-text-2">No tiene asociados. El historial queda guardado.</p>
              <Button size="sm" variant="destructive" onClick={() => void borrar("soltar")}>
                Borrar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setBorrando(false)}>
                Cancelar
              </Button>
            </div>
          )}
          {errorBorrar && <p className="mt-2 text-sm text-danger-text">{errorBorrar}</p>}
        </Ficha>
      )}

      {editando ? (
        <Ficha titulo="Editar">
          <FormRegistro
            objeto={objeto}
            inicial={registro.valores}
            padresIniciales={registro.padres}
            onGuardar={guardar}
            onCancelar={() => setEditando(false)}
          />
        </Ficha>
      ) : (
        <div className="mb-5 rounded-lg border bg-card p-4 shadow-sm">
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            {objeto.padres.map((p) => {
              const padre = padres[p.clave];
              return (
                <div key={p.clave} className="min-w-0">
                  <dt className="text-xs font-medium text-text-3">{p.nombre}</dt>
                  <dd className="mt-0.5 text-sm">
                    {padre ? (
                      <Link href={`/objetos/${padre.objeto}/${padre.id}`} className="hover:underline">
                        {padre.titulo}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
              );
            })}
            {objeto.campos.map((c) => (
              <div key={c.clave} className={esTipoArchivo(c.tipo) ? "col-span-full min-w-0" : "min-w-0"}>
                <dt className="text-xs font-medium text-text-3">
                  {c.nombre}
                  {!c.editable && <span className="ml-1 text-[11px] font-normal">(calculado)</span>}
                </dt>
                <dd className="mt-0.5 break-words text-sm">
                  {esTipoArchivo(c.tipo) ? (
                    <ArchivosVista campo={c} valor={registro.valores[c.clave] ?? null} />
                  ) : (
                    valorVisible(c, registro.valores[c.clave] ?? null, moneda)
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {hijos.map((h) => {
        const columnas = h.objeto.campos.filter((c) => c.visibleLista && !h.objeto.titulo.includes(c.clave));
        return (
          <section key={h.relacion} className="mb-6">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">
                {h.nombre} <span className="font-normal text-text-3">({h.total})</span>
              </h3>
              <div className="flex flex-wrap gap-2">
                <a
                  href={`/api/objetos/${encodeURIComponent(h.objeto.clave)}/exportar?padre=${encodeURIComponent(`${h.relacion}:${id}`)}`}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-strong px-3 text-sm hover:border-foreground"
                >
                  <Download className="h-4 w-4" strokeWidth={1.8} />
                  Exportar
                </a>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setImportarHijo(importarHijo === h.relacion ? null : h.relacion)}
                >
                  <Upload className="h-4 w-4" strokeWidth={1.8} />
                  Importar
                </Button>
                <Button size="sm" variant="outline" onClick={() => setAltaHijo(altaHijo === h.relacion ? null : h.relacion)}>
                  <Plus className="h-4 w-4" strokeWidth={1.8} />
                  Agregar
                </Button>
              </div>
            </div>
            {importarHijo === h.relacion && (
              <ImportarCsv
                objeto={h.objeto.clave}
                nombrePlural={h.nombre}
                padre={{ relacion: h.relacion, id }}
                onAplicado={() => {
                  setImportarHijo(null);
                  void cargar();
                }}
                onCancelar={() => setImportarHijo(null)}
              />
            )}
            {altaHijo === h.relacion && (
              <Ficha titulo={`Nuevo: ${h.objeto.nombre.toLowerCase()}`}>
                <FormRegistro
                  objeto={h.objeto}
                  inicial={null}
                  padresIniciales={{}}
                  padresFijos={{ [h.relacion]: id }}
                  onCancelar={() => setAltaHijo(null)}
                  onGuardar={async (cuerpo) => {
                    const res = await fetch(`/api/objetos/${encodeURIComponent(h.objeto.clave)}`, {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify(cuerpo),
                    }).catch(() => null);
                    if (!res?.ok) return res ? await mensajeDe(res) : "No se pudo guardar";
                    setAltaHijo(null);
                    avisar(`${h.objeto.nombre} creado`);
                    void cargar();
                    return null;
                  }}
                />
              </Ficha>
            )}
            {h.registros.length === 0 ? (
              <p className="text-sm text-text-3">Todavía no hay {h.nombre.toLowerCase()}.</p>
            ) : (
              <Tabla>
                <thead className="border-b bg-secondary/40">
                  <tr>
                    <Th>{h.objeto.nombre}</Th>
                    {columnas.map((c) => (
                      <Th key={c.clave} className={celdaNumerica(c) ? "text-right" : undefined}>
                        {c.nombre}
                      </Th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {h.registros.map((r) => (
                    <tr key={r.id} className="border-b last:border-0 hover:bg-accent/40">
                      <Td>
                        <Link href={`/objetos/${h.objeto.clave}/${r.id}`} className="font-medium hover:underline">
                          {r.titulo || "(sin nombre)"}
                        </Link>
                      </Td>
                      {columnas.map((c) => (
                        <Td key={c.clave} className={celdaNumerica(c) ? "text-right tabular-nums" : "text-text-2"}>
                          {valorVisible(c, r.valores[c.clave] ?? null, moneda)}
                        </Td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </Tabla>
            )}
          </section>
        );
      })}

      <section>
        <h3 className="mb-2 text-sm font-semibold">Historial</h3>
        {historial.length === 0 ? (
          <p className="text-sm text-text-3">Sin cambios registrados.</p>
        ) : (
          <ul className="space-y-1.5">
            {historial.map((c) => (
              <li key={c.id} className="flex flex-wrap gap-x-3 text-sm">
                <span className="tabular-nums text-text-3">{fechaVisible(c.createdAt)}</span>
                <span>{cambioVisible(c, objeto, moneda)}</span>
                <span className="text-text-3">por {ACTOR[c.actorTipo] ?? c.actorTipo}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Pagina>
  );
}
