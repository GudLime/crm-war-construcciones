/**
 * v4 — Lugar para que cada cliente sume lo suyo a la oportunidad en el
 * sidebar del chat (debajo del edificio y la tipología): por ejemplo, las
 * unidades que le interesan. El núcleo no pone nada.
 *
 * Un cliente REEMPLAZA este archivo en su repositorio (el núcleo no lo vuelve
 * a tocar, así no choca al traer cambios). Lo que guarde, lo guarda al tocarlo.
 */
export type PropsExtraOportunidadChat = {
  oportunidadId: string;
  /** Cambia cuando algo del chat se actualizó: para volver a leer. */
  refreshKey: number;
};

export const ExtraOportunidadChat: ((props: PropsExtraOportunidadChat) => React.ReactNode) | null = null;
