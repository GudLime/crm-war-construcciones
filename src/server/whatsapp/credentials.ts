import { and, eq, isNull, notInArray, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { scoped } from "@/lib/db/tenant";

export type Credentials = {
  id: string;
  organizationId: string;
  /** La Cuenta de WhatsApp (la del número). */
  wabaId: string;
  /** 065 — La Cuenta de mensajes (plantillas y pago), si se conoce. */
  messagingAccountId: string | null;
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  status: "connected" | "reconnect_required";
  /** 067 — El número sigue activo en la app WhatsApp Business (coexistencia). */
  coexistence: boolean;
  token: string;
};

type Row = typeof schema.metaCredentials.$inferSelect;

function toCredentials(row: Row): Credentials {
  return {
    id: row.id,
    organizationId: row.organizationId,
    wabaId: row.wabaId,
    messagingAccountId: row.messagingAccountId,
    phoneNumberId: row.phoneNumberId,
    displayPhoneNumber: row.displayPhoneNumber,
    verifiedName: row.verifiedName,
    status: row.status,
    coexistence: row.coexistence,
    token: decryptSecret({
      cipher: row.tokenCipher,
      iv: row.tokenIv,
      tag: row.tokenTag,
    }),
  };
}

/** Resuelve la conexión por phone_number_id (enrutamiento del webhook). */
export async function getCredentialsByPhoneNumberId(
  phoneNumberId: string
): Promise<Credentials | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.metaCredentials)
    .where(eq(schema.metaCredentials.phoneNumberId, phoneNumberId))
    .limit(1);
  return rows[0] ? toCredentials(rows[0]) : null;
}

/**
 * La cuenta donde viven las plantillas: la de mensajes si se conoce (065);
 * si no, la de WhatsApp, como antes del split de 2026.
 */
export function cuentaDePlantillas(
  creds: Pick<Credentials, "wabaId" | "messagingAccountId">
): string {
  return creds.messagingAccountId || creds.wabaId;
}

/**
 * Resuelve la conexión por el `entry.id` de un evento a nivel cuenta (ej.
 * plantillas). 065: puede venir de la Cuenta de WhatsApp o de la de mensajes.
 */
export async function getCredentialsByWabaId(
  wabaId: string
): Promise<Credentials | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.metaCredentials)
    .where(
      or(
        eq(schema.metaCredentials.wabaId, wabaId),
        eq(schema.metaCredentials.messagingAccountId, wabaId)
      )
    )
    .limit(1);
  return rows[0] ? toCredentials(rows[0]) : null;
}

export async function getCredentialsByOrg(
  organizationId: string
): Promise<Credentials | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.metaCredentials)
    .where(scoped(schema.metaCredentials.organizationId, organizationId))
    .limit(1);
  return rows[0] ? toCredentials(rows[0]) : null;
}

export async function saveCredentials(input: {
  organizationId: string;
  wabaId: string;
  /** 065 — `undefined` conserva la guardada; `null` la borra. */
  messagingAccountId?: string | null;
  phoneNumberId: string;
  token: string;
  displayPhoneNumber?: string | null;
  verifiedName?: string | null;
  /**
   * 067 — `true` solo en el alta por coexistencia. Cualquier otra conexión
   * (manual o Embedded Signup normal) la apaga y borra el estado de las
   * sincronizaciones: ya no aplica a ese número.
   */
  coexistence?: boolean;
}): Promise<void> {
  const db = getDb();
  const enc = encryptSecret(input.token);
  const coexistencia = {
    coexistence: input.coexistence === true,
    coexistenceSince: input.coexistence === true ? new Date() : null,
    contactsSyncRequestId: null,
    historySyncRequestId: null,
    historySyncStatus: null,
    historySyncProgress: null,
  };
  await db
    .insert(schema.metaCredentials)
    .values({
      id: newId("credentials"),
      organizationId: input.organizationId,
      wabaId: input.wabaId,
      messagingAccountId: input.messagingAccountId ?? null,
      phoneNumberId: input.phoneNumberId,
      displayPhoneNumber: input.displayPhoneNumber ?? null,
      verifiedName: input.verifiedName ?? null,
      tokenCipher: enc.cipher,
      tokenIv: enc.iv,
      tokenTag: enc.tag,
      status: "connected",
      ...coexistencia,
    })
    .onConflictDoUpdate({
      target: [schema.metaCredentials.organizationId],
      set: {
        wabaId: input.wabaId,
        ...(input.messagingAccountId !== undefined
          ? { messagingAccountId: input.messagingAccountId }
          : {}),
        phoneNumberId: input.phoneNumberId,
        displayPhoneNumber: input.displayPhoneNumber ?? null,
        verifiedName: input.verifiedName ?? null,
        tokenCipher: enc.cipher,
        tokenIv: enc.iv,
        tokenTag: enc.tag,
        status: "connected",
        ...coexistencia,
        updatedAt: new Date(),
      },
    });
}

/**
 * Desconectar el número: borra las credenciales cifradas de la organización.
 *
 * No toca conversaciones, contactos ni leads — son de la organización, no de
 * la conexión. Idempotente: sin fila, no hay nada que borrar.
 */
export async function desconectarCanal(organizationId: string): Promise<void> {
  const db = getDb();
  await db
    .delete(schema.metaCredentials)
    .where(scoped(schema.metaCredentials.organizationId, organizationId));
}

/** Marca la conexión como vencida (token inválido detectado en runtime). */
export async function markReconnectRequired(
  organizationId: string
): Promise<void> {
  const db = getDb();
  await db
    .update(schema.metaCredentials)
    .set({ status: "reconnect_required", updatedAt: new Date() })
    .where(scoped(schema.metaCredentials.organizationId, organizationId));
}

/** 067 — Lo que se sabe de las sincronizaciones de la coexistencia. */
export type EstadoCoexistencia = {
  since: Date | null;
  contactsRequested: boolean;
  historyStatus: "pending" | "running" | "done" | "declined" | "failed" | null;
  historyProgress: number | null;
};

export async function getEstadoCoexistencia(
  organizationId: string
): Promise<EstadoCoexistencia | null> {
  const db = getDb();
  const rows = await db
    .select({
      coexistence: schema.metaCredentials.coexistence,
      since: schema.metaCredentials.coexistenceSince,
      contactsSyncRequestId: schema.metaCredentials.contactsSyncRequestId,
      historyStatus: schema.metaCredentials.historySyncStatus,
      historyProgress: schema.metaCredentials.historySyncProgress,
    })
    .from(schema.metaCredentials)
    .where(scoped(schema.metaCredentials.organizationId, organizationId))
    .limit(1);
  const row = rows[0];
  if (!row?.coexistence) return null;
  return {
    since: row.since,
    contactsRequested: Boolean(row.contactsSyncRequestId),
    historyStatus: row.historyStatus,
    historyProgress: row.historyProgress,
  };
}

/** 067 — Guarda lo que respondió Meta al pedir las sincronizaciones. */
export async function guardarPedidoDeSincronizacion(
  organizationId: string,
  pedido: {
    contactsRequestId: string | null;
    historyRequestId: string | null;
  }
): Promise<void> {
  const db = getDb();
  await db
    .update(schema.metaCredentials)
    .set({
      contactsSyncRequestId: pedido.contactsRequestId,
      historySyncRequestId: pedido.historyRequestId,
      historySyncStatus: pedido.historyRequestId ? "pending" : "failed",
      historySyncProgress: pedido.historyRequestId ? 0 : null,
      updatedAt: new Date(),
    })
    .where(scoped(schema.metaCredentials.organizationId, organizationId));
}

/**
 * 067 — Avance del historial. Monotónico (constitución IV): un chunk que
 * llega tarde no hace retroceder el progreso, y un estado final
 * (`done`, `declined`) no se reabre.
 */
export async function actualizarAvanceDelHistorial(
  organizationId: string,
  avance: { status: "running" | "done" | "declined" | "failed"; progress: number | null }
): Promise<void> {
  const db = getDb();
  const progreso = avance.progress === null ? null : Math.max(0, Math.min(100, Math.round(avance.progress)));
  await db
    .update(schema.metaCredentials)
    .set({
      historySyncStatus: avance.status,
      historySyncProgress:
        progreso === null
          ? sql`${schema.metaCredentials.historySyncProgress}`
          : sql`greatest(coalesce(${schema.metaCredentials.historySyncProgress}, 0), ${progreso})`,
      updatedAt: new Date(),
    })
    .where(
      and(
        scoped(schema.metaCredentials.organizationId, organizationId),
        eq(schema.metaCredentials.coexistence, true),
        or(
          isNull(schema.metaCredentials.historySyncStatus),
          notInArray(schema.metaCredentials.historySyncStatus, ["done", "declined"])
        )
      )
    );
}

/** Últimos 4 caracteres del token para mostrar en UI (jamás el token). */
export function tokenLast4(token: string): string {
  return token.slice(-4);
}
