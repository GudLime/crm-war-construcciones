"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, FileText, ImagePlus, Loader2, Trash2, Upload, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CampoDto } from "@/lib/motor/dto";

/**
 * Motor — campos de archivos: galería de fotos (JPG), video (MP4) y documento
 * (PDF). Las fotos se achican en el navegador antes de subir (lado mayor 1600
 * px, JPG): pesan poco en el servidor y en WhatsApp.
 */

const LADO_MAX = 1600;
const MB = 1024 * 1024;
const urlDe = (id: string) => `/api/motor-archivos/${encodeURIComponent(id)}`;

/** Cualquier imagen → JPG achicado. Si el navegador no puede, sube el original (el servidor exige JPG). */
export async function comprimirJpg(archivo: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(archivo);
    const escala = Math.min(1, LADO_MAX / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * escala);
    canvas.height = Math.round(bmp.height * escala);
    const ctx = canvas.getContext("2d");
    if (!ctx) return archivo;
    ctx.fillStyle = "#fff"; // un PNG con transparencia no queda negro
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    for (const calidad of [0.82, 0.7, 0.55]) {
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", calidad));
      if (blob && (blob.size <= 1.5 * MB || calidad === 0.55)) return blob;
    }
  } catch {
    // sigue con el original
  }
  return archivo;
}

async function subir(
  blob: Blob,
  nombre: string,
  tipo: "imagen" | "video" | "documento",
  objeto?: string,
  campo?: string
): Promise<string> {
  const form = new FormData();
  form.append("archivo", blob, nombre);
  form.append("tipo", tipo);
  if (objeto && campo) {
    form.append("objeto", objeto);
    form.append("campo", campo);
  }
  const r = await fetch("/api/motor-archivos", { method: "POST", body: form }).catch(() => null);
  const d = (await r?.json().catch(() => null)) as { archivo?: { id: string }; error?: { message?: string } } | null;
  if (!r?.ok || !d?.archivo) throw new Error(d?.error?.message ?? "No se pudo subir el archivo");
  return d.archivo.id;
}

export function ArchivosEditor({
  campo,
  valor,
  onChange,
  objeto,
}: {
  campo: CampoDto;
  valor: string | string[] | boolean | undefined;
  onChange: (v: string | string[]) => void;
  objeto?: string;
}) {
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (campo.tipo === "galeria") {
    const fotos = Array.isArray(valor) ? valor : [];
    const max = campo.limites?.maxArchivos ?? 6;
    const agregar = async (lista: FileList | null) => {
      if (!lista?.length) return;
      setError(null);
      setSubiendo(true);
      const nuevas = [...fotos];
      try {
        for (const f of Array.from(lista).slice(0, max - fotos.length)) {
          const blob = await comprimirJpg(f);
          nuevas.push(await subir(blob, f.name.replace(/\.\w+$/, "") + ".jpg", "imagen", objeto, campo.clave));
          onChange([...nuevas]);
        }
        if (lista.length > max - fotos.length) setError(`Entran hasta ${max} fotos`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo subir");
      } finally {
        setSubiendo(false);
      }
    };
    const mover = (i: number, d: -1 | 1) => {
      const j = i + d;
      if (j < 0 || j >= fotos.length) return;
      const n = [...fotos];
      [n[i], n[j]] = [n[j]!, n[i]!];
      onChange(n);
    };
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {fotos.map((id, i) => (
            <div key={id} className="group relative aspect-square overflow-hidden rounded-md border bg-subtle">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={urlDe(id)} alt={`Foto ${i + 1}`} className="h-full w-full object-cover" loading="lazy" />
              <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/50 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                <button type="button" aria-label="Mover a la izquierda" onClick={() => mover(i, -1)} className="rounded p-0.5 hover:bg-white/20">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label={`Sacar la foto ${i + 1}`}
                  onClick={() => onChange(fotos.filter((x) => x !== id))}
                  className="rounded p-0.5 hover:bg-white/20"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                <button type="button" aria-label="Mover a la derecha" onClick={() => mover(i, 1)} className="rounded p-0.5 hover:bg-white/20">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
          {fotos.length < max && (
            <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed text-xs text-text-3 hover:bg-accent">
              {subiendo ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
              {subiendo ? "Subiendo…" : "Agregar"}
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                disabled={subiendo}
                onChange={(e) => {
                  void agregar(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          )}
        </div>
        <p className="text-[11px] text-text-3">
          {fotos.length} de {max} fotos · se guardan en JPG, achicadas
        </p>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  const esVideo = campo.tipo === "video";
  const actual = typeof valor === "string" && valor ? valor : null;
  const maxMb = campo.limites?.maxMb ?? (esVideo ? 16 : 10);
  const elegir = async (f: File | undefined) => {
    if (!f) return;
    setError(null);
    if (f.size > maxMb * MB) {
      setError(`Es muy pesado: el máximo es ${maxMb} MB${esVideo ? ". Achicalo antes de subirlo (por ejemplo, 720p)." : ""}`);
      return;
    }
    setSubiendo(true);
    try {
      onChange(await subir(f, f.name, esVideo ? "video" : "documento", objeto, campo.clave));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo subir");
    } finally {
      setSubiendo(false);
    }
  };
  return (
    <div className="space-y-2">
      {actual && <ArchivoUnico tipo={campo.tipo} id={actual} />}
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs hover:bg-accent">
          {subiendo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          {subiendo ? "Subiendo…" : actual ? "Reemplazar" : esVideo ? "Subir video (MP4)" : "Subir PDF"}
          <input
            type="file"
            accept={esVideo ? "video/mp4" : "application/pdf"}
            className="hidden"
            disabled={subiendo}
            onChange={(e) => {
              void elegir(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        {actual && (
          <Button type="button" size="sm" variant="ghost" onClick={() => onChange("")}>
            <Trash2 className="h-3.5 w-3.5" /> Sacar
          </Button>
        )}
        <span className="text-[11px] text-text-3">Hasta {maxMb} MB</span>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function ArchivoUnico({ tipo, id }: { tipo: CampoDto["tipo"]; id: string }) {
  if (tipo === "video") {
    return <video src={urlDe(id)} controls preload="metadata" className="max-h-64 w-full max-w-md rounded-md border bg-black" />;
  }
  return (
    <a href={urlDe(id)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-brand-text underline">
      <FileText className="h-4 w-4" /> Ver PDF
    </a>
  );
}

/** Para leer (la ficha del registro). */
export function ArchivosVista({ campo, valor }: { campo: CampoDto; valor: unknown }) {
  if (campo.tipo === "galeria") {
    const fotos = Array.isArray(valor) ? valor.map(String) : [];
    if (!fotos.length) return <span className="text-text-3">—</span>;
    return (
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {fotos.map((id, i) => (
          <a key={id} href={urlDe(id)} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-md border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={urlDe(id)} alt={`${campo.nombre} ${i + 1}`} className="h-full w-full object-cover" loading="lazy" />
          </a>
        ))}
      </div>
    );
  }
  if (typeof valor !== "string" || !valor) return <span className="text-text-3">—</span>;
  return <ArchivoUnico tipo={campo.tipo} id={valor} />;
}

/** Ícono corto para la tabla. */
export function iconoArchivo(tipo: CampoDto["tipo"]) {
  return tipo === "video" ? Video : tipo === "documento" ? FileText : ImagePlus;
}
