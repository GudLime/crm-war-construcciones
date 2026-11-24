"use client";

import { useCallback, useEffect, useState } from "react";
import { ImagePlus, Pencil, Plus, Trash2, Video, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  normalizarAtajo,
  TEXTO_MAX,
  TOPE_ADJUNTOS,
  type RespuestaRapida,
} from "@/lib/respuestas-rapidas";

/**
 * 0067 — Las fotos y los videos de una respuesta: miniaturas, quitar y sumar.
 * Con los límites de WhatsApp (foto 5 MB, video 16 MB); el CRM no achica nada.
 */
function Adjuntos({
  respuesta,
  puedeEditar,
  onCambio,
}: {
  respuesta: RespuestaRapida;
  puedeEditar: boolean;
  onCambio: () => void;
}) {
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const adjuntos = respuesta.adjuntos ?? [];
  if (!puedeEditar && adjuntos.length === 0) return null;

  async function subir(archivos: FileList | null) {
    if (!archivos?.length) return;
    setSubiendo(true);
    setError(null);
    for (const f of Array.from(archivos)) {
      const form = new FormData();
      form.set("file", f);
      const res = await fetch(`/api/quick-replies/${respuesta.id}/adjuntos`, { method: "POST", body: form }).catch(() => null);
      if (!res?.ok) {
        const d = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(`${f.name}: ${d?.error?.message ?? "no se pudo subir"}`);
        break;
      }
    }
    setSubiendo(false);
    onCambio();
  }

  async function quitar(adjuntoId: string) {
    const res = await fetch(`/api/quick-replies/${respuesta.id}/adjuntos/${adjuntoId}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) onCambio();
  }

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-2">
        {adjuntos.map((a) => {
          const url = `/api/quick-replies/${respuesta.id}/adjuntos/${a.id}`;
          return (
            <span key={a.id} className="relative block size-16 overflow-hidden rounded-md border bg-subtle" title={a.nombre}>
              {a.mime.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt={a.nombre} className="size-full object-cover" />
              ) : (
                <span className="grid size-full place-items-center text-text-3">
                  <Video className="size-5" />
                </span>
              )}
              {puedeEditar && (
                <button
                  type="button"
                  onClick={() => void quitar(a.id)}
                  aria-label={`Quitar ${a.nombre}`}
                  className="absolute right-0.5 top-0.5 grid size-5 place-items-center rounded-full bg-background/90 text-text-2 shadow hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              )}
            </span>
          );
        })}
        {puedeEditar && adjuntos.length < TOPE_ADJUNTOS && (
          <label
            className={`inline-flex h-16 cursor-pointer items-center gap-1.5 rounded-md border border-dashed px-3 text-[12px] text-text-2 hover:bg-accent ${subiendo ? "pointer-events-none opacity-60" : ""}`}
          >
            <ImagePlus className="size-4" />
            {subiendo ? "Subiendo…" : "Foto o video"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,video/mp4,video/3gpp"
              multiple
              className="sr-only"
              onChange={(e) => {
                void subir(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

/**
 * 049 — Ajustes → Respuestas rápidas. Las crea y edita quien configura; las
 * usa todo el equipo escribiendo `/atajo` en el compositor de la Bandeja.
 */
export function QuickRepliesClient() {
  const [lista, setLista] = useState<RespuestaRapida[] | null>(null);
  const [puedeEditar, setPuedeEditar] = useState(false);
  // `null` = cerrado; `""` = creando una nueva; un id = editando esa.
  const [editando, setEditando] = useState<string | null>(null);
  const [atajo, setAtajo] = useState("");
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    const res = await fetch("/api/quick-replies").catch(() => null);
    if (!res?.ok) return;
    const d = (await res.json()) as { respuestas: RespuestaRapida[]; puedeEditar: boolean };
    setLista(d.respuestas);
    setPuedeEditar(d.puedeEditar);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  function abrir(r: RespuestaRapida | null) {
    setEditando(r?.id ?? "");
    setAtajo(r?.atajo ?? "");
    setTexto(r?.texto ?? "");
    setError(null);
  }

  async function guardar() {
    setGuardando(true);
    setError(null);
    const nueva = editando === "";
    const res = await fetch(nueva ? "/api/quick-replies" : `/api/quick-replies/${editando}`, {
      method: nueva ? "POST" : "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ atajo, texto }),
    }).catch(() => null);
    setGuardando(false);
    if (!res?.ok) {
      const d = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(d?.error?.message ?? "No se pudo guardar. Revisa la conexión.");
      return;
    }
    setEditando(null);
    void cargar();
  }

  async function borrar(r: RespuestaRapida) {
    if (!window.confirm(`¿Borrar la respuesta /${r.atajo}?`)) return;
    const res = await fetch(`/api/quick-replies/${r.id}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) void cargar();
  }

  const atajoFinal = normalizarAtajo(atajo);

  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Respuestas rápidas</CardTitle>
          <CardDescription>
            Lo que escribes treinta veces al día. En la Bandeja, escribe{" "}
            <span className="font-mono">/</span> y el atajo (por ejemplo{" "}
            <span className="font-mono">/horario</span>) y elige la respuesta: se
            pone en la caja y la revisas antes de mandarla.{" "}
            <span className="font-mono">{"{nombre}"}</span> se cambia por el primer
            nombre del cliente. Solo dentro de la ventana de 24 h: para reabrirla
            están las plantillas. Cada respuesta puede llevar fotos y videos
            (foto hasta 5 MB, video mp4 hasta 16 MB): salen junto con el texto.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {lista === null ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : lista.length === 0 && editando === null ? (
            <p className="text-sm text-text-2">Aún no hay respuestas rápidas.</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {lista.map((r) => (
                <li key={r.id} className="flex items-start gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[13px] font-semibold">/{r.atajo}</p>
                    <p className="whitespace-pre-wrap break-words text-sm text-text-2">{r.texto}</p>
                    <Adjuntos respuesta={r} puedeEditar={puedeEditar} onCambio={() => void cargar()} />
                  </div>
                  {puedeEditar && (
                    <span className="flex shrink-0 items-center gap-1">
                      <Button variant="ghost" size="icon" aria-label={`Editar /${r.atajo}`} onClick={() => abrir(r)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label={`Borrar /${r.atajo}`} onClick={() => void borrar(r)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {puedeEditar && editando === null && (
            <Button variant="outline" size="sm" onClick={() => abrir(null)}>
              <Plus className="h-4 w-4" /> Nueva respuesta
            </Button>
          )}

          {editando !== null && (
            <div className="space-y-3 rounded-md border bg-subtle p-3" data-testid="form-respuesta">
              <div className="space-y-1.5">
                <Label htmlFor="qr-atajo">Atajo</Label>
                <Input
                  id="qr-atajo"
                  value={atajo}
                  onChange={(e) => setAtajo(e.target.value)}
                  placeholder="horario"
                  maxLength={40}
                  autoFocus
                />
                <p className="text-xs text-text-3">
                  Se escribe como <span className="font-mono">/{atajoFinal || "atajo"}</span>: letras,
                  números, - o _, sin espacios.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="qr-texto">Texto</Label>
                <Textarea
                  id="qr-texto"
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  rows={4}
                  maxLength={TEXTO_MAX}
                  placeholder="Abrimos de lunes a sábado de 8:00 a 19:00."
                />
              </div>
              {error && (
                <p role="alert" className="text-xs text-destructive">
                  {error}
                </p>
              )}
              <div className="flex gap-2">
                <Button size="sm" disabled={guardando || !atajoFinal || !texto.trim()} onClick={() => void guardar()}>
                  {guardando ? "Guardando…" : "Guardar"}
                </Button>
                <Button size="sm" variant="outline" disabled={guardando} onClick={() => setEditando(null)}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
