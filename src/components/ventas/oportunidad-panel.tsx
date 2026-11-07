"use client";

import { useCallback, useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  CAMINO_OPORTUNIDAD,
  ESTADOS_OPORTUNIDAD,
  TIPOLOGIAS,
  TIPOS_CONTACTO,
  etiqueta,
  type EstadoOportunidad,
  type TipoContacto,
  type Tipologia,
} from "@/lib/ventas";
import type { EstadoComercialDto } from "@/server/oportunidades";
import { useMotivosCierre } from "./use-motivos-cierre";
import { Select } from "@/components/ui/select";

const CIERRES: EstadoOportunidad[] = ["no_calificado", "perdido"];

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
}: {
  contactId: string;
  refreshKey?: number;
}) {
  const [datos, setDatos] = useState<EstadoComercialDto | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const motivosCierre = useMotivosCierre();

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
    tipologias?: Tipologia[];
  }) {
    if (!datos?.abierta) return;
    void pedir(`/api/contacts/${contactId}/oportunidad`, {
      method: "PATCH",
      body: JSON.stringify({ oportunidadId: datos.abierta.id, ...cambios }),
    });
  }

  if (!datos) return null;
  const { tipoContacto, abierta } = datos;
  const pasoActual = abierta ? CAMINO_OPORTUNIDAD.indexOf(abierta.estado) : -1;

  return (
    <section className="border-b p-4">
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

      {tipoContacto === "lead" && (
        <div className="mt-4">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <p className="kicker">Oportunidad</p>
            {datos.anteriores > 0 && (
              <span className="text-[11px] text-text-3">
                {datos.anteriores} anterior{datos.anteriores === 1 ? "" : "es"}
              </span>
            )}
          </div>

          {!abierta ? (
            <div className="rounded-md border bg-subtle p-3">
              <p className="text-[12px] text-text-2">No tiene una oportunidad abierta.</p>
              <Button
                size="sm"
                className="mt-2 w-full"
                disabled={guardando}
                onClick={() =>
                  void pedir(`/api/contacts/${contactId}/oportunidad`, { method: "POST" })
                }
              >
                Abrir oportunidad nueva
              </Button>
            </div>
          ) : (
            <>
              <ol>
                {CAMINO_OPORTUNIDAD.map((estado, i) => {
                  const hecho = pasoActual >= 0 && i < pasoActual;
                  const actual = estado === abierta.estado;
                  return (
                    <li key={estado} className="relative flex gap-3 pb-3 last:pb-0">
                      {i < CAMINO_OPORTUNIDAD.length - 1 && (
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
                        aria-label={`Mover a ${etiqueta(ESTADOS_OPORTUNIDAD, estado)}`}
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
                        {etiqueta(ESTADOS_OPORTUNIDAD, estado)}
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
                Ver la oportunidad completa →
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
                  {motivosCierre.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </Select>
                <div className="flex flex-wrap gap-1.5">
                  {CIERRES.map((estado) => (
                    <Button
                      key={estado}
                      size="sm"
                      variant="outline"
                      disabled={guardando || abierta.estado === estado}
                      onClick={() =>
                        cambiarOportunidad({ estado, motivoCierre: motivo || null })
                      }
                    >
                      {etiqueta(ESTADOS_OPORTUNIDAD, estado)}
                    </Button>
                  ))}
                </div>
              </div>

              <p className="mb-1.5 mt-4 text-[11px] font-medium text-text-2">Edificios de interés</p>
              <Chips
                opciones={datos.edificios.map((e) => ({ value: e.id, label: e.nombre }))}
                elegidos={abierta.edificios.map((e) => e.id)}
                vacio="Todavía no hay edificios cargados."
                disabled={guardando}
                onCambio={(edificioIds) => cambiarOportunidad({ edificioIds })}
              />

              <p className="mb-1.5 mt-3 text-[11px] font-medium text-text-2">Tipologías de interés</p>
              <Chips
                opciones={TIPOLOGIAS.map((t) => ({ value: t.value, label: t.label }))}
                elegidos={abierta.tipologias}
                disabled={guardando}
                onCambio={(tipologias) =>
                  cambiarOportunidad({ tipologias: tipologias as Tipologia[] })
                }
              />
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
