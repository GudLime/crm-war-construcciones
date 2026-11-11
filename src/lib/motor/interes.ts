import type { UnidadDeInteresDto } from "./dto";

/**
 * 0049 — Reglas puras del interés encadenado de la oportunidad (Edificio →
 * Ambientes → Unidades) y del Valor calculado. Las usan el servidor
 * (`server/motor/interes.ts`) y la página de la oportunidad.
 */

type InteresNucleo = { edificios: readonly string[]; ambientes: readonly number[] };

/** ¿La unidad entra en el interés de la oportunidad (edificios y ambientes)? */
export function coincideConInteres(
  u: Pick<UnidadDeInteresDto, "edificioId" | "ambientes">,
  interes: InteresNucleo
): boolean {
  if (interes.edificios.length && u.edificioId && !interes.edificios.includes(u.edificioId)) return false;
  if (interes.ambientes.length && u.ambientes !== null && !interes.ambientes.includes(u.ambientes)) return false;
  return true;
}

/**
 * Promedio de valores; con monedas distintas, solo los de la más repetida
 * (empate: la que aparece primero). Null si no hay ningún valor.
 */
export function promedioDeValores(
  unidades: readonly Pick<UnidadDeInteresDto, "valorCents" | "moneda">[]
): { valorCents: number; moneda: string | null } | null {
  const conValor: { valor: number; moneda: string }[] = [];
  for (const u of unidades) if (u.valorCents !== null) conValor.push({ valor: u.valorCents, moneda: u.moneda ?? "" });
  if (!conValor.length) return null;
  const cuenta = new Map<string, number>();
  for (const u of conValor) cuenta.set(u.moneda, (cuenta.get(u.moneda) ?? 0) + 1);
  let moneda = conValor[0]!.moneda;
  for (const [m, n] of cuenta) if (n > (cuenta.get(moneda) ?? 0)) moneda = m;
  const mismas = conValor.filter((u) => u.moneda === moneda);
  const total = mismas.reduce((s, u) => s + u.valor, 0);
  return { valorCents: Math.round(total / mismas.length), moneda: moneda || null };
}

/**
 * El Valor de una oportunidad según su interés: los elegidos con precio o, si
 * no hay, los ofrecidos de los ambientes de interés en sus edificios.
 */
export function valorDelInteres(
  elegidas: readonly UnidadDeInteresDto[],
  deLosEdificios: readonly UnidadDeInteresDto[],
  interes: InteresNucleo
): { valorCents: number; moneda: string | null } | null {
  const propio = promedioDeValores(elegidas);
  if (propio) return propio;
  if (!interes.ambientes.length || !interes.edificios.length) return null;
  return promedioDeValores(
    deLosEdificios.filter(
      (u) => u.ofrecida && u.ambientes !== null && coincideConInteres(u, interes)
    )
  );
}

/**
 * Las unidades que se pueden elegir: las ofrecidas que coinciden con los
 * ambientes de interés (sin ambientes, todas), más las ya elegidas aunque no
 * coincidan (para poder sacarlas).
 */
export function unidadesElegibles(
  unidades: readonly UnidadDeInteresDto[],
  elegidas: readonly string[],
  ambientes: readonly number[]
): UnidadDeInteresDto[] {
  return unidades.filter(
    (u) =>
      elegidas.includes(u.id) ||
      (u.ofrecida && (!ambientes.length || u.ambientes === null || ambientes.includes(u.ambientes)))
  );
}
