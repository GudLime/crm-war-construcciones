import {
  Building2,
  CalendarDays,
  ChartColumn,
  FlaskConical,
  House,
  Inbox,
  Kanban,
  ListChecks,
  ListTodo,
  Settings,
  Sparkles,
  Tag,
  Users,
  type LucideIcon,
} from "lucide-react";
import { canConfigure } from "@/lib/auth/roles";
import type { ObjetoMenuDto } from "@/lib/motor/dto";
import { iconoDeOrigen } from "@/lib/origenes";
import type { PantallaMenu } from "@/lib/motor/config";
import { VOCABULARIO_POR_DEFECTO, nombrePantalla, pantallaOculta, type Vocabulario } from "@/lib/vocabulario";

/**
 * #87 — El modelo del menú, separado del componente que lo pinta.
 *
 * Qué entradas existen lo deciden dos cosas que el nav de cliente no puede
 * leer solo: las banderas de la instancia (`AGENDA`, `CHANNELS`, `ATRIBUCION`,
 * que bajan por prop desde el servidor) y el rol de quien mira. Tenerlo aquí,
 * sin React, deja que una prueba unitaria afirme qué aparece y qué no sin
 * dibujar nada.
 */

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Muestra el contador de no leídos (solo la Bandeja). */
  badge?: boolean;
};

export type NavGroup = {
  /** Encabezado pequeño; sin él, el grupo es una entrada suelta. */
  title?: string;
  items: NavItem[];
};

/** La única entrada que va abajo, separada del resto. */
export const SETTINGS_ITEM: NavItem = {
  href: "/settings",
  label: "Ajustes",
  icon: Settings,
};

/**
 * Grupos de la barra lateral, en el orden en que se leen: lo que se atiende
 * cada día, lo que configura al agente y, al final, cómo va el negocio.
 */
export function appNavGroups({
  agenda = false,
  role,
  objetos = [],
  vocabulario = VOCABULARIO_POR_DEFECTO,
}: {
  /** 015 — "Citas" solo existe si esta instancia encendió la agenda. */
  agenda?: boolean;
  /** #86 — La guía de inicio solo para quien puede configurar. */
  role?: string | null;
  /** 070 — Los objetos personalizados del cliente (Edificio, Tratamiento…). */
  objetos?: ObjetoMenuDto[];
  /** 071 — Cómo se llama la oportunidad y si existen los edificios. */
  vocabulario?: Vocabulario;
}): NavGroup[] {
  // Visibilidad por rol: el operador no ve el Pipeline de leads, el Agente ni
  // el Laboratorio (son de quien administra).
  const admin = canConfigure(role);
  const v = vocabulario;
  // 071 — Cada pantalla del menú con su nombre en esta instancia; las apagadas no están.
  const pantallas: Partial<Record<PantallaMenu, NavItem>> = {};
  const poner = (p: PantallaMenu, item: NavItem, existe = true) => {
    if (existe && !pantallaOculta(v, p)) pantallas[p] = { ...item, label: nombrePantalla(v, p, item.label) };
  };
  // Inicio del vendedor: lo primero que se ve al entrar.
  poner("inicio", { href: "/inicio", label: "Inicio", icon: House });
  poner("inbox", { href: "/inbox", label: "Bandeja", icon: Inbox, badge: true });
  poner("pipeline", { href: "/pipeline", label: "Pipeline", icon: Kanban }, admin);
  poner("contacts", { href: "/contacts", label: "Contactos", icon: Users });
  // Citas va después de Contactos: es el paso siguiente de un trato, no una
  // sección aparte.
  poner("bookings", { href: "/bookings", label: "Citas", icon: CalendarDays }, agenda);
  poner("oportunidades", { href: "/oportunidades", label: v.plural, icon: Tag });
  poner("tareas", { href: "/tareas", label: "Tareas", icon: ListTodo });
  // 019 — Se mide al final: primero se atiende y se organiza.
  poner("results", { href: "/results", label: "Resultados", icon: ChartColumn });

  // 071 — Un cliente puede armar Trabajo a su gusto: esas pantallas salen de su grupo de siempre.
  const ordenTrabajo: PantallaMenu[] = v.menu.trabajo ?? ["inicio", "inbox", "pipeline", "contacts", "bookings"];
  const enTrabajo = new Set(ordenTrabajo);
  const de = (lista: PantallaMenu[]) =>
    lista.flatMap((p) => (pantallas[p] ? [pantallas[p]!] : []));
  const fuera = (lista: PantallaMenu[]) => de(lista.filter((p) => !enTrabajo.has(p)));
  const trabajo = de(ordenTrabajo);

  const agente: NavItem[] = [];
  // Un miembro del equipo no puede hacer ninguno de los pasos de la guía.
  if (canConfigure(role)) {
    agente.push({ href: "/onboarding", label: "Guía de inicio", icon: ListChecks });
  }
  agente.push(
    { href: "/agent", label: "Agente", icon: Sparkles },
    { href: "/lab", label: "Laboratorio", icon: FlaskConical }
  );

  const ventas: NavItem[] = [
    // 071 — Los edificios son de lo inmobiliario: sin él, no hay entrada.
    ...(v.inmobiliario ? [{ href: "/edificios", label: "Edificios", icon: Building2 }] : []),
    // 070 — Cada objeto personalizado del cliente, en el orden de su configuración.
    ...objetos.map((o) => ({ href: `/objetos/${o.clave}`, label: o.nombrePlural, icon: iconoDeOrigen(o.icono) })),
    ...fuera(["oportunidades", "tareas"]),
  ];
  const resultados = fuera(["results"]);

  return [
    { title: "Trabajo", items: trabajo },
    ...(ventas.length ? [{ title: v.grupoMenu, items: ventas }] : []),
    ...(admin ? [{ title: "Agente", items: agente }] : []),
    ...(resultados.length ? [{ items: resultados }] : []),
  ];
}

export type SettingsLink = { href: string; label: string };

export type SettingsSection = {
  title: string;
  links: SettingsLink[];
};

/**
 * Ajustes en tres secciones: por dónde entran los mensajes, qué hace el agente
 * con ellos y lo que es del negocio. Una pestaña por canal no escala; una
 * sección por canal, sí: cada canal nuevo cae en "Canales" sin tocar el resto.
 *
 * Instagram no tiene pantalla propia todavía: sus credenciales se guardan
 * por API (`/api/settings/instagram`). Cuando la tenga, va aquí tras
 * `CHANNELS`, igual que Messenger.
 */
export function settingsSections({
  agenda = false,
  reservas = false,
  atribucion = false,
  instagram = false,
  messenger = false,
  tiktok = false,
}: {
  agenda?: boolean;
  /** 071 — "Reservas" solo si la instancia toma reservas (bandera RESERVAS). */
  reservas?: boolean;
  /** 016 — "Anuncios" existe solo con la bandera ATRIBUCION. */
  atribucion?: boolean;
  /** 023 — "Instagram" solo si el canal está encendido con CHANNELS. */
  instagram?: boolean;
  /** 017 — "Messenger", igual. */
  messenger?: boolean;
  /** 022 — "TikTok", igual: solo con el canal en CHANNELS. */
  tiktok?: boolean;
}): SettingsSection[] {
  const canales: SettingsLink[] = [];
  // 023 — "Estado" reúne todos los canales; con WhatsApp solo no aporta nada
  // que su pantalla no diga, así que no existe (ADR-001).
  if (instagram || messenger || tiktok) {
    canales.push({ href: "/settings/channels", label: "Estado" });
  }
  canales.push({ href: "/settings/whatsapp", label: "WhatsApp" });
  if (instagram) canales.push({ href: "/settings/instagram", label: "Instagram" });
  if (messenger) canales.push({ href: "/settings/messenger", label: "Messenger" });
  if (tiktok) canales.push({ href: "/settings/tiktok", label: "TikTok" });

  // #85 — el proveedor de IA se configura aquí; el entorno queda de respaldo.
  const agente: SettingsLink[] = [{ href: "/settings/ai", label: "IA" }];
  if (agenda) agente.push({ href: "/settings/calendar", label: "Agenda" });

  const negocio: SettingsLink[] = [
    { href: "/settings/branding", label: "Marca" },
    // 062 — Tema, letra, tamaño y densidad (cada quien la suya).
    { href: "/settings/appearance", label: "Apariencia" },
    { href: "/settings/templates", label: "Plantillas" },
    // 049 — lo que el equipo inserta con «/atajo» en la Bandeja.
    { href: "/settings/quick-replies", label: "Respuestas rápidas" },
    // War — de dónde llegan las oportunidades (nombre e ícono).
    { href: "/settings/origenes", label: "Orígenes" },
    // War — sin respuesta, cierre por silencio y reapertura.
    { href: "/settings/ventas", label: "Ventas" },
    { href: "/settings/team", label: "Equipo" },
  ];
  if (reservas) {
    negocio.unshift(
      { href: "/settings/reservas", label: "Reservas" },
      { href: "/settings/sectores", label: "Sectores" }
    );
  }
  if (atribucion) negocio.push({ href: "/settings/ads", label: "Anuncios" });

  return [
    { title: "Canales", links: canales },
    { title: "Agente", links: agente },
    { title: "Negocio", links: negocio },
  ];
}

/** Activa si la ruta es la entrada o cuelga de ella (`/inbox/cv_123`). */
export function isNavActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
