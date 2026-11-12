/**
 * Quién puede CONFIGURAR la instancia: conectar el número, pegar la llave de
 * IA, escribir el agente, encenderlo. En la raíz son dos roles: el `owner`
 * que crea la organización en el primer registro y el `admin` que Better Auth
 * conoce (hoy nadie lo asigna, pero es un rol de configuración y no de
 * operación). Un `member` del equipo atiende la Bandeja: no puede hacer
 * ninguno de los pasos de la guía de inicio, así que no se le enseña.
 *
 * Vive en `lib/` porque lo consultan los dos lados: el menú (cliente) y la
 * redirección de la raíz (servidor).
 */
export function canConfigure(role: string | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

/**
 * Visibilidad por rol: el admin (`owner` o `admin`) ve y edita todo; el
 * operador (`member`) ve solo lo que tiene asignado — sus oportunidades, los
 * chats y contactos de esas oportunidades, sus tareas y sus Resultados — y,
 * de todos, solo en lectura: las visitas (Agenda y tareas de tipo Visita) y
 * los edificios. Ver `server/acceso.ts`.
 */
export function esAdmin(role: string | null | undefined): boolean {
  return canConfigure(role);
}
