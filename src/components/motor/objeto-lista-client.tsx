"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { Box, Download, Plus, Search, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useAvisoGuardado } from "@/components/ui/aviso-guardado";
import { Acciones, Campo, Ficha, Pagina, Tabla, Td, Th, grilla, mensajeDe, useMoneda } from "@/components/ventas/ui";
import type { ObjetoDto, RegistroDto } from "@/lib/motor/dto";
import { aEntrada, CampoEditor, desdeRegistro, valorVisible, type Formulario } from "./campos";
import { ImportarCsv } from "./importar-csv";

/**
 * Motor — la lista de un objeto personalizado: buscar, filtrar, ver y crear.
 * La misma pantalla sirve para cualquier objeto: se arma con sus metadatos.
 */

type Opcion = { id: string; titulo: string };

/** Registros de los objetos padre, para elegir en el alta y mostrar en la tabla. */
export function usePadres(objeto: ObjetoDto | null): Record<string, Opcion[]> {
  const [padres, setPadres] = useState<Record<string, Opcion[]>>({});
  const claves = objeto?.padres.map((p) => `${p.clave}:${p.objeto}`).join("|") ?? "";
  useEffect(() => {
    if (!objeto) return;
    let vivo = true;
    void (async () => {
      const out: Record<string, Opcion[]> = {};
      for (const p of objeto.padres) {
        const res = await fetch(`/api/objetos/${encodeURIComponent(p.objeto)}?limite=1000`).catch(() => null);
        if (!res?.ok) continue;
        const data = (await res.json()) as { registros: RegistroDto[] };
        out[p.clave] = data.registros
          .map((r) => ({ id: r.id, titulo: r.titulo }))
          .sort((a, b) => a.titulo.localeCompare(b.titulo, "es", { numeric: true }));
      }
      if (vivo) setPadres(out);
    })();
    return () => {
      vivo = false;
    };
    // Las relaciones del objeto no cambian mientras la pantalla está abierta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claves]);
  return padres;
}

/** Búsqueda y filtros como parámetros: los usan la lista y la exportación. */
function parametros(busqueda: string, filtros: Record<string, string>): string {
  const params = new URLSearchParams();
  if (busqueda.trim()) params.set("q", busqueda.trim());
  for (const [k, v] of Object.entries(filtros)) if (v) params.set(`f.${k}`, v);
  return params.toString();
}

export function ObjetoListaClient({ clave }: { clave: string }) {
  const [objeto, setObjeto] = useState<ObjetoDto | null>(null);
  const [registros, setRegistros] = useState<RegistroDto[]>([]);
  const [total, setTotal] = useState(0);
  const [listo, setListo] = useState(false);
  const [noExiste, setNoExiste] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [filtros, setFiltros] = useState<Record<string, string>>({});
  const [abierto, setAbierto] = useState(false);
  const [form, setForm] = useState<Formulario>({});
  const [padresForm, setPadresForm] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [importando, setImportando] = useState(false);
  const moneda = useMoneda();
  const avisar = useAvisoGuardado();
  const padres = usePadres(objeto);

  const cargar = useCallback(async () => {
    const res = await fetch(`/api/objetos/${encodeURIComponent(clave)}?${parametros(busqueda, filtros)}`).catch(
      () => null
    );
    if (res?.status === 404) {
      setNoExiste(true);
      setListo(true);
      return;
    }
    if (!res?.ok) return;
    const data = (await res.json()) as { objeto: ObjetoDto; registros: RegistroDto[]; total: number };
    setObjeto(data.objeto);
    setRegistros(data.registros);
    setTotal(data.total);
    setListo(true);
  }, [clave, busqueda, filtros]);

  useEffect(() => {
    const t = setTimeout(() => void cargar(), 200);
    return () => clearTimeout(t);
  }, [cargar]);

  const columnas = useMemo(() => objeto?.campos.filter((c) => c.visibleLista) ?? [], [objeto]);
  const filtrables = useMemo(
    () => objeto?.campos.filter((c) => c.tipo === "seleccion" || c.tipo === "booleano") ?? [],
    [objeto]
  );

  function abrirAlta() {
    if (!objeto) return;
    setForm(desdeRegistro(objeto.campos, null));
    setPadresForm({});
    setError(null);
    setAbierto(true);
  }

  async function crear(e: FormEvent) {
    e.preventDefault();
    if (!objeto) return;
    setGuardando(true);
    setError(null);
    const padresEntrada: Record<string, string | null> = {};
    for (const p of objeto.padres) padresEntrada[p.clave] = padresForm[p.clave] || null;
    const res = await fetch(`/api/objetos/${encodeURIComponent(clave)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ valores: aEntrada(objeto.campos, form), padres: padresEntrada }),
    }).catch(() => null);
    setGuardando(false);
    if (!res?.ok) {
      setError(res ? await mensajeDe(res) : "No se pudo guardar");
      return;
    }
    setAbierto(false);
    avisar(`${objeto.nombre} creado`);
    void cargar();
  }

  if (noExiste) {
    return (
      <Pagina titulo="No encontrado">
        <EmptyState icon={Box} title="Este objeto no existe" description="Revisá la configuración del cliente." />
      </Pagina>
    );
  }

  const nombrePadre = (relacion: string, id: string | null) =>
    id ? (padres[relacion]?.find((o) => o.id === id)?.titulo ?? "…") : "—";

  return (
    <Pagina
      titulo={objeto?.nombrePlural ?? ""}
      detalle={objeto ? `${total} ${total === 1 ? objeto.nombre.toLowerCase() : objeto.nombrePlural.toLowerCase()}` : undefined}
      accion={
        objeto && (
          <div className="flex flex-wrap gap-2">
            <a
              href={`/api/objetos/${encodeURIComponent(clave)}/exportar?${parametros(busqueda, filtros)}`}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-strong px-3 text-sm hover:border-foreground"
            >
              <Download className="h-4 w-4" strokeWidth={1.8} />
              Exportar
            </a>
            <Button size="sm" variant="outline" onClick={() => setImportando((v) => !v)}>
              <Upload className="h-4 w-4" strokeWidth={1.8} />
              Importar
            </Button>
            <Button size="sm" onClick={() => (abierto ? setAbierto(false) : abrirAlta())}>
              <Plus className="h-4 w-4" strokeWidth={1.8} />
              Nuevo
            </Button>
          </div>
        )
      }
    >
      {importando && objeto && (
        <ImportarCsv
          objeto={clave}
          nombrePlural={objeto.nombrePlural}
          onAplicado={() => {
            setImportando(false);
            void cargar();
          }}
          onCancelar={() => setImportando(false)}
        />
      )}
      {abierto && objeto && (
        <Ficha titulo={`Nuevo: ${objeto.nombre.toLowerCase()}`}>
          <form onSubmit={crear} className={grilla}>
            {objeto.padres.map((p) => (
              <Campo key={p.clave} label={p.nombre + (p.obligatoria ? " *" : "")}>
                <Select
                  value={padresForm[p.clave] ?? ""}
                  onValueChange={(v) => setPadresForm({ ...padresForm, [p.clave]: v })}
                  aria-label={p.nombre}
                >
                  {!p.obligatoria && <option value="">Sin {p.nombre.toLowerCase()}</option>}
                  {(padres[p.clave] ?? []).map((o) => (
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
                  />
                </Campo>
              ))}
            <Acciones error={error}>
              <Button type="submit" size="sm" disabled={guardando}>
                Guardar
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setAbierto(false)}>
                Cancelar
              </Button>
            </Acciones>
          </form>
        </Ficha>
      )}

      {objeto && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-3" />
            <Input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder={`Buscar ${objeto.nombrePlural.toLowerCase()}`}
              className="pl-8"
              aria-label="Buscar"
            />
          </div>
          {filtrables.map((c) => (
            <Select
              key={c.clave}
              value={filtros[c.clave] ?? ""}
              onValueChange={(v) => setFiltros({ ...filtros, [c.clave]: v })}
              className="w-auto min-w-[150px]"
              aria-label={c.nombre}
            >
              <option value="">{c.nombre}: todos</option>
              {c.tipo === "booleano" ? (
                <>
                  <option value="true">{c.nombre}: sí</option>
                  <option value="false">{c.nombre}: no</option>
                </>
              ) : (
                (c.opciones ?? []).map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.nombre}
                  </option>
                ))
              )}
            </Select>
          ))}
        </div>
      )}

      {listo && objeto && registros.length === 0 && !abierto ? (
        <EmptyState
          icon={Box}
          title={busqueda || Object.values(filtros).some(Boolean) ? "Sin resultados" : `Todavía no hay ${objeto.nombrePlural.toLowerCase()}`}
          description={busqueda || Object.values(filtros).some(Boolean) ? "Probá con otra búsqueda o sacá los filtros." : undefined}
          action={
            <Button size="sm" onClick={abrirAlta}>
              Nuevo
            </Button>
          }
        />
      ) : objeto && registros.length > 0 ? (
        <Tabla>
          <thead className="border-b bg-secondary/40">
            <tr>
              <Th>{objeto.nombre}</Th>
              {objeto.padres.map((p) => (
                <Th key={p.clave}>{p.nombre}</Th>
              ))}
              {columnas
                .filter((c) => !objeto.titulo.includes(c.clave))
                .map((c) => (
                  <Th
                    key={c.clave}
                    className={c.tipo === "numero" || c.tipo === "moneda" || c.tipo === "calculado" ? "text-right" : undefined}
                  >
                    {c.nombre}
                  </Th>
                ))}
            </tr>
          </thead>
          <tbody>
            {registros.map((r) => (
              <tr key={r.id} className="border-b last:border-0 hover:bg-accent/40">
                <Td>
                  <Link href={`/objetos/${clave}/${r.id}`} className="font-medium hover:underline">
                    {r.titulo || "(sin nombre)"}
                  </Link>
                </Td>
                {objeto.padres.map((p) => (
                  <Td key={p.clave} className="text-text-2">
                    {nombrePadre(p.clave, r.padres[p.clave] ?? null)}
                  </Td>
                ))}
                {columnas
                  .filter((c) => !objeto.titulo.includes(c.clave))
                  .map((c) => (
                    <Td
                      key={c.clave}
                      className={
                        c.tipo === "numero" || c.tipo === "moneda" || c.tipo === "calculado"
                          ? "text-right tabular-nums"
                          : "text-text-2"
                      }
                    >
                      {valorVisible(c, r.valores[c.clave] ?? null, moneda)}
                    </Td>
                  ))}
              </tr>
            ))}
          </tbody>
        </Tabla>
      ) : null}
    </Pagina>
  );
}
