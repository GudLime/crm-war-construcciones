"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Mail, Phone } from "lucide-react";
import { AnuncioOrigen } from "@/components/anuncio-origen";
import { ContactAvatar } from "@/components/avatar";
import { FichaPanel } from "@/components/ficha-panel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAvisoGuardado } from "@/components/ui/aviso-guardado";
import { OportunidadPanel } from "@/components/ventas/oportunidad-panel";
import { DatosPersonales } from "@/components/contacts/datos-personales";
import { WhatsAppLogo } from "@/components/whatsapp-logo";
import type { AnuncioDto, ContactDto, FichaDto, FichaValue } from "@/lib/types";
import { formatearTelefono } from "@/lib/telefono-formato";
import { cn } from "@/lib/utils";
import { TIPOS_CONTACTO, etiqueta } from "@/lib/ventas";

/**
 * La ficha completa de un contacto, en su propia página (`/contacts/<id>`):
 * datos, de qué anuncio llegó, su oportunidad, la ficha que llena el agente
 * y las notas. Es lo que abre «Ver contacto completo» desde una oportunidad.
 * El chat sigue en la Bandeja.
 */

const TARJETA = "rounded-tarjeta border border-border bg-card shadow-tarjeta";

export function ContactoClient() {
  const { id } = useParams<{ id: string }>();
  const avisar = useAvisoGuardado();
  const [contacto, setContacto] = useState<ContactDto | null>(null);
  const [anuncio, setAnuncio] = useState<AnuncioDto | null>(null);
  const [noExiste, setNoExiste] = useState(false);
  const [notas, setNotas] = useState("");
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    const res = await fetch(`/api/contacts/${id}`).catch(() => null);
    if (res?.status === 404) {
      setNoExiste(true);
      return;
    }
    if (!res?.ok) return;
    const d = (await res.json()) as { contact: ContactDto; anuncio: AnuncioDto | null };
    setContacto(d.contact);
    setAnuncio(d.anuncio);
    setNotas(d.contact.notes ?? "");
  }, [id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function guardarFicha(patch: Record<string, FichaValue | null>) {
    await fetch(`/api/contacts/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ficha: patch }),
    }).catch(() => null);
    await cargar();
  }

  async function guardarNotas() {
    setGuardando(true);
    const res = await fetch(`/api/contacts/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ notes: notas }),
    }).catch(() => null);
    setGuardando(false);
    if (res?.ok) avisar();
  }

  if (noExiste) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-text-2">Ese contacto no existe (o se borró).</p>
        <Link href="/contacts" className="text-sm font-medium text-brand-ink hover:underline">
          Volver a Contactos
        </Link>
      </div>
    );
  }
  if (!contacto) return <p className="p-6 text-sm text-text-3">Cargando…</p>;

  const ficha: FichaDto = contacto.ficha ?? {};

  return (
    <div className="h-full overflow-y-auto bg-subtle">
      <div className="mx-auto max-w-[960px] space-y-4 px-3 py-4 sm:px-6 sm:py-6">
        <section className={cn(TARJETA, "p-4 sm:p-6")}>
          <div className="flex flex-wrap items-start gap-4">
            <button
              type="button"
              onClick={() => history.back()}
              aria-label="Volver"
              className="grid size-10 shrink-0 place-items-center rounded-full border border-border text-text-2 hover:bg-accent hover:text-foreground"
            >
              <ArrowLeft className="size-4" />
            </button>
            <ContactAvatar name={contacto.name} seed={contacto.id} size="md" />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[22px] font-bold tracking-tight">{contacto.name}</h1>
              <p className="text-[13px] text-text-3">
                {contacto.tipoContacto ? etiqueta(TIPOS_CONTACTO, contacto.tipoContacto) : "Sin clasificar"}
              </p>
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[13.5px]">
                <span className="flex items-center gap-2">
                  <Phone className="size-4 text-text-3" />
                  {contacto.phone ? formatearTelefono(contacto.phone) : "Sin teléfono"}
                </span>
                <span className="flex items-center gap-2">
                  <Mail className="size-4 text-text-3" />
                  {contacto.email ? (
                    <a href={`mailto:${contacto.email}`} className="hover:underline">
                      {contacto.email}
                    </a>
                  ) : (
                    "Sin correo"
                  )}
                </span>
              </div>
            </div>
            <Link
              href={`/inbox?contact=${contacto.id}`}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-brand px-4 text-sm font-semibold text-brand-fg hover:bg-brand-hover"
            >
              <WhatsAppLogo /> Ir al chat
            </Link>
          </div>
          {anuncio && (
            <div className="mt-4 max-w-md">
              <AnuncioOrigen anuncio={anuncio} />
            </div>
          )}
        </section>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-4">
            <section className={cn(TARJETA, "overflow-hidden")}>
              <OportunidadPanel contactId={contacto.id} />
            </section>
            {/* War — DNI, CUIL, nacimiento, dirección y parientes. */}
            <DatosPersonales contactId={contacto.id} className={cn(TARJETA, "mb-0 p-5")} />
          </div>
          <div className="space-y-4">
            <section className={cn(TARJETA, "overflow-hidden")}>
              <FichaPanel ficha={ficha} onSave={guardarFicha} />
            </section>
            <section className={cn(TARJETA, "p-4")}>
              <p className="kicker mb-2">Notas del contacto</p>
              <Textarea
                rows={5}
                placeholder="Lo fijo del cliente: dirección, cómo prefiere pagar…"
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
              />
              <Button size="sm" variant="secondary" className="mt-2" disabled={guardando} onClick={() => void guardarNotas()}>
                {guardando ? "Guardando…" : "Guardar notas"}
              </Button>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
