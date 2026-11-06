"use client";

import { useEffect, useState } from "react";
import { emailOpcionalValido } from "@/lib/email";
import {
  explicarMotivoTelefono,
  formatearTelefono,
  normalizarTelefono,
} from "@/lib/telefono";
import { TIPOS_CONTACTO, type TipoContacto } from "@/lib/ventas";
import type { SourceValue, StageDto } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";

const SOURCES: { value: SourceValue; label: string }[] = [
  { value: "referido", label: "Referido" },
  { value: "organico", label: "Contenido orgánico" },
  { value: "conocido", label: "Conocido" },
  { value: "anuncio", label: "Anuncio" },
  { value: "otro", label: "Otro" },
];

/**
 * Alta manual de un prospecto que no llegó por WhatsApp.
 * El teléfono es obligatorio porque ES la identidad en WhatsApp: sin él, el
 * contacto no podría recibir ni mandar nada, y sería una ficha muerta.
 */
export function NewContactDialog({
  onClose,
  onCreated,
  onOpenExisting,
}: {
  onClose: () => void;
  onCreated: () => void;
  /** Duplicado: en vez de un error seco, se ofrece ir a quien ya existe. */
  onOpenExisting: (contactId: string) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  // 068 — Alta manual: casi siempre es un prospecto, por eso arranca en Lead.
  const [tipoContacto, setTipoContacto] = useState<TipoContacto | "">("lead");
  const [source, setSource] = useState<SourceValue>("referido");
  const [notes, setNotes] = useState("");
  const [stages, setStages] = useState<StageDto[]>([]);
  const [stageId, setStageId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicado, setDuplicado] = useState<{ id: string; name: string } | null>(
    null
  );

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/pipeline/stages").catch(() => null);
      if (!res?.ok) return;
      const data = (await res.json()) as { stages: StageDto[] };
      const abiertas = data.stages.filter((s) => s.kind === "open");
      setStages(abiertas);
      setStageId(abiertas[0]?.id ?? "");
    })();
  }, []);

  async function guardar() {
    setSaving(true);
    setError(null);
    setDuplicado(null);
    const res = await fetch("/api/contacts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        phone: telefono.ok ? telefono.telefono : phone.trim(),
        email: email.trim() || undefined,
        tipoContacto: tipoContacto || undefined,
        source,
        notes: notes.trim() || undefined,
        stageId: stageId || undefined,
      }),
    }).catch(() => null);
    setSaving(false);

    if (!res) {
      setError("No se pudo guardar. Revisa tu conexión.");
      return;
    }
    const data = (await res.json().catch(() => null)) as {
      error?: { message?: string };
      contact?: { id: string; name: string };
    } | null;

    if (res.status === 409 && data?.contact) {
      setDuplicado({ id: data.contact.id, name: data.contact.name });
      return;
    }
    if (!res.ok) {
      setError(data?.error?.message ?? "No se pudo guardar el contacto");
      return;
    }
    onCreated();
  }

  // War: el número se normaliza igual que en el servidor (`lib/telefono.ts`).
  // Sin `+` se lee como argentino y el celular queda con su 9.
  const telefono = normalizarTelefono(phone);
  const extranjero = phone.trim().startsWith("+");
  // El correo es opcional; si se escribió, tiene que tener forma de correo.
  const emailValido = emailOpcionalValido(email);
  const listo = name.trim().length > 0 && telefono.ok && emailValido;

  /** Un número completo pegado (`+54 9 11…`, `5491151191447`) se acomoda solo. */
  function cambiarTelefono(valor: string) {
    const res = normalizarTelefono(valor);
    if (res.ok && res.telefono.startsWith("549") && /^\s*(\+|00|54)/.test(valor)) {
      setPhone(res.telefono.slice(3));
      return;
    }
    setPhone(valor);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Nuevo contacto"
        className="w-full max-w-md rounded-lg border bg-popover p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-1 font-semibold">Nuevo contacto</h3>
        <p className="mb-4 text-xs text-text-3">
          Para prospectos que no llegaron por WhatsApp: referidos, gente que te
          escribió por otra red, conocidos.
        </p>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="nc-name">
              Nombre
            </label>
            <Input
              id="nc-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ferretería La Central"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="nc-phone">
              Celular
            </label>
            <div className="flex items-center gap-2">
              {!extranjero && (
                <span className="shrink-0 rounded-md border bg-secondary/40 px-2.5 py-2 text-sm tabular-nums text-text-2">
                  +54 9
                </span>
              )}
              <Input
                id="nc-phone"
                value={phone}
                inputMode="tel"
                onChange={(e) => cambiarTelefono(e.target.value)}
                placeholder="11 5119-1447"
              />
            </div>
            <p className="text-[11px] text-text-3">
              {phone.trim() === "" ? (
                <>
                  Código de área sin 0 y número sin 15. Para otro país, empezá con{" "}
                  <strong>+</strong> y su código.
                </>
              ) : telefono.ok ? (
                <>
                  Se guarda como <strong>{formatearTelefono(telefono.telefono)}</strong>
                </>
              ) : (
                <span className="text-danger-text">{explicarMotivoTelefono(telefono.motivo)}</span>
              )}
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="nc-email">
              Correo electrónico (opcional)
            </label>
            <Input
              id="nc-email"
              type="email"
              inputMode="email"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nombre@empresa.com"
              aria-invalid={!emailValido}
            />
            {!emailValido && (
              <p className="text-[11px] text-danger-text">
                Revisá el correo: tiene que ser del tipo nombre@dominio.com
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="nc-tipo">
              Tipo de contacto
            </label>
            <Select
              id="nc-tipo"
              value={tipoContacto}
              onValueChange={(valor) => setTipoContacto(valor as TipoContacto | "")}
              className="w-full"
            >
              <option value="">Sin clasificar</option>
              {TIPOS_CONTACTO.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
            <p className="text-[11px] text-text-3">
              Como Lead se le abre una oportunidad. Comprador, Inmobiliaria,
              Proveedor y Propio quedan fuera de la venta y sin IA.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="nc-source">
                ¿De dónde salió?
              </label>
              <Select
                id="nc-source"
                value={source}
                onValueChange={(valor) => setSource(valor as SourceValue)}
                className="w-full"
              >
                {SOURCES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="nc-stage">
                Etapa inicial
              </label>
              <Select
                id="nc-stage"
                value={stageId}
                onValueChange={(valor) => setStageId(valor)}
                className="w-full"
              >
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="nc-notes">
              Notas (opcional)
            </label>
            <Textarea
              id="nc-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Me lo pasó Juan; tiene taller de motos…"
            />
          </div>
        </div>

        {duplicado && (
          <div className="mt-3 rounded-md border border-warning-soft bg-warning-tint px-3 py-2.5">
            <p className="text-[13px] text-warning-text">
              Ese teléfono ya es de <strong>{duplicado.name}</strong>. No se creó
              un duplicado.
            </p>
            <Button
              size="sm"
              variant="secondary"
              className="mt-2"
              onClick={() => onOpenExisting(duplicado.id)}
            >
              Abrir su conversación
            </Button>
          </div>
        )}
        {error && <p className="mt-3 text-xs text-danger-text">{error}</p>}
        {stages.length === 0 && (
          <p className="mt-3 text-xs text-warning-text">
            Tu embudo no tiene etapas abiertas. Crea una en el Pipeline antes de
            capturar contactos.
          </p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={!listo || saving || stages.length === 0}
            onClick={() => void guardar()}
          >
            {saving ? "Guardando…" : "Crear contacto"}
          </Button>
        </div>
      </div>
    </div>
  );
}
