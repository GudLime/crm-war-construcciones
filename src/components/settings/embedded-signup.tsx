"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Script from "next/script";
import { CheckCircle2, KeyRound, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { leerEventoDeAlta, opcionesDeInit, opcionesDeLogin } from "@/lib/meta/signup-event";

/**
 * 066 — «Conectar con Meta» (Embedded Signup v4).
 *
 * Sin la app configurada en la instancia (GET 404) no se dibuja nada: queda
 * el alta manual de siempre (CA-1).
 *
 * El popup tiene que abrirse DIRECTO en el clic: un `await` antes y el
 * navegador lo bloquea. Por eso todo lo que necesita `FB.login` se carga al
 * montar, no al pulsar.
 *
 * 067 — Con la coexistencia encendida en la instancia aparece la opción «Ya
 * uso este número en la app WhatsApp Business». Marcada, el popup se abre en
 * modo coexistencia, no se pide PIN (el número no se registra) y el evento
 * `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING` termina el alta.
 */

type Config = {
  ready: boolean;
  canManage: boolean;
  appId?: string;
  configId?: string;
  graphVersion?: string;
  /** 067 — La instancia ofrece la coexistencia. */
  coexistencia?: boolean;
};
type Facebook = {
  init: (o: object) => void;
  login: (cb: (r: { authResponse?: { code?: string } | null }) => void, o: object) => void;
};
type Pendiente = {
  pin: string | null;
  modo: "normal" | "coexistencia";
  code?: string;
  evento?: { wabaId: string; phoneNumberId: string | null };
  enviando: boolean;
};
export type ResultadoEmbebido = {
  displayPhoneNumber: string;
  generatedPin?: string;
  webhook: unknown;
  /** 067 — Alta en coexistencia y si Meta aceptó cada sincronización. */
  coexistence?: { contactsSync: boolean; historySync: boolean };
};

const fb = () => (window as Window & { FB?: Facebook }).FB;
const API = "/api/settings/whatsapp/embedded";

export function EmbeddedSignup({
  onConnected,
}: {
  onConnected: (resultado: ResultadoEmbebido) => void;
}) {
  const [config, setConfig] = useState<Config | null>(null);
  const [oculto, setOculto] = useState(false);
  const [sdk, setSdk] = useState(false);
  const [pin, setPin] = useState("");
  const [coexistir, setCoexistir] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [exito, setExito] = useState<ResultadoEmbebido | null>(null);
  const activo = useRef<Pendiente | null>(null);
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hecho = useRef(onConnected);
  hecho.current = onConnected;

  useEffect(() => {
    void (async () => {
      const res = await fetch(API, { cache: "no-store" }).catch(() => null);
      if (!res) return setError("No pudimos comprobar si la conexión con Meta está disponible.");
      if (res.status === 404) return setOculto(true);
      if (res.ok) setConfig((await res.json()) as Config);
    })();
    return () => {
      activo.current = null;
      if (reloj.current) clearTimeout(reloj.current);
    };
  }, []);

  const fallar = useCallback((msg: string) => {
    activo.current = null;
    if (reloj.current) clearTimeout(reloj.current);
    setBusy(false);
    setError(msg);
  }, []);

  const enviar = useCallback(async () => {
    const p = activo.current;
    if (!p?.code || !p.evento || p.enviando) return;
    p.enviando = true;
    if (reloj.current) clearTimeout(reloj.current);
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: p.code,
          wabaId: p.evento.wabaId,
          phoneNumberId: p.evento.phoneNumberId,
          pin: p.pin,
          modo: p.modo,
        }),
        signal: AbortSignal.timeout(120_000),
      });
      const data = (await res.json().catch(() => null)) as
        | (ResultadoEmbebido & { error?: { message?: string } })
        | null;
      if (!res.ok || !data) {
        return fallar(data?.error?.message ?? "No se pudo completar la conexión.");
      }
      activo.current = null;
      setBusy(false);
      setPin("");
      setExito(data);
      hecho.current(data);
    } catch (e) {
      fallar(
        e instanceof Error && e.name === "TimeoutError"
          ? "La confirmación tardó demasiado. Recarga la página para ver si quedó conectado antes de repetir."
          : "Sin conexión con el servidor."
      );
    }
  }, [fallar]);

  useEffect(() => {
    const recibir = (ev: MessageEvent) => {
      if (!activo.current || activo.current.enviando) return;
      const e = leerEventoDeAlta(ev.origin, ev.data);
      if (!e) return;
      if (e.kind === "cancel") return fallar("La conexión se canceló en Meta. Puedes volver a intentarlo.");
      if (e.kind === "error") {
        return fallar(`Meta reportó un error${e.message ? `: ${e.message}` : ""}. Puedes volver a intentarlo.`);
      }
      if (e.kind === "coexistence") {
        if (activo.current.modo !== "coexistencia") {
          return fallar(
            "En Meta se eligió conectar la app de WhatsApp Business del teléfono (coexistencia). Marca «Ya uso este número en la app WhatsApp Business» y vuelve a conectar. No se guardó nada."
          );
        }
        if (!e.wabaId) return fallar("Meta no devolvió la cuenta de WhatsApp. Puedes volver a intentarlo.");
        activo.current.evento = { wabaId: e.wabaId, phoneNumberId: e.phoneNumberId };
        return void enviar();
      }
      activo.current.evento = { wabaId: e.wabaId, phoneNumberId: e.phoneNumberId };
      void enviar();
    };
    window.addEventListener("message", recibir);
    return () => window.removeEventListener("message", recibir);
  }, [enviar, fallar]);

  function iniciarSdk() {
    const f = fb();
    if (!f || !config?.appId || !config.graphVersion) return;
    f.init(opcionesDeInit(config.appId, config.graphVersion));
    setSdk(true);
  }

  const modoCoexistencia = Boolean(config?.coexistencia && coexistir);
  const pinValido = modoCoexistencia || pin === "" || /^\d{6}$/.test(pin);

  function lanzar() {
    const f = fb();
    if (!f || !config?.configId || !pinValido || activo.current) return;
    const p: Pendiente = {
      pin: modoCoexistencia ? null : pin || null,
      modo: modoCoexistencia ? "coexistencia" : "normal",
      enviando: false,
    };
    activo.current = p;
    setBusy(true);
    setError("");
    setExito(null);
    reloj.current = setTimeout(
      () => fallar("Meta no terminó la conexión. Permite las ventanas emergentes y vuelve a intentarlo."),
      10 * 60_000
    );
    try {
      f.login((r) => {
        if (activo.current !== p || p.enviando) return;
        if (!r.authResponse?.code) return fallar("Meta no autorizó la conexión. Puedes volver a intentarlo.");
        p.code = r.authResponse.code;
        void enviar();
      }, opcionesDeLogin(config.configId, { coexistencia: modoCoexistencia }));
    } catch {
      fallar("No se pudo abrir Meta. Permite las ventanas emergentes y vuelve a intentarlo.");
    }
  }

  if (oculto) return null;

  return (
    <Card>
      {config?.ready && config.canManage && (
        <Script
          id="meta-sdk"
          src="https://connect.facebook.net/es_LA/sdk.js"
          strategy="afterInteractive"
          onReady={iniciarSdk}
          onError={() => setError("No se pudo cargar Meta. Revisa el bloqueador del navegador y recarga.")}
        />
      )}
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" /> Conectar con Meta
        </CardTitle>
        <CardDescription>
          La conexión oficial: autorizas tu cuenta en la ventana de Meta y el
          CRM registra el número y el webhook sin copiar tokens.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {!config && !error && <p className="text-muted-foreground">Comprobando disponibilidad…</p>}
        {config && !config.canManage && (
          <p className="text-muted-foreground">Solo quien administra la cuenta puede conectar WhatsApp.</p>
        )}

        {config?.canManage && (
          <>
            {config.coexistencia && (
              <label className="flex max-w-lg items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={coexistir}
                  disabled={busy}
                  onChange={(e) => setCoexistir(e.target.checked)}
                />
                <span>
                  <span className="font-medium">Ya uso este número en la app WhatsApp Business</span>
                  <span className="block text-xs text-muted-foreground">
                    Coexistencia: el número sigue funcionando en el teléfono y lo que
                    contestes desde ahí aparece en la bandeja. Se importan tus contactos
                    y hasta 180 días de chats.
                  </span>
                </span>
              </label>
            )}
            {!modoCoexistencia && (
              <div className="max-w-sm space-y-1.5">
                <Label htmlFor="embedded-pin">
                  PIN de verificación en dos pasos{" "}
                  <span className="font-normal text-muted-foreground">(opcional)</span>
                </Label>
                <Input
                  id="embedded-pin"
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={6}
                  value={pin}
                  disabled={busy}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                />
                <p className="text-xs text-muted-foreground">
                  Solo si tu número ya tiene uno. Si lo dejas vacío, generamos
                  uno al registrar el número y te lo mostramos una vez.
                </p>
              </div>
            )}

            <Button disabled={!sdk || busy || !pinValido} onClick={lanzar}>
              {busy ? "Completando la conexión…" : "Conectar con Meta"}
            </Button>
          </>
        )}

        {error && (
          <p role="alert" className="rounded-lg border border-danger-soft bg-danger-tint p-3 text-danger-text">
            {error}
          </p>
        )}
        {exito && (
          <div
            role="status"
            className="space-y-2 rounded-lg border border-success-soft bg-success-tint p-3 text-success-text"
          >
            <p className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> Conectado {exito.displayPhoneNumber}
              {exito.coexistence ? " en coexistencia con la app del teléfono." : "."}
            </p>
            {exito.coexistence && (
              <p className="text-xs">
                {exito.coexistence.contactsSync && exito.coexistence.historySync
                  ? "Estamos importando tus contactos y chats: puede tardar desde unos minutos hasta algunas horas."
                  : "Meta no aceptó importar los contactos o los chats anteriores. Los mensajes nuevos llegan igual; para importar lo anterior hay que desconectar el número desde la app y volver a conectarlo."}
              </p>
            )}
            {exito.generatedPin && (
              <p className="flex items-start gap-2">
                <KeyRound className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  PIN de verificación en dos pasos del número:{" "}
                  <b className="font-mono tracking-widest">{exito.generatedPin}</b>. Guárdalo en tu
                  gestor de contraseñas: no lo volveremos a mostrar.
                </span>
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
