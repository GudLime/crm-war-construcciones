/**
 * v6 — Agendar (o mover) una cita fuera del horario: el servidor responde 409
 * `fuera_de_horario` con la pregunta; si la persona confirma, se reintenta con
 * `forzarHorario`. La IA nunca pasa por acá: ella solo agenda dentro.
 */
export async function conConfirmacionDeHorario(
  hacer: (forzarHorario: boolean) => Promise<Response | null>
): Promise<Response | null | "cancelado"> {
  const r = await hacer(false);
  if (r?.status !== 409) return r;
  const d = (await r.clone().json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
  if (d?.error?.code !== "fuera_de_horario") return r;
  if (!window.confirm(d.error.message ?? "Está fuera del horario. ¿Agendar igual?")) return "cancelado";
  return hacer(true);
}
