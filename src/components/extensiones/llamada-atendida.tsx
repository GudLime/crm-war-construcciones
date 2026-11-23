/**
 * Lugar para que cada cliente sume lo suyo a la ventana de «Atendió»
 * (`components/ventas/resultado-llamada.tsx`). El núcleo no pone nada: la
 * ventana pide solo el comentario.
 *
 * Un cliente REEMPLAZA este archivo en su repositorio (el núcleo no lo vuelve
 * a tocar, así no choca al traer cambios) y exporta su componente. El
 * componente recibe la oportunidad y `registrar`, para dejar la función que
 * guarda lo suyo; se llama al tocar «Guardar», antes de marcar la llamada.
 */
export type PropsExtraLlamada = {
  oportunidadId: string;
  registrar: (guardar: () => Promise<void>) => void;
};

export const ExtraLlamadaAtendida: ((props: PropsExtraLlamada) => React.ReactNode) | null = null;

/** Título de la ventana cuando el cliente suma su parte (si no, «¿Cómo fue la llamada?»). */
export const TITULO_LLAMADA_ATENDIDA: string | null = null;
