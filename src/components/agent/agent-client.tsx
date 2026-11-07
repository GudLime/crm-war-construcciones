"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Download, History, Pencil, Plus, Sparkles, Trash2, Upload, X } from "lucide-react";
import { BrainStatusCard } from "@/components/agent/brain-status-card";
import { externalDown, type BrainStatusDto } from "@/lib/brain-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAvisoGuardado } from "@/components/ui/aviso-guardado";
import { Resumen } from "@/components/ui/seccion-editable";
import { Markdown } from "@/components/ui/markdown";
import { decodificarArchivo } from "@/lib/unidades-csv";
import {
  HERRAMIENTAS,
  ROLES,
  type ClaveHerramienta,
} from "@/lib/agent-roles";

type Profile = {
  enabled: boolean;
  name: string;
  tone: string | null;
  instructions: string | null;
  escalationRules: string | null;
  greeting: string | null;
  /** 034 */
  role: string;
  tools: ClaveHerramienta[];
};

type KbEntry = {
  id: string;
  kind: "qa" | "block";
  question: string | null;
  answer: string | null;
  content: string | null;
};

export function AgentClient() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [aiConfigured, setAiConfigured] = useState(true);
  const [aiMensaje, setAiMensaje] = useState<string | null>(null);
  const [entries, setEntries] = useState<KbEntry[]>([]);
  const [kbSize, setKbSize] = useState<{ chars: number; warnAt: number; warning: boolean } | null>(null);
  const avisar = useAvisoGuardado();
  // 036 — Por qué no se pudo encender (409 `sin_cerebro`): el mensaje del
  // servidor, tal cual, junto al interruptor.
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [agendaEnabled, setAgendaEnabled] = useState(false);
  // «Quién responde»: se refresca solo, porque la última llamada del cerebro
  // externo y su /health cambian sin que nadie toque esta pantalla.
  const [brain, setBrain] = useState<BrainStatusDto | null>(null);

  const loadBrain = useCallback(async () => {
    const b = await fetch("/api/agent/brain-status")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    setBrain(b);
  }, []);

  const refetch = useCallback(async () => {
    const [p, kb, size] = await Promise.all([
      fetch("/api/agent/profile").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/kb").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/kb/size").then((r) => (r.ok ? r.json() : null)),
      loadBrain(),
    ]).catch(() => [null, null, null]);
    if (p) {
      setProfile(p.profile);
      setAiConfigured(p.aiConfigured);
      setAiMensaje(p.aiMensaje ?? null);
      setAgendaEnabled(p.agendaEnabled === true);
    }
    if (kb) setEntries(kb.entries);
    if (size) setKbSize(size);
  }, [loadBrain]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  useEffect(() => {
    const id = setInterval(() => void loadBrain(), 30_000);
    return () => clearInterval(id);
  }, [loadBrain]);

  if (!profile) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Cargando…
      </div>
    );
  }

  async function cargarPreset() {
    const ok = window.confirm(
      `Cargar el rol «${ROLES.calificador.etiqueta}» reemplaza las instrucciones y las reglas de escalado, y enciende todas sus herramientas. ¿Continuar?`
    );
    if (!ok) return;
    await fetch("/api/agent/profile/preset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "calificador" }),
    }).catch(() => null);
    avisar("Rol cargado");
    void refetch();
  }

  async function saveProfile(patch: Partial<Profile>): Promise<boolean> {
    const res = await fetch("/api/agent/profile", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    }).catch(() => null);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      if (patch.enabled !== undefined) {
        setSwitchError(
          data?.error?.message ??
            (patch.enabled ? "No se pudo encender el agente." : "No se pudo apagar el agente.")
        );
      }
      void refetch();
      if (patch.enabled === undefined) {
        avisar(data?.error?.message ?? "No se pudieron guardar los cambios", "error");
      }
      return false;
    }
    if (patch.enabled !== undefined) setSwitchError(null);
    avisar(
      patch.enabled === true
        ? "Agente encendido"
        : patch.enabled === false
          ? "Agente apagado"
          : "Cambios aplicados"
    );
    void refetch();
    return true;
  }

  // 036 — El interruptor solo se enciende con un agente conectado (el
  // servidor lo exige igual: 409 `sin_cerebro`). Apagarlo se puede siempre:
  // un perfil que quedó encendido sin cerebro no debe quedarse atrapado.
  const brainConnected = brain?.dispatch.active === true;
  const switchDisabled = !profile.enabled && brain !== null && !brainConnected;

  // 036 — Sin llave de IA el agente conectado no tiene con qué pensar (piensa
  // por el CRM, `/api/bot/llm`). Sin agente conectado no hace falta pedirla:
  // la bandeja manual no la usa. Con el agente caído ya lo dice la tarjeta.
  const aiCallout =
    !aiConfigured && brainConnected && brain && !externalDown(brain);

  return (
    <div className="h-full overflow-y-auto">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 sm:px-6 sm:py-4">
        <h2 className="text-[17px] font-bold tracking-tight">Agente de IA</h2>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {profile.enabled ? "Encendido" : "Apagado"}
          </span>
          {/* El interruptor compartido (#53): el pomo propio de aquí era
              `absolute` sin `left`, arrancaba del centro de la pista y
              encendido quedaba afuera. */}
          {/* Encender exige IA; APAGAR se puede siempre. Con la llave pausada
              (#85) el agente sigue «encendido» sin poder pensar, y un
              interruptor bloqueado dejaría al dueño sin forma de callarlo. */}
          <Switch
            checked={profile.enabled}
            disabled={switchDisabled}
            label="Agente encendido"
            onCheckedChange={(enabled) => void saveProfile({ enabled })}
          />
        </div>
        {(switchError || switchDisabled) && (
          <p
            role={switchError ? "alert" : undefined}
            className={
              switchError
                ? "w-full text-right text-xs text-danger-text"
                : "w-full text-right text-xs text-muted-foreground"
            }
          >
            {switchError ?? "Se enciende cuando conectes tu agente."}
          </p>
        )}
      </header>

      {brain && (
        <div className="mx-4 mt-4 sm:mx-6 sm:mt-6">
          <BrainStatusCard status={brain} />
        </div>
      )}

      {aiCallout && (
        <div className="mx-4 mt-4 rounded-lg border border-brand-soft bg-brand-tint p-5 text-center sm:mx-6 sm:mt-6 sm:p-6">
          <Sparkles className="mx-auto mb-2 h-8 w-8 text-primary" />
          <p className="font-medium">
            {aiMensaje ? "Tu agente no puede pensar" : "Tu agente no tiene con qué pensar"}
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            {aiMensaje ??
              "Piensa a través del CRM con la llave de Ajustes → IA: elige el proveedor, el modelo y pega tu llave, sin reiniciar nada."}{" "}
            (Si tu agente usa su propia llave, puedes ignorar este aviso.)
          </p>
          <Link
            href="/settings/ai"
            className="mt-3 inline-block text-sm font-medium text-brand-text underline underline-offset-2"
          >
            Ir a Ajustes → IA →
          </Link>
        </div>
      )}

      <div className="grid gap-4 p-4 sm:gap-6 sm:p-6 lg:grid-cols-2">
        <RolSection
          profile={profile}
          agendaEnabled={agendaEnabled}
          onTools={(tools) => void saveProfile({ tools })}
          onPreset={() => void cargarPreset()}
        />
        <ProfileSection profile={profile} onSave={saveProfile} />
        <KbSection entries={entries} kbSize={kbSize} onChanged={() => void refetch()} />
      </div>
    </div>
  );
}

/**
 * 034 — El rol y sus herramientas. Las respeta el agente conectado (Nea); el
 * CRM se las entrega en su perfil (`/api/bot/profile`).
 */
function RolSection({
  profile,
  agendaEnabled,
  onTools,
  onPreset,
}: {
  profile: Profile;
  agendaEnabled: boolean;
  onTools: (tools: ClaveHerramienta[]) => void;
  onPreset: () => void;
}) {
  const rol = ROLES[profile.role as keyof typeof ROLES] ?? ROLES.calificador;
  const visibles = HERRAMIENTAS.filter((h) => !h.agenda || agendaEnabled);
  const encendida = (clave: ClaveHerramienta) => profile.tools.includes(clave);
  function cambiar(clave: ClaveHerramienta, on: boolean) {
    const siguiente = on
      ? [...profile.tools, clave]
      : profile.tools.filter((t) => t !== clave);
    onTools(siguiente);
  }

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle>
              Rol: {rol.etiqueta}
            </CardTitle>
            <CardDescription>{rol.descripcion}</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={onPreset}>
            Cargar el rol {rol.etiqueta}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="grid gap-3 sm:grid-cols-2">
          {visibles.map((h) => (
            <li key={h.clave} className="flex items-start justify-between gap-3 rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">{h.etiqueta}</p>
                <p className="text-xs text-muted-foreground">{h.descripcion}</p>
              </div>
              <Switch
                checked={h.fija ? true : encendida(h.clave)}
                disabled={h.fija === true}
                label={h.etiqueta}
                onCheckedChange={(on) => cambiar(h.clave, on)}
              />
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          El agente toma los cambios en unos minutos, sin redesplegar nada.
        </p>
      </CardContent>
    </Card>
  );
}

/** War — Límite de las instrucciones (lo que viaja en cada respuesta del agente). */
const MAX_INSTRUCCIONES = 8000;

function descargarTexto(nombre: string, texto: string) {
  const url = URL.createObjectURL(new Blob([texto], { type: "text/markdown;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

type VersionInstrucciones = { id: string; instructions: string; createdAt: string };

function ProfileSection({
  profile,
  onSave,
}: {
  profile: Profile;
  onSave: (patch: Partial<Profile>) => Promise<boolean>;
}) {
  const [form, setForm] = useState(profile);
  // Plegado por defecto: se edita con el lápiz y al guardar se vuelve a plegar.
  const [editando, setEditando] = useState(false);
  const [vista, setVista] = useState<"editar" | "previa">("editar");
  const [historial, setHistorial] = useState<VersionInstrucciones[] | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  const archivo = useRef<HTMLInputElement>(null);
  const avisar = useAvisoGuardado();
  useEffect(() => {
    if (!editando) setForm(profile);
  }, [profile, editando]);

  const largo = (form.instructions ?? "").length;
  const excedido = largo > MAX_INSTRUCCIONES;

  function cerrar() {
    setForm(profile);
    setEditando(false);
    setVista("editar");
  }

  async function cargarMd(file: File | undefined) {
    if (!file) return;
    const texto = decodificarArchivo(await file.arrayBuffer()).replace(/^\uFEFF/, "").trim();
    if (archivo.current) archivo.current.value = "";
    if (!texto) {
      avisar("El archivo está vacío", "error");
      return;
    }
    if (texto.length > MAX_INSTRUCCIONES) {
      avisar(
        `El archivo tiene ${texto.length.toLocaleString("es-AR")} caracteres; el máximo es ${MAX_INSTRUCCIONES.toLocaleString("es-AR")}. Acortalo y volvé a cargarlo.`,
        "error"
      );
      return;
    }
    // Se abre para revisar: nada se guarda hasta «Guardar cambios».
    setForm({ ...profile, instructions: texto });
    setEditando(true);
    setVista("previa");
  }

  async function abrirHistorial() {
    if (historial) {
      setHistorial(null);
      return;
    }
    const res = await fetch("/api/agent/profile/versiones").catch(() => null);
    if (!res?.ok) {
      avisar("No se pudo leer el historial", "error");
      return;
    }
    const data = (await res.json()) as { versiones: VersionInstrucciones[] };
    setHistorial(data.versiones);
  }

  async function restaurar(v: VersionInstrucciones) {
    if (!window.confirm("¿Volver a estas instrucciones? Las actuales quedan guardadas en el historial.")) return;
    const ok = await onSave({ instructions: v.instructions });
    if (ok) {
      setHistorial(null);
      setAbierta(null);
    }
  }

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Comportamiento</CardTitle>
            <CardDescription>
              Cómo se presenta y actúa el agente. Las instrucciones se escriben en
              Markdown: podés armarlas en otro chat y cargar el .md.
            </CardDescription>
          </div>
          {editando ? (
            <Button size="sm" variant="ghost" aria-label="Cerrar sin guardar" onClick={cerrar}>
              <X className="h-4 w-4" strokeWidth={1.8} />
            </Button>
          ) : (
            <div className="flex flex-wrap gap-2">
              <input
                ref={archivo}
                type="file"
                accept=".md,.markdown,.txt,text/markdown,text/plain"
                className="hidden"
                onChange={(e) => void cargarMd(e.target.files?.[0])}
              />
              <Button size="sm" variant="outline" onClick={() => archivo.current?.click()}>
                <Upload className="h-3.5 w-3.5" strokeWidth={1.8} />
                Cargar .md
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!profile.instructions}
                onClick={() =>
                  descargarTexto("instrucciones-agente.md", profile.instructions ?? "")
                }
              >
                <Download className="h-3.5 w-3.5" strokeWidth={1.8} />
                Descargar .md
              </Button>
              <Button size="sm" variant={historial ? "secondary" : "outline"} onClick={() => void abrirHistorial()}>
                <History className="h-3.5 w-3.5" strokeWidth={1.8} />
                Historial
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditando(true)}>
                <Pencil className="h-3.5 w-3.5" strokeWidth={1.8} />
                Editar
              </Button>
            </div>
          )}
        </div>
      </CardHeader>

      {historial && !editando && (
        <CardContent className="pt-0">
          <div className="rounded-md border bg-subtle p-3">
            <p className="mb-2 text-xs font-medium text-text-2">
              Versiones anteriores de las instrucciones (se guardan las últimas 20)
            </p>
            {historial.length === 0 ? (
              <p className="text-xs text-text-3">Todavía no hay versiones anteriores.</p>
            ) : (
              <ul className="space-y-1.5">
                {historial.map((v) => (
                  <li key={v.id} className="rounded-md border bg-card p-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[13px]">
                        {new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short" }).format(
                          new Date(v.createdAt)
                        )}
                        <span className="ml-2 text-xs text-text-3">
                          {v.instructions.length.toLocaleString("es-AR")} caracteres
                        </span>
                      </span>
                      <span className="flex gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setAbierta(abierta === v.id ? null : v.id)}
                        >
                          {abierta === v.id ? "Ocultar" : "Ver"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => descargarTexto("instrucciones-agente-anterior.md", v.instructions)}
                        >
                          <Download className="h-3.5 w-3.5" strokeWidth={1.8} />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => void restaurar(v)}>
                          Restaurar
                        </Button>
                      </span>
                    </div>
                    {abierta === v.id && (
                      <div className="mt-2 max-h-80 overflow-y-auto border-t pt-2">
                        <Markdown texto={v.instructions} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      )}

      {!editando ? (
        <CardContent className="space-y-4">
          <Resumen
            items={[
              { etiqueta: "Nombre del agente", valor: profile.name },
              { etiqueta: "Tono", valor: profile.tone },
              { etiqueta: "Saludo", valor: profile.greeting },
              { etiqueta: "Reglas de escalado", valor: profile.escalationRules, ancho: true },
            ]}
          />
          <div>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-text-3">
              Instrucciones
              {profile.instructions && (
                <span className="ml-2 normal-case tracking-normal">
                  · {profile.instructions.length.toLocaleString("es-AR")} /{" "}
                  {MAX_INSTRUCCIONES.toLocaleString("es-AR")} caracteres
                </span>
              )}
            </p>
            <div className="max-h-96 overflow-y-auto rounded-md border bg-subtle p-3">
              <Markdown texto={profile.instructions ?? ""} />
            </div>
          </div>
        </CardContent>
      ) : (
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="agent-name">Nombre del agente</Label>
              <Input
                id="agent-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="agent-tone">Tono</Label>
              <Input
                id="agent-tone"
                placeholder="p. ej. cercano y directo, con usted"
                value={form.tone ?? ""}
                onChange={(e) => setForm({ ...form, tone: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="agent-instructions">Instrucciones (Markdown)</Label>
              <div className="flex items-center gap-3">
                <span className={excedido ? "text-xs font-medium text-danger-text" : "text-xs text-text-3"}>
                  {largo.toLocaleString("es-AR")} / {MAX_INSTRUCCIONES.toLocaleString("es-AR")}
                </span>
                <div className="flex rounded-full border p-0.5 text-xs">
                  {(["editar", "previa"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setVista(v)}
                      className={
                        vista === v
                          ? "rounded-full bg-secondary px-2.5 py-1 font-medium"
                          : "rounded-full px-2.5 py-1 text-text-3 hover:text-foreground"
                      }
                    >
                      {v === "editar" ? "Editar" : "Vista previa"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {vista === "editar" ? (
              <Textarea
                id="agent-instructions"
                rows={18}
                className="font-mono text-[13px]"
                placeholder={"# Quién sos\nSos Mateo, asesor de ventas de WAR…\n\n## Precios\n- Primero un rango…"}
                value={form.instructions ?? ""}
                onChange={(e) => setForm({ ...form, instructions: e.target.value })}
              />
            ) : (
              <div className="max-h-[32rem] min-h-40 overflow-y-auto rounded-md border bg-subtle p-3">
                <Markdown texto={form.instructions ?? ""} />
              </div>
            )}
            {excedido && (
              <p className="text-xs text-danger-text">
                Pasaste el máximo por {(largo - MAX_INSTRUCCIONES).toLocaleString("es-AR")} caracteres.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="agent-escalation">Reglas de escalado</Label>
            <Textarea
              id="agent-escalation"
              rows={3}
              placeholder="Cuándo pasar la conversación a un humano… (también pueden ir dentro de las instrucciones)"
              value={form.escalationRules ?? ""}
              onChange={(e) => setForm({ ...form, escalationRules: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="agent-greeting">Saludo</Label>
            <Input
              id="agent-greeting"
              placeholder="Saludo para conversaciones nuevas"
              value={form.greeting ?? ""}
              onChange={(e) => setForm({ ...form, greeting: e.target.value })}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={excedido}
              onClick={async () => {
                // 034 — Solo lo de esta tarjeta: el formulario guarda una copia
                // del perfil de cuando se abrió, y mandarla entera pisaría las
                // herramientas cambiadas después en la tarjeta del rol.
                const { name, tone, instructions, escalationRules, greeting } = form;
                const ok = await onSave({ name, tone, instructions, escalationRules, greeting });
                if (ok) {
                  setEditando(false);
                  setVista("editar");
                }
              }}
            >
              Guardar cambios
            </Button>
            <Button variant="ghost" onClick={cerrar}>
              Cancelar
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function KbSection({
  entries,
  kbSize,
  onChanged,
}: {
  entries: KbEntry[];
  kbSize: { chars: number; warnAt: number; warning: boolean } | null;
  onChanged: () => void;
}) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [block, setBlock] = useState("");
  const avisar = useAvisoGuardado();

  async function addQa() {
    if (!question.trim() || !answer.trim()) return;
    const res = await fetch("/api/kb", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "qa", question, answer }),
    }).catch(() => null);
    if (!res?.ok) {
      avisar("No se pudo agregar la pregunta", "error");
      return;
    }
    setQuestion("");
    setAnswer("");
    avisar("Pregunta agregada");
    onChanged();
  }

  async function addBlock() {
    if (!block.trim()) return;
    const res = await fetch("/api/kb", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "block", content: block }),
    }).catch(() => null);
    if (!res?.ok) {
      avisar("No se pudo agregar el texto", "error");
      return;
    }
    setBlock("");
    avisar("Texto agregado");
    onChanged();
  }

  async function remove(id: string) {
    const res = await fetch(`/api/kb/${id}`, { method: "DELETE" }).catch(() => null);
    avisar(res?.ok ? "Eliminado" : "No se pudo eliminar", res?.ok ? "ok" : "error");
    onChanged();
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Knowledge base</CardTitle>
            <CardDescription>
              La única fuente de verdad del agente: lo que no está aquí, no lo
              afirma.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/agent/conocimiento" className="text-xs text-brand-text underline underline-offset-2">
              Ver lo que lee el agente
            </Link>
            {kbSize && (
              <Badge variant={kbSize.warning ? "warning" : "secondary"}>
                {kbSize.chars.toLocaleString("es-MX")} caracteres
              </Badge>
            )}
          </div>
        </div>
        {kbSize?.warning && (
          <p className="text-xs text-warning-text">
            El conocimiento se acerca al límite del contexto del modelo (v1 lo
            inyecta completo en cada turno). Considera depurar entradas.
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2 rounded-md border p-3">
          <p className="text-sm font-medium">Nueva pregunta / respuesta</p>
          <Input
            placeholder="Pregunta (p. ej. ¿Hacen envíos?)"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <Textarea
            placeholder="Respuesta"
            rows={2}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
          />
          <Button
            size="sm"
            onClick={() => void addQa()}
            disabled={!question.trim() || !answer.trim()}
          >
            <Plus className="h-4 w-4" /> Agregar P/R
          </Button>
        </div>

        <div className="space-y-2 rounded-md border p-3">
          <p className="text-sm font-medium">Nuevo bloque de texto libre</p>
          <Textarea
            placeholder="Horarios, direcciones, políticas…"
            rows={3}
            value={block}
            onChange={(e) => setBlock(e.target.value)}
          />
          <Button size="sm" onClick={() => void addBlock()} disabled={!block.trim()}>
            <Plus className="h-4 w-4" /> Agregar bloque
          </Button>
        </div>

        <ul className="space-y-2">
          {entries.map((e) => (
            <li key={e.id} className="flex items-start gap-2 rounded-md border p-3">
              <div className="min-w-0 flex-1 text-sm">
                {e.kind === "qa" ? (
                  <>
                    <p className="font-medium">{e.question}</p>
                    <p className="mt-0.5 text-muted-foreground">{e.answer}</p>
                  </>
                ) : (
                  <p className="whitespace-pre-wrap text-muted-foreground">{e.content}</p>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Eliminar entrada"
                onClick={() => void remove(e.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
          {entries.length === 0 && (
            <p className="py-2 text-center text-xs text-muted-foreground">
              Sin entradas todavía: agrega lo que el agente debe saber.
            </p>
          )}
        </ul>
      </CardContent>
    </Card>
  );
}
