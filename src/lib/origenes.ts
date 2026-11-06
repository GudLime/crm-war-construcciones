import {
  Briefcase,
  Building,
  Building2,
  Facebook,
  Flag,
  Footprints,
  Gift,
  Globe,
  Handshake,
  Heart,
  House,
  Instagram,
  KeyRound,
  Link,
  Linkedin,
  Mail,
  MapPin,
  Megaphone,
  MessageCircle,
  Monitor,
  Music,
  Newspaper,
  Phone,
  QrCode,
  Radio,
  Search,
  ShoppingBag,
  ShoppingCart,
  Signpost,
  Smartphone,
  Sparkles,
  Star,
  Store,
  Tag,
  Target,
  Tv,
  UserPlus,
  Users,
  Video,
  Youtube,
  type LucideIcon,
} from "lucide-react";

/**
 * War — Orígenes de las oportunidades, configurables en Ajustes → Orígenes.
 * Cada uno tiene nombre e ícono. El nombre es lo que se guarda en
 * `oportunidad.origen` y lo que manda Make en `origen`.
 *
 * Vive en `lib/` (sin base) para que la pantalla, la API y las pruebas usen
 * el mismo catálogo.
 */

export type OrigenDto = {
  id: string;
  nombre: string;
  /** Clave de `ICONOS_ORIGEN`. Una clave que ya no existe se ve con `tag`. */
  icono: string;
  orden: number;
  /** URL de la imagen propia (con `?v=` para la caché), o null: se usa el ícono. */
  imagen: string | null;
  /** Cuántas oportunidades lo tienen (solo en Ajustes). */
  usos?: number;
};

/** Los íconos que se pueden elegir. La clave es lo que se guarda en la base. */
export const ICONOS_ORIGEN: readonly { clave: string; label: string; Icono: LucideIcon }[] = [
  { clave: "tag", label: "Etiqueta", Icono: Tag },
  { clave: "target", label: "Objetivo", Icono: Target },
  { clave: "megaphone", label: "Megáfono", Icono: Megaphone },
  { clave: "facebook", label: "Facebook", Icono: Facebook },
  { clave: "instagram", label: "Instagram", Icono: Instagram },
  { clave: "music", label: "TikTok / música", Icono: Music },
  { clave: "youtube", label: "YouTube", Icono: Youtube },
  { clave: "linkedin", label: "LinkedIn", Icono: Linkedin },
  { clave: "search", label: "Buscador", Icono: Search },
  { clave: "globe", label: "Web", Icono: Globe },
  { clave: "link", label: "Enlace", Icono: Link },
  { clave: "mail", label: "Mail", Icono: Mail },
  { clave: "newspaper", label: "Diario / newsletter", Icono: Newspaper },
  { clave: "message-circle", label: "Mensaje", Icono: MessageCircle },
  { clave: "phone", label: "Teléfono", Icono: Phone },
  { clave: "smartphone", label: "Celular", Icono: Smartphone },
  { clave: "building", label: "Edificio", Icono: Building },
  { clave: "building-2", label: "Edificios", Icono: Building2 },
  { clave: "house", label: "Casa", Icono: House },
  { clave: "key-round", label: "Llave", Icono: KeyRound },
  { clave: "store", label: "Local / showroom", Icono: Store },
  { clave: "signpost", label: "Cartel", Icono: Signpost },
  { clave: "map-pin", label: "Ubicación", Icono: MapPin },
  { clave: "footprints", label: "Pasó por la obra", Icono: Footprints },
  { clave: "shopping-bag", label: "Bolsa", Icono: ShoppingBag },
  { clave: "shopping-cart", label: "Carrito", Icono: ShoppingCart },
  { clave: "handshake", label: "Apretón de manos", Icono: Handshake },
  { clave: "users", label: "Personas", Icono: Users },
  { clave: "user-plus", label: "Referido", Icono: UserPlus },
  { clave: "briefcase", label: "Maletín", Icono: Briefcase },
  { clave: "tv", label: "TV", Icono: Tv },
  { clave: "radio", label: "Radio", Icono: Radio },
  { clave: "video", label: "Video", Icono: Video },
  { clave: "monitor", label: "Pantalla", Icono: Monitor },
  { clave: "qr-code", label: "QR", Icono: QrCode },
  { clave: "flag", label: "Bandera", Icono: Flag },
  { clave: "star", label: "Estrella", Icono: Star },
  { clave: "heart", label: "Corazón", Icono: Heart },
  { clave: "gift", label: "Regalo", Icono: Gift },
  { clave: "sparkles", label: "Destellos", Icono: Sparkles },
];

export const ICONO_POR_DEFECTO = "tag";

export const CLAVES_ICONO = ICONOS_ORIGEN.map((i) => i.clave);

export function iconoDeOrigen(clave: string | null | undefined): LucideIcon {
  return ICONOS_ORIGEN.find((i) => i.clave === clave)?.Icono ?? Tag;
}

/**
 * Los que se cargan la primera vez (las fuentes del tablero de Notion). La
 * migración 0035 los crea en cada organización; una organización nueva los
 * recibe al abrir la lista por primera vez.
 */
export const ORIGENES_POR_DEFECTO: readonly { nombre: string; icono: string }[] = [
  { nombre: "Newsletter", icono: "newspaper" },
  { nombre: "MercadoLibre", icono: "shopping-bag" },
  { nombre: "Argenprop", icono: "building" },
  { nombre: "Zonaprop", icono: "building-2" },
  { nombre: "Página Web", icono: "globe" },
  { nombre: "Google Ads", icono: "megaphone" },
  { nombre: "Referido", icono: "user-plus" },
  { nombre: "Cartel", icono: "signpost" },
  { nombre: "Meta Ads", icono: "target" },
  { nombre: "Facebook", icono: "facebook" },
  { nombre: "Instagram", icono: "instagram" },
  { nombre: "Cartel Showroom", icono: "store" },
  { nombre: "Inmobiliaria", icono: "key-round" },
  { nombre: "Google", icono: "search" },
  { nombre: "Mail", icono: "mail" },
  { nombre: "Tik Tok", icono: "music" },
];

export const NOMBRE_ORIGEN_MAX = 60;

/** 256 KB: es un logo chico, no una foto. */
export const MAX_IMAGEN_ORIGEN_BYTES = 256 * 1024;

/** Nombre del archivo en el volumen de medios. */
export function assetImagenOrigen(id: string): string {
  return `origen-${id}`;
}

export function urlImagenOrigen(id: string, version: number): string {
  return `/api/origenes/${id}/imagen?v=${version}`;
}
export const TOPE_ORIGENES = 60;

/** Sin tildes, espacios, guiones ni mayúsculas: "META_ADS" = "Meta Ads". */
export function planoOrigen(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

/** "meta ads", "META_ADS" → "Meta Ads" si está en la lista. Si no, null. */
export function origenCanonico(
  raw: string | null | undefined,
  nombres: readonly string[]
): string | null {
  if (!raw) return null;
  const buscado = planoOrigen(raw);
  if (!buscado) return null;
  return nombres.find((n) => planoOrigen(n) === buscado) ?? null;
}

/** El nombre tal como se guarda: sin espacios de más. */
export function normalizarNombreOrigen(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}
