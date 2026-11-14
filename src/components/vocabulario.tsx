"use client";

import { createContext, useContext } from "react";
import { VOCABULARIO_POR_DEFECTO, type Vocabulario } from "@/lib/vocabulario";

/**
 * 071 — El vocabulario de la oportunidad para las pantallas. Lo arma el
 * servidor (`server/vocabulario.ts`) y lo baja el layout. Fuera del layout
 * (pruebas, páginas sueltas) vale el de siempre.
 */
const VocabularioContext = createContext<Vocabulario>(VOCABULARIO_POR_DEFECTO);

export function VocabularioProvider({
  value,
  children,
}: {
  value: Vocabulario;
  children: React.ReactNode;
}) {
  return <VocabularioContext.Provider value={value}>{children}</VocabularioContext.Provider>;
}

export function useVocabulario(): Vocabulario {
  return useContext(VocabularioContext);
}
