import { Fragment, type ReactNode } from "react";

/**
 * Vista previa de Markdown, chica y segura: arma elementos de React (nunca
 * HTML crudo), así un .md cargado no puede meter scripts en la página.
 *
 * Soporta lo que se usa para escribir instrucciones: títulos (#…######),
 * listas con - * o números, citas (>), bloques de código (```), separadores
 * (---), párrafos, **negrita**, *cursiva*, `código` y [enlaces](https://…).
 */

type Bloque =
  | { tipo: "titulo"; nivel: number; texto: string }
  | { tipo: "lista"; ordenada: boolean; items: string[] }
  | { tipo: "cita"; lineas: string[] }
  | { tipo: "codigo"; texto: string }
  | { tipo: "separador" }
  | { tipo: "parrafo"; lineas: string[] };

export function bloquesMarkdown(md: string): Bloque[] {
  const lineas = md.replace(/\r\n?/g, "\n").split("\n");
  const out: Bloque[] = [];
  let i = 0;
  while (i < lineas.length) {
    const linea = lineas[i]!;
    const t = linea.trim();
    if (!t) {
      i++;
      continue;
    }
    if (t.startsWith("```")) {
      const cuerpo: string[] = [];
      i++;
      while (i < lineas.length && !lineas[i]!.trim().startsWith("```")) cuerpo.push(lineas[i++]!);
      i++; // cierre
      out.push({ tipo: "codigo", texto: cuerpo.join("\n") });
      continue;
    }
    const titulo = t.match(/^(#{1,6})\s+(.*)$/);
    if (titulo) {
      out.push({ tipo: "titulo", nivel: titulo[1]!.length, texto: titulo[2]!.replace(/\s+#+$/, "") });
      i++;
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) {
      out.push({ tipo: "separador" });
      i++;
      continue;
    }
    if (t.startsWith(">")) {
      const cita: string[] = [];
      while (i < lineas.length && lineas[i]!.trim().startsWith(">")) {
        cita.push(lineas[i++]!.trim().replace(/^>\s?/, ""));
      }
      out.push({ tipo: "cita", lineas: cita });
      continue;
    }
    const esItem = (l: string) => /^\s*([-*+]|\d+[.)])\s+/.test(l);
    if (esItem(linea)) {
      const ordenada = /^\s*\d+[.)]\s+/.test(linea);
      const items: string[] = [];
      while (i < lineas.length && (esItem(lineas[i]!) || (/^\s{2,}\S/.test(lineas[i]!) && items.length))) {
        const l = lineas[i++]!;
        if (esItem(l)) items.push(l.replace(/^\s*([-*+]|\d+[.)])\s+/, ""));
        else items[items.length - 1] += ` ${l.trim()}`;
      }
      out.push({ tipo: "lista", ordenada, items });
      continue;
    }
    const parrafo: string[] = [];
    while (i < lineas.length) {
      const l = lineas[i]!;
      const lt = l.trim();
      if (!lt || /^(#{1,6})\s/.test(lt) || lt.startsWith("```") || lt.startsWith(">") || esItem(l)) break;
      parrafo.push(lt);
      i++;
    }
    out.push({ tipo: "parrafo", lineas: parrafo });
  }
  return out;
}

const INLINE = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\[[^\]]+\]\([^)\s]+\)|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;

function enLinea(texto: string, clave: string): ReactNode[] {
  const partes = texto.split(INLINE).filter((p) => p !== "");
  return partes.map((p, i) => {
    const k = `${clave}-${i}`;
    if ((p.startsWith("**") && p.endsWith("**")) || (p.startsWith("__") && p.endsWith("__"))) {
      return <strong key={k}>{p.slice(2, -2)}</strong>;
    }
    if (p.startsWith("`") && p.endsWith("`")) {
      return (
        <code key={k} className="rounded bg-secondary px-1 py-0.5 font-mono text-[0.9em]">
          {p.slice(1, -1)}
        </code>
      );
    }
    const enlace = p.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
    if (enlace) {
      const href = enlace[2]!;
      // Solo enlaces web o mail: nada de javascript: ni data:.
      if (/^(https?:|mailto:)/i.test(href)) {
        return (
          <a key={k} href={href} target="_blank" rel="noreferrer" className="text-brand-text underline underline-offset-2">
            {enlace[1]}
          </a>
        );
      }
      return <Fragment key={k}>{enlace[1]}</Fragment>;
    }
    if ((p.startsWith("*") && p.endsWith("*")) || (p.startsWith("_") && p.endsWith("_"))) {
      return <em key={k}>{p.slice(1, -1)}</em>;
    }
    return <Fragment key={k}>{p}</Fragment>;
  });
}

const TAM_TITULO = ["text-lg", "text-base", "text-[15px]", "text-sm", "text-sm", "text-sm"];

export function Markdown({ texto, className }: { texto: string; className?: string }) {
  const bloques = bloquesMarkdown(texto);
  if (bloques.length === 0) {
    return <p className="text-sm text-text-3">Sin instrucciones.</p>;
  }
  return (
    <div className={`space-y-2.5 text-sm leading-relaxed ${className ?? ""}`}>
      {bloques.map((b, i) => {
        const k = `b${i}`;
        switch (b.tipo) {
          case "titulo":
            return (
              <p key={k} className={`${TAM_TITULO[b.nivel - 1]} pt-1 font-semibold`}>
                {enLinea(b.texto, k)}
              </p>
            );
          case "lista": {
            const Tag = b.ordenada ? "ol" : "ul";
            return (
              <Tag key={k} className={`space-y-1 pl-5 ${b.ordenada ? "list-decimal" : "list-disc"}`}>
                {b.items.map((it, j) => (
                  <li key={`${k}-${j}`}>{enLinea(it, `${k}-${j}`)}</li>
                ))}
              </Tag>
            );
          }
          case "cita":
            return (
              <blockquote key={k} className="border-l-2 border-border-strong pl-3 text-text-2">
                {b.lineas.map((l, j) => (
                  <p key={`${k}-${j}`}>{enLinea(l, `${k}-${j}`)}</p>
                ))}
              </blockquote>
            );
          case "codigo":
            return (
              <pre key={k} className="overflow-x-auto rounded-md bg-secondary p-3 font-mono text-[12px]">
                {b.texto}
              </pre>
            );
          case "separador":
            return <hr key={k} className="border-border" />;
          default:
            return <p key={k}>{enLinea(b.lineas.join(" "), k)}</p>;
        }
      })}
    </div>
  );
}
