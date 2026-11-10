"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArchivosEditor } from "@/components/motor/archivos";
import { useAvisoGuardado } from "@/components/ui/aviso-guardado";
import type { CampoDto, RegistroDto } from "@/lib/motor/dto";

/**
 * War — las fotos y el video de un edificio o una unidad, dentro de la página
 * de Edificios. Lee y guarda por el motor (`/api/objetos/<objeto>/<id>`): los
 * campos `galeria` y `video` de `clientes/war.json`. Cada cambio se guarda
 * solo (subir, sacar, reordenar), en fila para que no se pisen.
 */
export function MediosMotor({
  objeto,
  id,
  titulo = "Fotos y video",
  className,
}: {
  objeto: "edificio" | "unidad";
  id: string;
  titulo?: string;
  className?: string;
}) {
  const avisar = useAvisoGuardado();
  const [campos, setCampos] = useState<CampoDto[] | null>(null);
  const [valores, setValores] = useState<RegistroDto["valores"]>({});
  const [error, setError] = useState<string | null>(null);
  const fila = useRef<Promise<unknown>>(Promise.resolve());

  const cargar = useCallback(async () => {
    const r = await fetch(`/api/objetos/${objeto}/${encodeURIComponent(id)}`).catch(() => null);
    if (!r?.ok) {
      setCampos([]);
      return;
    }
    const d = (await r.json()) as { objeto: { campos: CampoDto[] }; registro: RegistroDto };
    setCampos(d.objeto.campos.filter((c) => c.editable && (c.tipo === "galeria" || c.tipo === "video")));
    setValores(d.registro.valores);
  }, [objeto, id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  function cambiar(clave: string, v: string | string[]) {
    setValores((prev) => ({ ...prev, [clave]: v }));
    const valor = Array.isArray(v) ? v : v || null;
    fila.current = fila.current.then(async () => {
      const r = await fetch(`/api/objetos/${objeto}/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ valores: { [clave]: valor } }),
      }).catch(() => null);
      if (!r?.ok) {
        const d = (await r?.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(d?.error?.message ?? "No se pudo guardar");
        await cargar();
        return;
      }
      setError(null);
      avisar("Guardado");
    });
  }

  if (!campos?.length) return null;
  return (
    <div className={className}>
      <p className="mb-1 text-sm font-semibold">{titulo}</p>
      <p className="mb-3 text-xs text-text-3">
        Si alguien le pide fotos al agente, le manda todas las fotos y el video. Se guarda solo.
      </p>
      <div className="space-y-4">
        {campos.map((c) => (
          <div key={c.clave}>
            <p className="mb-1 text-xs font-medium text-text-2">{c.nombre}</p>
            <ArchivosEditor
              campo={c}
              valor={valores[c.clave] as string | string[] | undefined}
              onChange={(v) => cambiar(c.clave, v)}
              objeto={objeto}
            />
          </div>
        ))}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
