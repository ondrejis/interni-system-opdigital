/*
  Požadavky na složky: vznik (s frontou po klientovi), odeslání události `drive.*` přes outbox jádra (`emitDomain`),
  přechody stavového automatu a přepis stavu složky na klienta a zakázku (`drive_status`, `drive_folder_id`).
  Všechno běží v transakci volajícího (`inTx`), takže požadavek a událost vznikají atomicky se změnou záznamu.
*/
import { and, eq, sql } from "drizzle-orm";
import { newId } from "@rebar/core/db";
import type { DriveEventData } from "@rebar/core/contracts";
import { writeSystemFields } from "@rebar/core/entities";
import { emitDomain } from "@rebar/core/events";
import { NotFoundError, UserError, type Ctx } from "@rebar/core/rbac";
import { buildEvent, type DiskEnv } from "./payload";
import {
  clientFolderFacts,
  folderInfoOf,
  kindOfEvent,
  loadOpenRequestsOfClient,
  type RequestRow,
} from "./facts";
import { readClient } from "./entity-reader";
import { driveFolder, driveRequest } from "./schema";
import { applyRequestSignal, isOpenState, type RequestSignal } from "./state";
import type { DriveEntityType, DriveRequestKind, DriveRequestState } from "./types";

/** Název doménové události pro druh požadavku. */
export const EVENT_OF = {
  "client.create": "drive.client.create",
  "client.add_service": "drive.client.add_service",
  "client.rename": "drive.client.rename",
  "client.archive": "drive.client.archive",
  "client.restore": "drive.client.restore",
  "project.create": "drive.project.create",
} as const satisfies Record<DriveRequestKind, string>;

/** Vstup pro vytvoření požadavku. */
export type NewRequest = {
  kind: DriveRequestKind;
  entityType: DriveEntityType;
  entityId: string;
  /** Klient (u zakázky její klient): pořadí požadavků jednoho klienta se nikdy neprohodí. */
  clientId: string;
  /** Číslo pokusu (při „Zkusit znovu“ o jedna víc než u neúspěšného). */
  attempts?: number;
};

/** Textové hlášky ukládané k požadavku (zobrazí se v Nastavení a u tlačítka). */
export const REQUEST_MESSAGES = {
  timeout: "n8n neodpovědělo do 10 minut. Zkontrolujte workflow v n8n a zkuste to znovu.",
  noEndpoint:
    "Není nastavený aktivní webhook pro události Google Disku (Nastavení → Integrace), složky se nezakládají.",
  noPrivateEndpoint:
    "Záznam je soukromý, ale žádný webhook pro Google Disk nemá zapnuté „Doručovat i soukromé“ (Nastavení → Integrace).",
  deliveryFailed: "Událost se nepodařilo doručit do n8n ani po opakovaných pokusech.",
} as const;

async function lockClient(ctx: Ctx, clientId: string): Promise<void> {
  // jedna fronta po klientovi: souběžné transakce téhož klienta se na zámku seřadí
  await ctx.db.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`drive:${clientId}`}, 0))`,
  );
}

async function emitRow(
  ctx: Ctx,
  row: Pick<RequestRow, "id" | "event" | "entityType" | "entityId">,
  data: DriveEventData,
  isPrivate: boolean,
): Promise<void> {
  await ctx.db
    .update(driveRequest)
    .set({ payload: data, sentAt: new Date(), blockedBy: null, isPrivate })
    .where(eq(driveRequest.id, row.id));
  await emitDomain(ctx, row.event as (typeof EVENT_OF)[DriveRequestKind], data, {
    entity: { type: row.entityType, id: row.entityId, isPrivate },
  });
}

/**
 * Vytvoří požadavek na složku a odešle událost `drive.*`, nebo ho zařadí za předchozí otevřený požadavek téhož klienta
 * (odešle se po jeho dokončení). Vrací `requestId`, nebo `null`, když není co dělat (`add_service` bez chybějící služby).
 * Vyhodí `UserError`, když klient nebo zakázka neexistuje.
 */
export async function createRequest(
  ctx: Ctx,
  env: DiskEnv,
  input: NewRequest,
): Promise<{ requestId: string | null; blocked: boolean }> {
  await lockClient(ctx, input.clientId);
  const id = newId();
  const built = await buildEvent(ctx.db, env, {
    id,
    kind: input.kind,
    entityType: input.entityType,
    entityId: input.entityId,
  });
  if (input.kind === "client.add_service" && !built.missingServices.length)
    return { requestId: null, blocked: false };

  const open = await loadOpenRequestsOfClient(ctx.db, input.clientId);
  const blocker = open.at(-1) ?? null;
  const [row] = await ctx.db
    .insert(driveRequest)
    .values({
      id,
      event: EVENT_OF[input.kind],
      entityType: input.entityType,
      entityId: input.entityId,
      clientId: input.clientId,
      payload: built.data,
      state: "pending",
      attempts: input.attempts ?? 1,
      requestedBy: ctx.actor.userId,
      requestedAt: new Date(),
      isPrivate: built.isPrivate,
      blockedBy: blocker?.id ?? null,
    })
    .returning();
  if (!blocker) await emitRow(ctx, row!, built.data, built.isPrivate);
  await syncEntityStatus(ctx, env, input.entityType, input.entityId);
  return { requestId: id, blocked: !!blocker };
}

/** Odešle požadavky, které čekaly na dokončený `finishedId` (znovu sestavené s aktuálními ID složek). */
export async function releaseNext(ctx: Ctx, env: DiskEnv, finishedId: string): Promise<void> {
  const waiting = await ctx.db
    .select()
    .from(driveRequest)
    .where(and(eq(driveRequest.blockedBy, finishedId), eq(driveRequest.state, "pending")))
    .orderBy(driveRequest.id);
  for (const row of waiting) await dispatchBlocked(ctx, env, row);
}

async function dispatchBlocked(ctx: Ctx, env: DiskEnv, row: RequestRow): Promise<void> {
  const kind = kindOfEvent(row.event);
  let built;
  try {
    built = await buildEvent(ctx.db, env, {
      id: row.id,
      kind,
      entityType: row.entityType as DriveEntityType,
      entityId: row.entityId,
    });
  } catch (err) {
    if (!(err instanceof UserError)) throw err;
    await ctx.db.update(driveRequest).set({ blockedBy: null }).where(eq(driveRequest.id, row.id));
    await settleRequest(ctx, env, row.id, "error", err.message);
    return;
  }
  if (kind === "client.add_service" && !built.missingServices.length) {
    // mezitím vznikla (nebo zanikla) potřeba: služba už na Disku je
    await ctx.db.update(driveRequest).set({ blockedBy: null }).where(eq(driveRequest.id, row.id));
    await settleRequest(ctx, env, row.id, "ok");
    return;
  }
  await emitRow(ctx, row, built.data, built.isPrivate);
}

/**
 * Přechod požadavku stavovým automatem (`state.ts`). Při přechodu do konečného stavu odešle následující čekající
 * požadavek klienta a přepíše stav složky na klienta či zakázku. Vrací nový stav a zda se změnil.
 */
export async function settleRequest(
  ctx: Ctx,
  env: DiskEnv,
  requestId: string,
  signal: RequestSignal,
  message?: string,
): Promise<{ state: DriveRequestState; changed: boolean }> {
  const [row] = await ctx.db.select().from(driveRequest).where(eq(driveRequest.id, requestId));
  if (!row) throw new NotFoundError("Požadavek na složku neexistuje.");
  const current = row.state as DriveRequestState;
  const { state, changed } = applyRequestSignal(current, signal);
  if (!changed) return { state, changed };
  const terminal = !isOpenState(state);
  await ctx.db
    .update(driveRequest)
    .set({
      state,
      error:
        state === "error" || state === "timeout"
          ? (message ?? (state === "timeout" ? REQUEST_MESSAGES.timeout : row.error))
          : null,
      doneAt: terminal ? new Date() : row.doneAt,
    })
    .where(eq(driveRequest.id, requestId));
  await syncEntityStatus(ctx, env, row.entityType as DriveEntityType, row.entityId);
  if (terminal) await releaseNext(ctx, env, requestId);
  return { state, changed };
}

/**
 * Přepíše stav složky na klienta či zakázku (`drive_status`, `drive_folder_id` jako systémová pole). Smazaný záznam se
 * přeskočí: smazání v OPSYS na Disku nic nemění a pozdní odpověď n8n nesmí selhat.
 */
export async function syncEntityStatus(
  ctx: Ctx,
  env: DiskEnv,
  entityType: DriveEntityType,
  entityId: string,
  now: Date = new Date(),
): Promise<void> {
  const info = await folderInfoOf(ctx.db, entityType, entityId, { isPrivate: false }, now);
  try {
    await writeSystemFields(
      ctx,
      env.registry,
      entityType,
      entityId,
      { driveStatus: info.state, driveFolderId: info.folderId },
      { actorLabel: "Disk" },
    );
  } catch (err) {
    if (!(err instanceof NotFoundError)) throw err;
  }
}

/** Uloží ID složky (kořen nebo podsložka); stejná dvojice záznam + podklíč se přepíše. */
export async function saveFolder(
  ctx: Ctx,
  entityType: DriveEntityType,
  entityId: string,
  subkey: "" | "web" | "marketing" | "systemy" | "archive",
  folderId: string,
): Promise<void> {
  await ctx.db
    .insert(driveFolder)
    .values({ entityType, entityId, subkey, folderId })
    .onConflictDoUpdate({
      target: [driveFolder.entityType, driveFolder.entityId, driveFolder.subkey],
      set: { folderId, updatedAt: new Date() },
    });
}

/** Smaže uložené ID složky (jen záznam v OPSYS, na Disku se nic nemění; použije se po návratu z Archivu). */
export async function forgetFolder(
  ctx: Ctx,
  entityType: DriveEntityType,
  entityId: string,
  subkey: "" | "web" | "marketing" | "systemy" | "archive",
): Promise<void> {
  await ctx.db
    .delete(driveFolder)
    .where(
      and(
        eq(driveFolder.entityType, entityType),
        eq(driveFolder.entityId, entityId),
        eq(driveFolder.subkey, subkey),
      ),
    );
}

/**
 * Po založení složky klienta doplní služby, které přibyly, zatímco se zakládala (událost `client.service_added` v té
 * době složku nenašla, a nic neposlala).
 */
export async function reconcileServices(ctx: Ctx, env: DiskEnv, clientId: string): Promise<void> {
  const client = await readClient(ctx.db, env.registry, clientId);
  const facts = await clientFolderFacts(ctx.db, clientId);
  if (!client || !facts.ready) return;
  await createRequest(ctx, env, {
    kind: "client.add_service",
    entityType: "company",
    entityId: clientId,
    clientId,
  });
}
