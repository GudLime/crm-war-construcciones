import { ContactsClient } from "@/components/contacts/contacts-client";
import { reservasEnabled } from "@/server/reservas/flag";

export const dynamic = "force-dynamic";

export default function ContactsPage() {
  return <ContactsClient reservas={reservasEnabled()} />;
}
