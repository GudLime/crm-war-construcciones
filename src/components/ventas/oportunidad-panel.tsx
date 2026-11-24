"use client";

import { BotonesNuevaTarea } from "@/components/ventas/nueva-tarea";
import { useCallback, useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  AMBIENTES,
  TIPOS_CONTACTO,
  etiquetaAmbientes,
  type EstadoOportunidad,
  type TipoContacto,
} from "@/lib/ventas";
import { useVocabulario } from "@/components/vocabulario";
import { enFrase, nombreEstado } from "@/lib/vocabulario";
import type { EstadoComercialDto } from "@/server/oportunidades";
import { Select } from "@/components/ui/select";

const AVISO_EXCLUIDO: Record<Exclude<TipoContacto, "lead">, string> = {
  comprador: "Ya compró: fuera del proceso de venta. Lo atiende una persona, sin IA.",
  inmobiliaria: "Inmobiliaria: fuera del proceso de venta. La atiende una persona, sin IA.",
  proveedor: "Proveedor: fuera del proceso de venta. Lo atiende una persona.",
  propio: "Propio de WAR: fuera del proceso de venta. Sin IA.",
};

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
}) {
  const [datos, setDatos] = useState<EstadoComercialDto | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
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
    if (data && "tipoContacto" in data) setDatos(data);
    else void cargar();
  }

  async function cambiarTipo(valor: string) {
    await pedir(`/api/contacts/${contactId}`, {
      method: "PATCH",
      body: JSON.stringify({ tipoContacto: valor || null }),
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
  const { tipoContacto, abierta } = datos;
  const pasoActual = abierta ? voc.camino.indexOf(abierta.estado) : -1;
  // 071 — Sin lo inmobiliario no hay tipo de contacto: todos tienen su sección.
  const conVenta = !voc.inmobiliario || tipoContacto === "lead";

  return (
    <section className="border-b p-4">
      {voc.inmobiliario && !enChat && (
      <>
      <p className="kicker mb-2">Tipo de contacto</p>
      <Select
        aria-label="Tipo de contacto"
        value={tipoContacto ?? ""}
        disabled={guardando}
        onValueChange={(valor) => void cambiarTipo(valor)}
        className="w-full"
      >
        <option value="">Sin clasificar</option>
        {TIPOS_CONTACTO.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </Select>
      {tipoContacto == null && (
        <p className="mt-1.5 text-[11px] text-text-3">
          La IA lo clasifica cuando la conversación lo deja claro. Recién como Lead
          se abre la oportunidad.
        </p>
      )}
      {tipoContacto && tipoContacto !== "lead" && (
        <p className="mt-1.5 text-[11px] text-text-3">{AVISO_EXCLUIDO[tipoContacto]}</p>
      )}
      </>
      )}

      {conVenta && (
        <div className={voc.inmobiliario && !enChat ? "mt-4" : undefined}>
          {enChat && abierta && (
            <div className="mb-4">
              <BotonesNuevaTarea
                modal
                oportunidadId={abierta.id}
                contacto={{ id: contactId, nombre: contactoNombre ?? abierta.nombre }}
                edificioOportunidad={abierta.edificios[0] ?? null}
                agenda={agenda}
                onCreada={async (texto) => {
                  setAviso(texto);
                  await cargar();
                }}
              />
              {aviso && <p className="mt-2 text-[11.5px] text-success-text">{aviso}</p>}
            </div>
          )}
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <p className="kicker">{voc.singular}</p>
            {datos.anteriores > 0 && (
              <span className="text-[11px] text-text-3">
                {datos.anteriores} anterior{datos.anteriores === 1 ? "" : "es"}
              </span>
            )}
          </div>

          {!abierta ? (
            <div className="rounded-md border bg-subtle p-3">
              <p className="text-[12px] text-text-2">No tiene una {singular} abierta.</p>
              <Button
                size="sm"
                className="mt-2 w-full"
                disabled={guardando}
                onClick={() =>
                  void pedir(`/api/contacts/${contactId}/oportunidad`, { method: "POST" })
                }
              >
                Abrir {singular} nueva
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

              <div className="mt-3 rounded-md border bg-subtle p-2.5">
                <p className="mb-1.5 text-[11px] font-medium text-text-2">Cerrar</p>
                <Select
                  aria-label="Motivo"
                  value={motivo}
                  onValueChange={(valor) => setMotivo(valor)}
                  className="mb-2 h-8 w-full text-[12px]"
                >
                  <option value="">Motivo (opcional)</option>
                  {voc.motivos.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </Select>
                <div className="flex flex-wrap gap-1.5">
                  {voc.cierres.filter((e) => e !== "compro").map((estado: EstadoOportunidad) => (
                    <Button
                      key={estado}
                      size="sm"
                      variant="outline"
                      disabled={guardando || abierta.estado === estado}
                      onClick={() =>
                        cambiarOportunidad({ estado, motivoCierre: motivo || null })
                      }
                    >
                      {nombreEstado(voc, estado)}
                    </Button>
                  ))}
                </div>
              </div>

              {voc.inmobiliario && (
              <>
              <p className="mb-1.5 mt-4 text-[11px] font-medium text-text-2">Edificios de interés</p>
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
              )}
            </>
          )}
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
