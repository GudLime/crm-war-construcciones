import { AsignacionAutomatica } from "@/components/settings/asignacion-automatica";
import { OficinaAjuste } from "@/components/settings/oficina-ajuste";
import { ResponsableDerivaciones } from "@/components/settings/responsable-derivaciones";
import { VendedoresAsignacion } from "@/components/settings/vendedores-asignacion";
import { VentasAjustesClient } from "@/components/settings/ventas-ajustes-client";

export const dynamic = "force-dynamic";

/**
 * War — Ventas: cuándo se cierra una oportunidad sin respuesta y cuándo se
 * reabre. 0051 — y a quién va cada lead de Meta según el edificio.
 */
export default function VentasSettingsPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <VentasAjustesClient />
      <AsignacionAutomatica />
      <VendedoresAsignacion />
      <ResponsableDerivaciones />
      <OficinaAjuste />
    </div>
  );
}
