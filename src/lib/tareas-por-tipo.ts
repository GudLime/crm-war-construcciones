/**
 * Tareas por tipo en la oportunidad (Próximos pasos): los botones y el título
 * por defecto de cada uno. «Reunión» agrupa Visita (en el edificio) y Reunión
 * (en la oficina).
 */

export type BotonTipo = "mensaje" | "llamada" | "reunion" | "correo" | "tarea";

/** «Lucía Gómez» → «Lucía». */
const primerNombre = (n: string | null | undefined) => (n ?? "").trim().split(/\s+/)[0] ?? "";

/** El título por defecto según el tipo (editable). */
export function tituloPorDefecto(
  tipo: BotonTipo,
  modo: "visita" | "reunion",
  contacto: string | null,
  edificio: string | null
): string {
  const nombre = primerNombre(contacto);
  switch (tipo) {
    case "mensaje":
      return nombre ? `Escribirle a ${nombre}` : "Escribirle";
    case "llamada":
      return nombre ? `Llamar a ${nombre}` : "Llamar";
    case "reunion":
      return modo === "visita" ? (edificio ? `Visita a ${edificio}` : "Visita") : "Reunión en la oficina";
    case "correo":
      return "Mandarle el plan de pagos";
    case "tarea":
      return "Seguimiento";
  }
}

