"use client";

import { VentanaMotivoCierre } from "@/components/ventas/ventana-motivo-cierre";
import { BotonesNuevaTarea } from "@/components/ventas/nueva-tarea";
import { useCallback, useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  AMBIENTES,
  TIPOS_CONTACTO,
  TIPOS_OPORTUNIDAD,
  etiquetaAmbientes,
  type EstadoOportunidad,
  type TipoContacto,
} from "@/lib/ventas";
import { useVocabulario } from "@/components/vocabulario";
import { enFrase, nombreEstado } from "@/lib/vocabulario";
import type { EstadoComercialDto } from "@/server/oportunidades";
import { Select } from "@/components/ui/select";
import { ExtraOportunidadChat } from "@/components/extensiones/oportunidad-chat";
import { SeccionPlegable } from "@/components/ui/seccion-plegable";

/** v4 — Con quién NO habla la IA (lo atiende una persona). */
function avisoSinIa(tipos: readonly TipoContacto[], tipoOportunidad: string | null | undefined, conAbierta: boolean): string | null {
  if (conAbierta) {
    if (tipoOportunidad === "alquiler") return "Alquiler: lo atiende una persona, sin IA.";
    if (tipoOportunidad === "inmobiliaria") return "Inmobiliaria: la atiende una persona, sin IA.";
    return null;
  }
  if (tipos.includes("propio")) return "De la empresa: sin IA ni oportunidades.";
  if (tipos.includes("proveedor")) return "Proveedor: lo atiende una persona, sin IA.";
  if (tipos.includes("inmobiliaria")) return "Inmobiliaria: la atiende una persona, sin IA.";
  return null;
}

/**
 * 068 — Lo comercial del contacto en el panel del chat: qué tipo de contacto
 * es y su oportunidad abierta (etapa, cierre, edificios y tipologías).
 * Reemplaza el stepper del pipeline de Vocero: en War avanza la oportunidad.
 */
export function OportunidadPanel({
  contactId,
  refreshKey = 0,
  enChat = false,
  agenda = false,
  contactoNombre = null,
  antesDelInteres = null,
}: {
  contactId: string;
  refreshKey?: number;
  /**
   * v3 — En el sidebar del chat: sin el tipo de contacto y con la tira de
   * botones de tareas (las mismas ventanas de todo el sistema) antes de la etapa.
   */
  enChat?: boolean;
  agenda?: boolean;
  contactoNombre?: string | null;
  /** v5 — En el chat, lo que va entre los botones de acción y el interés (el Origen). */
  antesDelInteres?: React.ReactNode;
}) {
  const [datos, setDatos] = useState<EstadoComercialDto | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Cambios 25/11 — Con paso de cierre, las opciones se abren al tocarlo. */
  const [cerrando, setCerrando] = useState(false);
  const [eligiendoCierre, setEligiendoCierre] = useState<EstadoOportunidad | null>(null);
  const [avisoTarea, setAvisoTarea] = useState<string | null>(null);
  const [tipoNueva, setTipoNueva] = useState("venta");
  const voc = useVocabulario();
  const singular = enFrase(voc.singular);

  const cargar = useCallback(async () => {
    const res = await fetch(`/api/contacts/${contactId}/oportunidad`).catch(() => null);
    if (res?.ok) setDatos((await res.json()) as EstadoComercialDto);
  }, [contactId]);

  useEffect(() => {
    setDatos(null);
    setError(null);
    void cargar();
  }, [cargar]);

  useEffect(() => {
    if (refreshKey) void cargar();
  }, [refreshKey, cargar]);

  async function pedir(url: string, init: RequestInit) {
    setGuardando(true);
    setError(null);
    const res = await fetch(url, {
      ...init,
      headers: { "content-type": "application/json" },
    }).catch(() => null);
    setGuardando(false);
    if (!res) {
      setError("No se pudo guardar. Revisá tu conexión.");
      return;
    }
    const data = (await res.json().catch(() => null)) as
      | (EstadoComercialDto & { error?: { message?: string } })
      | null;
    if (!res.ok) {
      setError(data?.error?.message ?? "No se pudo guardar");
      return;
    }
    if (data && "tiposContacto" in data) setDatos(data);
    else void cargar();
  }

  async function cambiarTipos(tiposContacto: string[]) {
    await pedir(`/api/contacts/${contactId}`, {
      method: "PATCH",
      body: JSON.stringify({ tiposContacto }),
    });
    void cargar();
  }

  function cambiarOportunidad(cambios: {
    estado?: EstadoOportunidad;
    motivoCierre?: string | null;
    edificioIds?: string[];
    ambientes?: number[];
  }) {
    if (!datos?.abierta) return;
    void pedir(`/api/contacts/${contactId}/oportunidad`, {
      method: "PATCH",
      body: JSON.stringify({ oportunidadId: datos.abierta.id, ...cambios }),
    });
  }

  if (!datos) return null;
  const { tiposContacto, abierta } = datos;
  const pasoActual = abierta ? voc.camino.indexOf(abierta.estado) : -1;
  const aviso = avisoSinIa(tiposContacto, abierta?.tipo, Boolean(abierta));
  const Extra = enChat && abierta ? ExtraOportunidadChat : null;

  /** El interés de la oportunidad: edificio, tipología (ambientes) y, con la extensión, unidades. */
  const interes =
    abierta && voc.inmobiliario ? (
      enChat ? (
        // v5 — En el chat, desplegables en lugar de pastillas: ocupan menos.
        <>
          <p className="mb-1.5 text-[11px] font-medium text-text-2">Edificio</p>
          <Select
            multiple
            aria-label="Edificio"
            values={abierta.edificios.map((e) => e.id)}
            placeholder="Elegí el edificio…"
            disabled={guardando}
            onValuesChange={(edificioIds) => cambiarOportunidad({ edificioIds })}
            className="h-auto min-h-8 w-full"
          >
            {datos.edificios.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </Select>
          <p className="mb-1.5 mt-3 text-[11px] font-medium text-text-2">Tipología</p>
          <Select
            multiple
            aria-label="Tipología"
            values={abierta.ambientes.map(String)}
            placeholder="Elegí los ambientes…"
            disabled={guardando}
            onValuesChange={(valores) => cambiarOportunidad({ ambientes: valores.map(Number) })}
            className="h-auto min-h-8 w-full"
          >
            {AMBIENTES.map((n) => (
              <option key={n} value={String(n)}>
                {etiquetaAmbientes(n)}
              </option>
            ))}
          </Select>
        </>
      ) : (
      <>
        <p className="mb-1.5 text-[11px] font-medium text-text-2">Edificios de interés</p>
        <Chips
          opciones={datos.edificios.map((e) => ({ value: e.id, label: e.nombre }))}
          elegidos={abierta.edificios.map((e) => e.id)}
          vacio="Todavía no hay edificios cargados."
          disabled={guardando}
          onCambio={(edificioIds) => cambiarOportunidad({ edificioIds })}
        />
        <p className="mb-1.5 mt-3 text-[11px] font-medium text-text-2">Ambientes de interés</p>
        <Chips
          opciones={AMBIENTES.map((n) => ({ value: String(n), label: etiquetaAmbientes(n) }))}
          elegidos={abierta.ambientes.map(String)}
          disabled={guardando}
          onCambio={(valores) => cambiarOportunidad({ ambientes: valores.map(Number) })}
        />
      </>
      )
    ) : null;
  const interesCompleto =
    interes && abierta ? (
      <>
        {interes}
        {Extra && (
          <div className="mt-3">
            <Extra oportunidadId={abierta.id} refreshKey={refreshKey} />
          </div>
        )}
      </>
    ) : null;
  /** Lo elegido, para verlo con la sección cerrada. */
  const resumenInteres = abierta
    ? [
        abierta.edificios.map((e) => e.nombre).join(", "),
        abierta.ambientes.length ? `${abierta.ambientes.join(", ")} amb.` : "",
      ]
        .filter(Boolean)
        .join(" · ") || "Sin elegir"
    : null;

  /** La etapa de la oportunidad abierta (o crear una), con el cierre. */
  const etapa = (
    <>
            <div className="mb-3 flex items-baseline justify-between gap-2">
              {/* En el chat el título ya es el de la sección. */}
              {!enChat && <p className="kicker">{voc.singular}</p>}
              {datos.anteriores > 0 && (
                <span className="text-[11px] text-text-3">
                  {datos.anteriores} anterior{datos.anteriores === 1 ? "" : "es"}
                </span>
              )}
            </div>

            {!abierta ? (
              <div className="rounded-md border bg-subtle p-3">
                <p className="text-[12px] text-text-2">No tiene una {singular} abierta.</p>
                {voc.inmobiliario && (
                  <Select
                    aria-label="Qué busca"
                    value={tipoNueva}
                    onValueChange={setTipoNueva}
                    className="mt-2 h-8 w-full text-[12px]"
                  >
                    {TIPOS_OPORTUNIDAD.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </Select>
                )}
                <Button
                  size="sm"
                  className="mt-2 w-full"
                  disabled={guardando}
                  onClick={() =>
                    void pedir(`/api/contacts/${contactId}/oportunidad`, {
                      method: "POST",
                      body: JSON.stringify(voc.inmobiliario ? { tipo: tipoNueva } : {}),
                    })
                  }
                >
                  Crear {singular}
                </Button>
              </div>
            ) : (
              <>
                <ol>
                  {voc.camino.map((estado, i) => {
                    const hecho = pasoActual >= 0 && i < pasoActual;
                    const actual = estado === abierta.estado;
                    return (
                      <li key={estado} className="relative flex gap-3 pb-3 last:pb-0">
                        {i < voc.camino.length - 1 && (
                          <span
                            className={cn(
                              "absolute left-[7px] top-4 h-full w-px",
                              hecho ? "bg-brand" : "bg-border-strong"
                            )}
                          />
                        )}
                        <button
                          type="button"
                          disabled={guardando}
                          onClick={() => cambiarOportunidad({ estado })}
                          aria-label={`Mover a ${nombreEstado(voc, estado)}`}
                          className={cn(
                            "relative z-10 mt-0.5 flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full transition-colors",
                            hecho && "bg-brand text-brand-fg",
                            actual && "bg-brand ring-4 ring-brand-soft",
                            !hecho && !actual && "border border-border-strong bg-background hover:border-brand"
                          )}
                        >
                          {hecho && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                        </button>
                        <button
                          type="button"
                          disabled={guardando}
                          onClick={() => cambiarOportunidad({ estado })}
                          className={cn(
                            "text-left text-[13px]",
                            actual ? "font-[650] text-brand-text" : "text-text-2 hover:text-foreground"
                          )}
                        >
                          {nombreEstado(voc, estado)}
                          {estado === "compro" && (
                            <span className="ml-1 text-[11px] text-text-3">(cierra)</span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                  {voc.ganadaEnElCierre && (
                    <li className="relative flex gap-3">
                      <button
                        type="button"
                        onClick={() => setCerrando((v) => !v)}
                        aria-expanded={cerrando}
                        aria-label={voc.etiquetaCerrar}
                        className="relative z-10 mt-0.5 flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full border border-border-strong bg-background hover:border-brand"
                      />
                      <button
                        type="button"
                        onClick={() => setCerrando((v) => !v)}
                        aria-expanded={cerrando}
                        className="text-left text-[13px] text-text-2 hover:text-foreground"
                      >
                        {voc.etiquetaCerrar}
                      </button>
                    </li>
                  )}
                </ol>
                {abierta.sinRespuesta && (
                  <p className="mt-2 text-[12px] font-medium text-warning-text">{abierta.sinRespuesta}</p>
                )}
                <a
                  href={`/oportunidades/${abierta.id}`}
                  className="mt-2 inline-block text-[12px] font-medium text-brand-ink hover:underline"
                >
                  Ver la {singular} completa →
                </a>

                {(!voc.ganadaEnElCierre || cerrando) && (
                <div className="mt-3 rounded-md border bg-subtle p-2.5">
                  <p className="mb-1.5 text-[11px] font-medium text-text-2">
                    {voc.ganadaEnElCierre ? voc.etiquetaCerrar : "Cerrar"}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {voc.cierres.filter((e) => !voc.camino.includes(e)).map((estado: EstadoOportunidad) => (
                      <Button
                        key={estado}
                        size="sm"
                        variant="outline"
                        disabled={guardando || abierta.estado === estado}
                        onClick={() => setEligiendoCierre(estado)}
                      >
                        {nombreEstado(voc, estado)}
                      </Button>
                    ))}
                  </div>
                </div>
                )}
                {/* v7 — El motivo se pide en una ventana. */}
                {eligiendoCierre && (
                  <VentanaMotivoCierre
                    cierre={nombreEstado(voc, eligiendoCierre)}
                    motivos={voc.motivos}
                    obligatorio={voc.motivoObligatorio}
                    onConfirmar={async (m) => cambiarOportunidad({ estado: eligiendoCierre, motivoCierre: m })}
                    onCerrar={() => setEligiendoCierre(null)}
                  />
                )}

                {!enChat && interes && <div className="mt-4">{interes}</div>}
              </>
            )}
    </>
  );

  // v5 — En el chat: los botones de acción siempre a la vista y el resto en
  // secciones que arrancan plegadas (Origen, Interés, la oportunidad).
  if (enChat) {
    return (
      <>
        {abierta && (
          <section className="border-b p-4">
            <BotonesNuevaTarea
              modal
              oportunidadId={abierta.id}
              contacto={{ id: contactId, nombre: contactoNombre ?? abierta.nombre }}
              edificioOportunidad={abierta.edificios[0] ?? null}
              agenda={agenda}
              onCreada={async (texto) => {
                setAvisoTarea(texto);
                await cargar();
              }}
            />
            {avisoTarea && <p className="mt-2 text-[11.5px] text-success-text">{avisoTarea}</p>}
            {aviso && <p className="mt-1.5 text-[11px] text-text-3">{aviso}</p>}
            {error && <p className="mt-2 text-xs text-danger-text">{error}</p>}
          </section>
        )}
        {antesDelInteres}
        {interesCompleto && (
          <SeccionPlegable titulo="Interés" resumen={resumenInteres}>
            {interesCompleto}
          </SeccionPlegable>
        )}
        <SeccionPlegable
          titulo={voc.singular}
          resumen={abierta ? nombreEstado(voc, abierta.estado) : `Sin ${singular} abierta`}
        >
          {!abierta && aviso && <p className="mb-2 text-[11px] text-text-3">{aviso}</p>}
          {etapa}
          {!abierta && error && <p className="mt-2 text-xs text-danger-text">{error}</p>}
        </SeccionPlegable>
      </>
    );
  }

  return (
    <section className="border-b p-4">
      {voc.inmobiliario && !enChat && (
        <>
          <p className="kicker mb-2">Tipo de contacto</p>
          <Select
            multiple
            aria-label="Tipo de contacto"
            values={tiposContacto}
            placeholder="Sin clasificar"
            disabled={guardando}
            onValuesChange={(valores) => void cambiarTipos(valores)}
            className="w-full"
          >
            {TIPOS_CONTACTO.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
          <p className="mt-1.5 text-[11px] text-text-3">
            Lo que la persona es: puede ser varias cosas. Lo que busca (comprar, alquilar) va en la {singular}.
          </p>
        </>
      )}
      {aviso && <p className="mt-1.5 text-[11px] text-text-3">{aviso}</p>}

      {(
        <div className={voc.inmobiliario && !enChat ? "mt-4" : undefined}>
          {etapa}
        </div>
      )}

      {error && <p className="mt-2 text-xs text-danger-text">{error}</p>}
    </section>
  );
}

/** Botones que se prenden y apagan para elegir varios valores. */
export function Chips({
  opciones,
  elegidos,
  onCambio,
  disabled,
  vacio,
}: {
  opciones: { value: string; label: string }[];
  elegidos: string[];
  onCambio: (valores: string[]) => void;
  disabled?: boolean;
  vacio?: string;
}) {
  if (opciones.length === 0) {
    return <p className="text-[11px] text-text-3">{vacio ?? "Sin opciones."}</p>;
  }
  const set = new Set(elegidos);
  return (
    <div className="flex flex-wrap gap-1.5">
      {opciones.map((o) => {
        const activo = set.has(o.value);
        return (
          <button
            key={o.value}
            type="button"
            disabled={disabled}
            aria-pressed={activo}
            onClick={() =>
              onCambio(
                activo
                  ? elegidos.filter((v) => v !== o.value)
                  : [...elegidos, o.value]
              )
            }
            className={cn(
              "rounded-full border px-2.5 py-1 text-[12px] transition-colors",
              activo
                ? "border-brand bg-brand-soft text-brand-text"
                : "border-border-strong text-text-2 hover:border-brand"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
