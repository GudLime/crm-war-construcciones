"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Building2, Download, Upload } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { parseMoneyToCents } from "@/lib/money";
import { ESTADOS_EDIFICIO, ESTADOS_UNIDAD, TIPOLOGIAS, etiqueta, metrosTexto } from "@/lib/ventas";
import type { DepartamentoDto, EdificioDto } from "@/server/ventas";
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
  numero,
  plata,
  useMoneda,
} from "./ui";
import { ImportarUnidades } from "./importar-unidades";

type UnidadForm = {
  unidad: string;
  orientacionEdificio: string;
  orientacionGeo: string;
  metrosCubiertos: string;
  metrosSemicubiertos: string;
  metrosDescubiertos: string;
  valor: string;
  estado: string;
  tipologia: string;
  piso: string;
  dormitorios: string;
  banos: string;
  toilette: string;
  enSuite: string;
  notasAgente: string;
};

const unidadVacia: UnidadForm = {
  unidad: "",
  orientacionEdificio: "",
  orientacionGeo: "",
  metrosCubiertos: "",
  metrosSemicubiertos: "",
  metrosDescubiertos: "",
  valor: "",
  estado: "disponible",
  tipologia: "",
  piso: "",
  dormitorios: "",
  banos: "",
  toilette: "",
  enSuite: "",
  notasAgente: "",
};

function metrosCampo(n: number | null): string {
  return n == null ? "" : String(n).replace(".", ",");
}

function desdeUnidad(u: DepartamentoDto): UnidadForm {
  return {
    unidad: u.unidad,
    orientacionEdificio: u.orientacionEdificio ?? "",
    orientacionGeo: u.orientacionGeo ?? "",
    metrosCubiertos: metrosCampo(u.metrosCubiertos),
    metrosSemicubiertos: metrosCampo(u.metrosSemicubiertos),
    metrosDescubiertos: metrosCampo(u.metrosDescubiertos),
    valor:
      u.valorCents == null
        ? ""
        : (u.valorCents / 100).toLocaleString("es-AR", { maximumFractionDigits: 2 }),
    estado: u.estado,
    tipologia: u.tipologia ?? "",
    piso: u.piso == null ? "" : String(u.piso),
    dormitorios: u.dormitorios == null ? "" : String(u.dormitorios),
    banos: u.banos == null ? "" : String(u.banos),
    toilette: u.toilette == null ? "" : String(u.toilette),
    enSuite: u.enSuite == null ? "" : String(u.enSuite),
    notasAgente: u.notasAgente ?? "",
  };
}

/** Cantidad chica (dormitorios, baños…): vacío = sin dato, NaN = inválido. */
function cantidadDe(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isInteger(n) && n >= 0 && n <= 50 ? n : Number.NaN;
}

export function EdificioDetalleClient() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const moneda = useMoneda();

  const [edificio, setEdificio] = useState<EdificioDto | null>(null);
  const [unidades, setUnidades] = useState<DepartamentoDto[]>([]);
  const [datos, setDatos] = useState({
    nombre: "",
    direccion: "",
    estado: "en_construccion",
    enVenta: "",
    notasAgente: "",
  });
  const [memoriaAgente, setMemoriaAgente] = useState(false);
  const [unidad, setUnidad] = useState<UnidadForm>(unidadVacia);
  const [editando, setEditando] = useState<string | null>(null);
  const [errorEdificio, setErrorEdificio] = useState<string | null>(null);
  const [errorUnidad, setErrorUnidad] = useState<string | null>(null);
  const [faltante, setFaltante] = useState(false);
  const [importando, setImportando] = useState(false);
  const [importado, setImportado] = useState<string | null>(null);
  const fichaUnidad = useRef<HTMLDivElement>(null);

  const cargar = useCallback(async () => {
    if (!id) return;
    const res = await fetch(`/api/edificios/${id}`).catch(() => null);
    if (res?.status === 404) {
      setFaltante(true);
      return;
    }
    if (!res?.ok) return;
    const data = (await res.json()) as { edificio: EdificioDto; departamentos: DepartamentoDto[] };
    setEdificio(data.edificio);
    setUnidades(data.departamentos);
    setDatos({
      nombre: data.edificio.nombre,
      direccion: data.edificio.direccion ?? "",
      estado: data.edificio.estado,
      enVenta: data.edificio.enVenta ?? "",
      notasAgente: data.edificio.notasAgente ?? "",
    });
    setMemoriaAgente(data.edificio.memoriaAgente);
  }, [id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function guardarEdificio(e: FormEvent) {
    e.preventDefault();
    setErrorEdificio(null);
    const res = await fetch(`/api/edificios/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        nombre: datos.nombre,
        direccion: datos.direccion || null,
        estado: datos.estado,
        enVenta: datos.enVenta || null,
        notasAgente: datos.notasAgente || null,
      }),
    }).catch(() => null);
    if (!res?.ok) {
      setErrorEdificio(res ? await mensajeDe(res) : "No se pudo guardar");
      return;
    }
    void cargar();
  }

  /** El interruptor guarda en el acto: no hace falta «Guardar edificio». */
  async function cambiarMemoria(prendido: boolean) {
    if (!edificio) return;
    setMemoriaAgente(prendido);
    setErrorEdificio(null);
    const res = await fetch(`/api/edificios/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        nombre: edificio.nombre,
        direccion: edificio.direccion,
        estado: edificio.estado,
        enVenta: edificio.enVenta,
        memoriaAgente: prendido,
      }),
    }).catch(() => null);
    if (!res?.ok) {
      setMemoriaAgente(!prendido);
      setErrorEdificio(res ? await mensajeDe(res) : "No se pudo guardar");
      return;
    }
    void cargar();
  }

  async function eliminarEdificio() {
    if (!edificio || !window.confirm(`¿Borrar ${edificio.nombre} y sus departamentos?`)) return;
    const res = await fetch(`/api/edificios/${id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok && res?.status !== 204) {
      setErrorEdificio(res ? await mensajeDe(res) : "No se pudo borrar");
      return;
    }
    router.push("/edificios");
  }

  function cuerpoUnidad(): Record<string, unknown> | string {
    const cub = numero(unidad.metrosCubiertos);
    const semi = numero(unidad.metrosSemicubiertos);
    const desc = numero(unidad.metrosDescubiertos);
    if ([cub, semi, desc].some((n) => Number.isNaN(n))) return "Los metros tienen que ser un número";
    const piso = unidad.piso.trim() ? Number(unidad.piso) : null;
    if (piso != null && !Number.isInteger(piso)) return "El piso tiene que ser un número entero";
    const valorTexto = unidad.valor.trim();
    const valorCents = valorTexto ? parseMoneyToCents(valorTexto) : null;
    if (valorTexto && valorCents == null) return "El valor no se entiende";
    const cantidades = {
      dormitorios: cantidadDe(unidad.dormitorios),
      banos: cantidadDe(unidad.banos),
      toilette: cantidadDe(unidad.toilette),
      enSuite: cantidadDe(unidad.enSuite),
    };
    if (Object.values(cantidades).some((n) => Number.isNaN(n))) {
      return "Dormitorios, baños, toilette y en suite tienen que ser números enteros";
    }
    return {
      ...cantidades,
      notasAgente: unidad.notasAgente || null,
      unidad: unidad.unidad,
      orientacionEdificio: unidad.orientacionEdificio || null,
      orientacionGeo: unidad.orientacionGeo || null,
      metrosCubiertos: cub,
      metrosSemicubiertos: semi,
      metrosDescubiertos: desc,
      valorCents,
      moneda: valorCents == null ? null : moneda,
      estado: unidad.estado,
      tipologia: unidad.tipologia || null,
      piso,
    };
  }

  async function guardarUnidad(e: FormEvent) {
    e.preventDefault();
    const cuerpo = cuerpoUnidad();
    if (typeof cuerpo === "string") {
      setErrorUnidad(cuerpo);
      return;
    }
    setErrorUnidad(null);
    const res = await fetch(editando ? `/api/departamentos/${editando}` : `/api/edificios/${id}/departamentos`, {
      method: editando ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(cuerpo),
    }).catch(() => null);
    if (!res?.ok) {
      setErrorUnidad(res ? await mensajeDe(res) : "No se pudo guardar");
      return;
    }
    setUnidad(unidadVacia);
    setEditando(null);
    void cargar();
  }

  async function eliminarUnidad() {
    if (!editando || !window.confirm(`¿Borrar la unidad ${unidad.unidad}?`)) return;
    const res = await fetch(`/api/departamentos/${editando}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok && res?.status !== 204) {
      setErrorUnidad(res ? await mensajeDe(res) : "No se pudo borrar");
      return;
    }
    setUnidad(unidadVacia);
    setEditando(null);
    void cargar();
  }

  if (faltante) {
    return (
      <Pagina titulo="Edificio">
        <EmptyState
          icon={Building2}
          title="Ese edificio no está"
          action={
            <Button size="sm" variant="secondary" onClick={() => router.push("/edificios")}>
              Volver
            </Button>
          }
        />
      </Pagina>
    );
  }

  if (!edificio) {
    return (
      <Pagina titulo="Edificio">
        <p className="text-sm text-text-3">Cargando…</p>
      </Pagina>
    );
  }

  return (
    <Pagina
      titulo={
        <span className="flex flex-wrap items-center gap-2">
          <Link href="/edificios" className="text-text-3 hover:text-foreground">
            Edificios
          </Link>
          <span className="text-text-3">/</span>
          {edificio.nombre}
        </span>
      }
      detalle={edificio.direccion || "Sin dirección"}
    >
      <div className="mb-4 flex items-start justify-between gap-4 rounded-lg border bg-card p-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Memoria del agente</p>
          <p className="mt-0.5 text-xs text-text-3">
            {memoriaAgente
              ? "El agente conoce este edificio: sus datos, las notas y las unidades disponibles con precio. Los cambios le llegan en unos minutos."
              : "Apagado: el agente no sabe de este edificio. Prendelo para que pueda ofrecerlo."}
          </p>
        </div>
        <Switch
          checked={memoriaAgente}
          label="Memoria del agente"
          onCheckedChange={(v) => void cambiarMemoria(v)}
        />
      </div>

      <Ficha titulo="Datos del edificio">
        <form onSubmit={guardarEdificio} className={grilla}>
          <Campo label="Nombre">
            <Input
              value={datos.nombre}
              onChange={(e) => setDatos({ ...datos, nombre: e.target.value })}
              required
              maxLength={160}
            />
          </Campo>
          <Campo label="Dirección">
            <Input
              value={datos.direccion}
              onChange={(e) => setDatos({ ...datos, direccion: e.target.value })}
              maxLength={400}
            />
          </Campo>
          <Campo label="Estado">
            <SelectNativo value={datos.estado} onChange={(estado) => setDatos({ ...datos, estado })}>
              {ESTADOS_EDIFICIO.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </SelectNativo>
          </Campo>
          <Campo label="En venta" className="sm:col-span-2">
            <Input
              value={datos.enVenta}
              onChange={(e) => setDatos({ ...datos, enVenta: e.target.value })}
              maxLength={400}
            />
          </Campo>
          <Campo label="Notas para el agente" className="sm:col-span-2 lg:col-span-3">
            <Textarea
              rows={4}
              value={datos.notasAgente}
              onChange={(e) => setDatos({ ...datos, notasAgente: e.target.value })}
              maxLength={4000}
              placeholder="Visitas martes, jueves y sábados de 10 a 17. Entrega estimada: marzo 2027. Amenities: SUM y terraza. Lista de precios en PDF: https://…"
            />
          </Campo>
          <Acciones error={errorEdificio}>
            <Button type="submit" size="sm">
              Guardar edificio
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => void eliminarEdificio()}>
              Eliminar
            </Button>
          </Acciones>
        </form>
      </Ficha>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Departamentos</h3>
          <p className="text-xs text-text-3">Los metros totales se calculan. No se cargan a mano.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {unidades.length > 0 && (
            <a
              href={`/api/edificios/${id}/unidades-csv`}
              download
              className={buttonVariants({ size: "sm", variant: "outline" })}
            >
              <Download className="h-4 w-4" strokeWidth={1.8} />
              Descargar CSV
            </a>
          )}
          <Button
            size="sm"
            variant={importando ? "secondary" : "outline"}
            onClick={() => {
              setImportando((v) => !v);
              setImportado(null);
            }}
          >
            <Upload className="h-4 w-4" strokeWidth={1.8} />
            Importar CSV
          </Button>
        </div>
      </div>

      {importando && id && (
        <div className="mb-5">
          <ImportarUnidades
            edificioId={id}
            moneda={moneda}
            onAplicado={({ creadas, modificadas }) => {
              setImportando(false);
              setImportado(`Listo: ${creadas} unidades nuevas y ${modificadas} actualizadas.`);
              void cargar();
            }}
            onCancelar={() => setImportando(false)}
          />
        </div>
      )}
      {importado && <p className="mb-4 text-sm text-success-text">{importado}</p>}

      {unidades.length === 0 ? (
        <p className="mb-4 text-sm text-text-3">Este edificio todavía no tiene unidades.</p>
      ) : (
        <div className="mb-5">
          <Tabla className="min-w-[1250px]">
            <thead className="border-b bg-secondary/40">
              <tr>
                <Th>Unidad</Th>
                <Th>Tipología</Th>
                <Th>Orientación edificio</Th>
                <Th>Orientación GEO</Th>
                <Th className="text-right">Cub.</Th>
                <Th className="text-right">Semicub.</Th>
                <Th className="text-right">Desc.</Th>
                <Th className="text-right">Totales</Th>
                <Th className="text-right">Dorm.</Th>
                <Th className="text-right">Baños</Th>
                <Th className="text-right">Valor</Th>
                <Th>Estado</Th>
              </tr>
            </thead>
            <tbody>
              {unidades.map((u) => (
                <tr
                  key={u.id}
                  className="cursor-pointer border-b last:border-0 hover:bg-accent/40"
                  onClick={() => {
                    setEditando(u.id);
                    setUnidad(desdeUnidad(u));
                    setErrorUnidad(null);
                    fichaUnidad.current?.scrollIntoView({ block: "nearest" });
                  }}
                >
                  <Td className="font-medium">
                    {u.unidad}
                    {u.piso != null && <span className="ml-2 text-xs text-text-3">piso {u.piso}</span>}
                    {u.notasAgente && (
                      <span className="ml-2 text-xs text-text-3" title={u.notasAgente}>
                        · nota
                      </span>
                    )}
                  </Td>
                  <Td>{etiqueta(TIPOLOGIAS, u.tipologia)}</Td>
                  <Td>{u.orientacionEdificio || "—"}</Td>
                  <Td>{u.orientacionGeo || "—"}</Td>
                  <Td className="text-right tabular-nums">{metrosTexto(u.metrosCubiertos)}</Td>
                  <Td className="text-right tabular-nums">{metrosTexto(u.metrosSemicubiertos)}</Td>
                  <Td className="text-right tabular-nums">{metrosTexto(u.metrosDescubiertos)}</Td>
                  <Td className="text-right font-medium tabular-nums">{metrosTexto(u.metrosTotales)}</Td>
                  <Td className="text-right tabular-nums">{u.dormitorios ?? "—"}</Td>
                  <Td className="text-right tabular-nums">
                    {u.banos ?? "—"}
                    {u.toilette ? <span className="ml-1 text-xs text-text-3">+T</span> : null}
                  </Td>
                  <Td className="text-right tabular-nums">{plata(u.valorCents, u.moneda, moneda)}</Td>
                  <Td>
                    <EstadoPill opciones={ESTADOS_UNIDAD} value={u.estado} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        </div>
      )}

      <div ref={fichaUnidad}>
      <Ficha titulo={editando ? `Editar ${unidad.unidad || "unidad"}` : "Nueva unidad"}>
        <form onSubmit={guardarUnidad} className={grilla}>
          <Campo label="Unidad">
            <Input
              value={unidad.unidad}
              onChange={(e) => setUnidad({ ...unidad, unidad: e.target.value })}
              required
              maxLength={40}
              placeholder="3B"
            />
          </Campo>
          <Campo label="Piso">
            <Input
              value={unidad.piso}
              onChange={(e) => setUnidad({ ...unidad, piso: e.target.value })}
              inputMode="numeric"
              placeholder="3"
            />
          </Campo>
          <Campo label="Tipología">
            <SelectNativo
              value={unidad.tipologia}
              onChange={(tipologia) => setUnidad({ ...unidad, tipologia })}
            >
              <option value="">Sin tipología</option>
              {TIPOLOGIAS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </SelectNativo>
          </Campo>
          <Campo label="Orientación edificio">
            <Input
              value={unidad.orientacionEdificio}
              onChange={(e) => setUnidad({ ...unidad, orientacionEdificio: e.target.value })}
              placeholder="Frente, contrafrente"
            />
          </Campo>
          <Campo label="Orientación GEO">
            <Input
              value={unidad.orientacionGeo}
              onChange={(e) => setUnidad({ ...unidad, orientacionGeo: e.target.value })}
              placeholder="Norte, noroeste"
            />
          </Campo>
          <Campo label="Estado">
            <SelectNativo value={unidad.estado} onChange={(estado) => setUnidad({ ...unidad, estado })}>
              {ESTADOS_UNIDAD.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </SelectNativo>
          </Campo>
          <Campo label="Metros cubiertos">
            <Input
              value={unidad.metrosCubiertos}
              onChange={(e) => setUnidad({ ...unidad, metrosCubiertos: e.target.value })}
              inputMode="decimal"
              placeholder="48,5"
            />
          </Campo>
          <Campo label="Metros semidescubiertos">
            <Input
              value={unidad.metrosSemicubiertos}
              onChange={(e) => setUnidad({ ...unidad, metrosSemicubiertos: e.target.value })}
              inputMode="decimal"
            />
          </Campo>
          <Campo label="Metros descubiertos">
            <Input
              value={unidad.metrosDescubiertos}
              onChange={(e) => setUnidad({ ...unidad, metrosDescubiertos: e.target.value })}
              inputMode="decimal"
            />
          </Campo>
          <Campo label="Dormitorios">
            <Input
              value={unidad.dormitorios}
              onChange={(e) => setUnidad({ ...unidad, dormitorios: e.target.value })}
              inputMode="numeric"
            />
          </Campo>
          <Campo label="Baños">
            <Input
              value={unidad.banos}
              onChange={(e) => setUnidad({ ...unidad, banos: e.target.value })}
              inputMode="numeric"
            />
          </Campo>
          <Campo label="Toilette">
            <Input
              value={unidad.toilette}
              onChange={(e) => setUnidad({ ...unidad, toilette: e.target.value })}
              inputMode="numeric"
            />
          </Campo>
          <Campo label="En suite">
            <Input
              value={unidad.enSuite}
              onChange={(e) => setUnidad({ ...unidad, enSuite: e.target.value })}
              inputMode="numeric"
            />
          </Campo>
          <Campo label="Valor">
            <Input
              value={unidad.valor}
              onChange={(e) => setUnidad({ ...unidad, valor: e.target.value })}
              inputMode="decimal"
              placeholder="125.000"
            />
          </Campo>
          <Campo label="Notas para el agente" className="sm:col-span-2 lg:col-span-3">
            <Textarea
              rows={2}
              value={unidad.notasAgente}
              onChange={(e) => setUnidad({ ...unidad, notasAgente: e.target.value })}
              maxLength={1000}
              placeholder="Vista abierta al pulmón de manzana. Se entrega con cochera."
            />
          </Campo>
          <Acciones error={errorUnidad}>
            <Button type="submit" size="sm">
              {editando ? "Guardar unidad" : "Agregar unidad"}
            </Button>
            {editando && (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditando(null);
                    setUnidad(unidadVacia);
                    setErrorUnidad(null);
                  }}
                >
                  Cancelar
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => void eliminarUnidad()}>
                  Eliminar
                </Button>
              </>
            )}
          </Acciones>
        </form>
      </Ficha>
      </div>
    </Pagina>
  );
}
