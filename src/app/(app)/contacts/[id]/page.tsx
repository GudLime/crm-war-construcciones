import { ContactoClient } from "@/components/contacts/contacto-client";
import { reservasEnabled } from "@/server/reservas/flag";

export const dynamic = "force-dynamic";

/** La ficha completa de un contacto. */
export default function ContactoPage() {
  return <ContactoClient reservas={reservasEnabled()} />;
}
