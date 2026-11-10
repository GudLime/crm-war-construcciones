import { WHATSAPP_PATH } from "@/components/channel-badge";
import { cn } from "@/lib/utils";

/**
 * El logo de WhatsApp para los botones y tipos que llevan a un chat. Es el
 * glifo oficial (el mismo de `ChannelBadge`), no un dibujo propio: toma el
 * color del texto, así va blanco sobre el botón de marca y verde suelto.
 */
export function WhatsAppLogo({ className, color }: { className?: string; color?: "marca" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={cn("size-4 shrink-0", color === "marca" && "text-[#25d366]", className)}
      fill="currentColor"
    >
      <path d={WHATSAPP_PATH} />
    </svg>
  );
}
