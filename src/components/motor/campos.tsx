"use client";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { CampoDto, RegistroDto } from "@/lib/motor/dto";
import { aNumero } from "@/lib/motor/valores";
import { plata } from "@/components/ventas/ui";

/**
 * Motor — cómo se ve y cómo se edita cada tipo de campo.
 *
 * El formulario guarda texto tal como se escribe; recién al guardar se arma lo
 * que va a la API (`aEntrada`). La moneda se escribe en unidades («120000») y
 * viaja en centavos, como en el resto del CRM.
 */

export type ValorForm = string | boolean | string[];
export type Formulario = Record<string, ValorForm>;

export function valorVisible(campo: CampoDto, valor: RegistroDto["valores"][string], moneda: string): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  switch (campo.tipo) {
    case "moneda":
      return plata(typeof valor === "number" ? valor : aNumero(valor), null, moneda);
    case "numero":
    case "calculado":
      return typeof valor === "number" ? valor.toLocaleString("es-AR") : String(valor);
    case "booleano":
      return valor ? "Sí" : "No";
    case "fecha": {
      const d = new Date(String(valor));
      return Number.isNaN(d.getTime()) ? String(valor) : new Intl.DateTimeFormat("es-AR").format(d);
    }
    case "seleccion":
      return campo.opciones?.find((o) => o.valor === valor)?.nombre ?? String(valor);
    case "seleccion_multiple":
      return (Array.isArray(valor) ? valor : [String(valor)])
        .map((v) => campo.opciones?.find((o) => o.valor === v)?.nombre ?? v)
        .join(", ");
    default:
      return String(valor);
  }
}

/** Del registro al formulario. */
export function desdeRegistro(campos: CampoDto[], valores: RegistroDto["valores"] | null): Formulario {
  const form: Formulario = {};
  for (const c of campos) {
    if (!c.editable) continue;
    const v = valores?.[c.clave] ?? null;
    if (c.tipo === "booleano") form[c.clave] = v === true;
    else if (c.tipo === "seleccion_multiple") form[c.clave] = Array.isArray(v) ? v : [];
    else if (c.tipo === "moneda") form[c.clave] = typeof v === "number" ? String(v / 100) : "";
    else if (c.tipo === "fecha") form[c.clave] = v ? String(v).slice(0, 10) : "";
    else form[c.clave] = v === null ? "" : String(v);
  }
  return form;
}

/** Del formulario a lo que recibe la API. Solo los campos editables. */
export function aEntrada(campos: CampoDto[], form: Formulario): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const c of campos) {
    if (!c.editable || !(c.clave in form)) continue;
    const v = form[c.clave];
    if (c.tipo === "moneda") {
      const n = typeof v === "string" ? aNumero(v) : null;
      out[c.clave] = n === null ? (v === "" ? null : v) : Math.round(n * 100);
    } else if (typeof v === "string") out[c.clave] = v.trim() === "" ? null : v;
    else out[c.clave] = v;
  }
  return out;
}

export function CampoEditor({
  campo,
  valor,
  onChange,
}: {
  campo: CampoDto;
  valor: ValorForm | undefined;
  onChange: (v: ValorForm) => void;
}) {
  const texto = typeof valor === "string" ? valor : "";
  switch (campo.tipo) {
    case "booleano":
      return <Switch checked={valor === true} onCheckedChange={(v) => onChange(v)} label={campo.nombre} />;
    case "seleccion":
      return (
        <Select value={texto} onValueChange={onChange} placeholder="Elegí una opción" aria-label={campo.nombre}>
          {!campo.obligatorio && <option value="">Sin dato</option>}
          {(campo.opciones ?? []).map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.nombre}
            </option>
          ))}
        </Select>
      );
    case "seleccion_multiple": {
      const elegidos = Array.isArray(valor) ? valor : [];
      return (
        <div className="flex flex-wrap gap-2">
          {(campo.opciones ?? []).map((o) => {
            const activo = elegidos.includes(o.valor);
            return (
              <button
                key={o.valor}
                type="button"
                aria-pressed={activo}
                onClick={() => onChange(activo ? elegidos.filter((x) => x !== o.valor) : [...elegidos, o.valor])}
                className={
                  activo
                    ? "rounded-full border border-brand bg-brand-soft px-2.5 py-1 text-xs text-brand-text"
                    : "rounded-full border px-2.5 py-1 text-xs text-text-2 hover:bg-accent"
                }
              >
                {o.nombre}
              </button>
            );
          })}
        </div>
      );
    }
    case "fecha":
      return <Input type="date" value={texto} onChange={(e) => onChange(e.target.value)} required={campo.obligatorio} />;
    case "numero":
    case "moneda":
      return (
        <Input
          inputMode="decimal"
          value={texto}
          onChange={(e) => onChange(e.target.value)}
          required={campo.obligatorio}
          placeholder={campo.tipo === "moneda" ? "0" : undefined}
        />
      );
    case "enlace":
    case "imagen":
      return (
        <Input
          type="url"
          value={texto}
          onChange={(e) => onChange(e.target.value)}
          required={campo.obligatorio}
          placeholder="https://"
        />
      );
    default:
      return (
        <Input value={texto} onChange={(e) => onChange(e.target.value)} required={campo.obligatorio} maxLength={400} />
      );
  }
}
