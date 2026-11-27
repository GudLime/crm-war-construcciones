/**
 * v7 — De dónde llegó un contacto, leído en su PRIMER mensaje, sin IA.
 *
 * Los portales mandan un mensaje armado con el link de la publicación
 * («…que vi en Zonaprop. https://www.zonaprop.com.ar/…»). La regla es
 * abierta: alcanza con que el texto nombre al portal o traiga un link suyo,
 * sin depender de la frase exacta.
 *
 * Y del link (o del texto) sale el edificio cuando trae su nombre o su
 * dirección: `…-olazabal-2649-…` → Olazábal.
 *
 * PURO: sin BD. Se prueba solo (tests/unit/origen-por-mensaje.test.ts).
 */

type Portal = { origen: string; palabras: RegExp; dominio: RegExp };

/** El nombre del origen tiene que existir en Configuración → Orígenes. */
const PORTALES: Portal[] = [
  { origen: "Zonaprop", palabras: /\bzona\s?prop\b/, dominio: /(^|[/.])zonaprop\.com/ },
  { origen: "Mercado Libre", palabras: /\bmercado\s?libre\b/, dominio: /(^|[/.])mercadoli[bv]re\.com/ },
  { origen: "Argenprop", palabras: /\bargenprop\b/, dominio: /(^|[/.])argenprop\.com/ },
  { origen: "Properati", palabras: /\bproperati\b/, dominio: /(^|[/.])properati\.com/ },
];

/** Minúsculas, sin acentos, todo lo que no es letra o número → espacio. */
export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** El portal del mensaje, o null. */
export function portalDelMensaje(texto: string | null | undefined): string | null {
  if (!texto) return null;
  const bajo = texto.toLowerCase();
  const plano = normalizar(texto);
  for (const p of PORTALES) {
    if (p.dominio.test(bajo) || p.palabras.test(plano)) return p.origen;
  }
  return null;
}

/**
 * El edificio que nombra el mensaje (por su nombre o su dirección), o null si
 * no nombra ninguno o nombra más de uno. Las palabras sueltas cortas no
 * cuentan: «del» o «san» solas no son un edificio.
 */
export function edificioDelMensaje<E extends { id: string; nombre: string; direccion?: string | null }>(
  texto: string | null | undefined,
  edificios: readonly E[]
): E | null {
  if (!texto) return null;
  const plano = ` ${normalizar(texto)} `;
  const aparece = (frase: string | null | undefined) => {
    const f = frase ? normalizar(frase) : "";
    if (f.length < 4) return false;
    return plano.includes(` ${f} `);
  };
  const encontrados = edificios.filter((e) => aparece(e.nombre) || aparece(e.direccion));
  return encontrados.length === 1 ? encontrados[0]! : null;
}
