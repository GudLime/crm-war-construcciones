/**
 * v3 — Lugar para que cada cliente sume lo suyo a la ventana de una cita de
 * tipo Visita (`components/ventas/ventana-tarea.tsx`, `VentanaCita`): por
 * ejemplo, la tipología y las unidades que va a ver, sincronizadas con la
 * oportunidad. El núcleo no pone nada.
 *
 * Un cliente REEMPLAZA este archivo en su repositorio (el núcleo no lo vuelve
 * a tocar, así no choca al traer cambios) y exporta su componente. Lo que
 * guarde, lo guarda al tocarlo (no hay «Guardar» que lo espere).
 */
export type PropsExtraCitaVisita = {
  oportunidadId: string;
  /** El edificio elegido en la cita (o null). */
  edificioId: string | null;
  disabled: boolean;
};

export const ExtraCitaVisita: ((props: PropsExtraCitaVisita) => React.ReactNode) | null = null;
