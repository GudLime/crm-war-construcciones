"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  AJUSTES_VENTAS_POR_DEFECTO,
  MODOS_SIN_RESPUESTA,
  type AjustesVentas,
  type ModoSinRespuesta,
} from "@/lib/ventas-ajustes";

/**
 * War — Configuración → Ventas. Cuándo una oportunidad se da por perdida
 * porque la persona no responde, y hasta cuándo un mensaje suyo reabre la
 * misma oportunidad en vez de abrir otra.
 */
export function VentasAjustesClient() {
  const [ajustes, setAjustes] = useState<AjustesVentas | null>(null);
  const [puedeEditar, setPuedeEditar] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/settings/ventas").catch(() => null);
      if (!res?.ok) {
        setAjustes({ ...AJUSTES_VENTAS_POR_DEFECTO });
        return;
      }
      const d = (await res.json()) as { ajustes: AjustesVentas; puedeEditar: boolean };
      setAjustes(d.ajustes);
      setPuedeEditar(d.puedeEditar);
    })();
  }, []);

  if (!ajustes) return <p className="text-sm text-text-3">Cargando…</p>;

  function numero(campo: keyof Omit<AjustesVentas, "sinRespuestaModo">, valor: string) {
    const n = Number.parseInt(valor, 10);
    setAjustes((a) => (a ? { ...a, [campo]: Number.isFinite(n) ? n : 0 } : a));
  }

  async function guardar() {
    if (!ajustes) return;
    setGuardando(true);
    setAviso(null);
    const res = await fetch("/api/settings/ventas", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(ajustes),
    }).catch(() => null);
    setGuardando(false);
    if (!res?.ok) {
      const d = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
      setAviso({ tipo: "error", texto: d?.error?.message ?? "No se pudo guardar. Revisá los valores." });
      return;
    }
    setAviso({ tipo: "ok", texto: "Guardado" });
  }

  const apagado = ajustes.sinRespuestaModo === "apagado";

  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Leads que no responden</CardTitle>
          <CardDescription>
            Un <strong>intento</strong> es una tanda de mensajes nuestros (de Mateo o del equipo,
            dentro de la misma hora) o una tarea marcada «No responde». Se cuentan desde lo último
            que escribió la persona y vuelven a cero en cuanto contesta. Mientras tanto, la
            oportunidad muestra «Sin respuesta» sin cambiar de estado.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="sr-modo">Cuando se cumple el umbral</Label>
            <Select
              id="sr-modo"
              value={ajustes.sinRespuestaModo}
              disabled={!puedeEditar}
              onValueChange={(v) => setAjustes({ ...ajustes, sinRespuestaModo: v as ModoSinRespuesta })}
              className="w-full max-w-xs"
            >
              {MODOS_SIN_RESPUESTA.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </Select>
            <p className="text-[12px] text-text-3">
              «Cerrar sola» la pasa a Perdido con motivo «No responde». «Sugerir el cierre» la marca
              en Oportunidades para que alguien la cierre con un clic.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="sr-intentos">Intentos sin respuesta</Label>
              <Input
                id="sr-intentos"
                type="number"
                min={1}
                max={50}
                value={ajustes.sinRespuestaIntentos}
                disabled={!puedeEditar || apagado}
                onChange={(e) => numero("sinRespuestaIntentos", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sr-dias">Días desde el último intento</Label>
              <Input
                id="sr-dias"
                type="number"
                min={1}
                max={365}
                value={ajustes.sinRespuestaDias}
                disabled={!puedeEditar || apagado}
                onChange={(e) => numero("sinRespuestaDias", e.target.value)}
              />
            </div>
          </div>
          {!apagado && (
            <p className="rounded-lg bg-subtle px-3 py-2 text-[13px] text-text-2">
              Con {ajustes.sinRespuestaIntentos} intento{ajustes.sinRespuestaIntentos === 1 ? "" : "s"} y{" "}
              {ajustes.sinRespuestaDias} día{ajustes.sinRespuestaDias === 1 ? "" : "s"} sin respuesta desde
              el último, la oportunidad{" "}
              {ajustes.sinRespuestaModo === "cerrar" ? "se cierra sola" : "queda marcada para cerrar"}. Se
              revisa cada hora.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reapertura</CardTitle>
          <CardDescription>
            Si alguien cuya oportunidad se perdió vuelve a escribir dentro de este plazo, se reabre
            la MISMA oportunidad (con su formulario y su campaña) en el estado que tenía. Pasado el
            plazo, se abre una nueva. Las «No calificado» y las «Compró» no se reabren.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-w-xs space-y-1.5">
            <Label htmlFor="reapertura-dias">Días para reabrir</Label>
            <Input
              id="reapertura-dias"
              type="number"
              min={0}
              max={3650}
              value={ajustes.reaperturaDias}
              disabled={!puedeEditar}
              onChange={(e) => numero("reaperturaDias", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {puedeEditar ? (
        <div className="flex items-center gap-3">
          <Button onClick={() => void guardar()} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar"}
          </Button>
          {aviso && (
            <span className={aviso.tipo === "ok" ? "text-sm text-success-text" : "text-sm text-danger-text"}>
              {aviso.texto}
            </span>
          )}
        </div>
      ) : (
        <p className="text-sm text-text-3">Solo quien administra puede cambiar estos ajustes.</p>
      )}
    </div>
  );
}
