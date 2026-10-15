/*
  Fakta o složkách a požadavcích načtená z tabulek `drive_folder` a `drive_request` (čtení bez oprávnění aktéra:
  volající rozhoduje, komu výsledek ukáže). Z faktů se odvozuje stav složky pro tlačítko i rozhodnutí handlerů.
*/
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Executor } from "@rebar/core/db";
import { driveFolder, driveRequest } from "./schema";
import {
  CREATE_KINDS,
  deriveFolderState,
  isFailedState,
  isOpenState,
  isOverdue,
  type ClientFolderFacts,
} from "./state";
import {
  driveFolderUrl,
  type DriveEntityType,
  type DriveFolderInfo,
  type DriveIssue,
  type DriveRequestKind,
  type DriveRequestState,
} from "./types";

/** Řádek požadavku. */
export type RequestRow = typeof driveRequest.$inferSelect;

/** Druh požadavku z názvu události (`drive.client.create` → `client.create`). */
export const kindOfEvent = (event: string): DriveRequestKind =>
  event.replace(/^drive\./, "") as DriveRequestKind;

/** Složky záznamu podle podklíče (`''` kořen, `web`/`marketing`/`systemy`, `archive`). */
export async function loadFolders(
  db: Executor,
  entityType: DriveEntityType,
  entityId: string,
): Promise<Map<string, string>> {
  const rows = await db
    .select({ subkey: driveFolder.subkey, folderId: driveFolder.folderId })
    .from(driveFolder)
    .where(and(eq(driveFolder.entityType, entityType), eq(driveFolder.entityId, entityId)));
  return new Map(rows.map((r) => [r.subkey, r.folderId]));
}

/** Složky více záznamů naráz (kořenové složky podle ID záznamu). */
export async function loadRootFolders(
  db: Executor,
  entityType: DriveEntityType,
  ids: readonly string[],
): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const rows = await db
    .select({ entityId: driveFolder.entityId, folderId: driveFolder.folderId })
    .from(driveFolder)
    .where(
      and(
        eq(driveFolder.entityType, entityType),
        eq(driveFolder.subkey, ""),
        inArray(driveFolder.entityId, [...ids]),
      ),
    );
  return new Map(rows.map((r) => [r.entityId, r.folderId]));
}

/** Otevřené požadavky (čekající nebo odeslané) klienta, od nejstaršího. */
export async function loadOpenRequestsOfClient(
  db: Executor,
  clientId: string,
): Promise<RequestRow[]> {
  return db
    .select()
    .from(driveRequest)
    .where(
      and(eq(driveRequest.clientId, clientId), inArray(driveRequest.state, ["pending", "sent"])),
    )
    .orderBy(driveRequest.id);
}

/** Poslední požadavky záznamu (nejnovější první). */
export async function loadRequestsOfEntity(
  db: Executor,
  entityType: DriveEntityType,
  entityId: string,
  limit = 20,
): Promise<RequestRow[]> {
  return db
    .select()
    .from(driveRequest)
    .where(and(eq(driveRequest.entityType, entityType), eq(driveRequest.entityId, entityId)))
    .orderBy(desc(driveRequest.id))
    .limit(limit);
}

/**
 * Fakta o složce klienta pro rozhodnutí o změně stavu: existuje (nebo se zakládá), je v Archivu (po otevřených
 * požadavcích). Otevřená archivace znamená „bude archivovaná“, otevřená obnova „bude obnovená“.
 */
export async function clientFolderFacts(
  db: Executor,
  clientId: string,
): Promise<ClientFolderFacts & { ready: boolean; rootId: string | null }> {
  const folders = await loadFolders(db, "company", clientId);
  const open = await loadOpenRequestsOfClient(db, clientId);
  const createOpen = open.some((r) => r.event === "drive.client.create");
  let archived = folders.has("archive");
  for (const r of open) {
    if (r.event === "drive.client.archive") archived = true;
    else if (r.event === "drive.client.restore") archived = false;
  }
  const ready = folders.has("");
  return { known: ready || createOpen, archived, ready, rootId: folders.get("") ?? null };
}

/** Existuje složka zakázky, nebo se zakládá? */
export async function jobFolderKnown(db: Executor, jobId: string): Promise<boolean> {
  const folders = await loadFolders(db, "job", jobId);
  if (folders.has("")) return true;
  const [open] = await db
    .select({ id: driveRequest.id })
    .from(driveRequest)
    .where(
      and(
        eq(driveRequest.entityType, "job"),
        eq(driveRequest.entityId, jobId),
        inArray(driveRequest.state, ["pending", "sent"]),
      ),
    )
    .limit(1);
  return !!open;
}

/** Stav požadavku se zohledněním vypršení lhůty (než ho stihne převést úloha na pozadí). */
export function effectiveState(r: RequestRow, now: Date): DriveRequestState {
  const state = r.state as DriveRequestState;
  return isOverdue(
    { state, requestedAt: r.requestedAt, sentAt: r.sentAt, blockedBy: r.blockedBy },
    now,
  )
    ? "timeout"
    : state;
}

const MESSAGES: Record<"error" | "timeout", string> = {
  error: "Požadavek na Google Disk skončil chybou.",
  timeout: "n8n neodpovědělo do 10 minut.",
};

/**
 * Stav složky záznamu pro tlačítko a kartu, složený ze složek a požadavků záznamu (zdroj pravdy; sloupec
 * `drive_status` na záznamu je jeho kopie pro seznamy). `requests` jsou od nejnovějšího.
 */
export function composeFolderInfo(
  folders: ReadonlyMap<string, string>,
  requests: readonly RequestRow[],
  extra: { isPrivate: boolean },
  now: Date = new Date(),
): DriveFolderInfo {
  const creates = requests.filter((r) =>
    (CREATE_KINDS as readonly string[]).includes(kindOfEvent(r.event)),
  );
  const createOpen = creates.some((r) => isOpenState(effectiveState(r, now)));
  const latestCreate = creates[0] ? { state: effectiveState(creates[0], now) } : null;
  const rootId = folders.get("") ?? null;
  const state = deriveFolderState({
    hasFolder: !!rootId,
    createOpen: createOpen && !rootId,
    latestCreate,
  });
  const latest = requests[0];
  const latestState = latest ? effectiveState(latest, now) : null;
  const issue: DriveIssue | null =
    latest && latestState && isFailedState(latestState)
      ? {
          requestId: latest.id,
          event: kindOfEvent(latest.event),
          state: latestState,
          message: latest.error ?? MESSAGES[latestState],
          at: (latest.doneAt ?? latest.sentAt ?? latest.requestedAt).toISOString(),
        }
      : null;
  const pending = requests.find((r) => isOpenState(effectiveState(r, now)));
  return {
    state,
    folderId: rootId,
    url: rootId ? driveFolderUrl(rootId) : null,
    isPrivate: extra.isPrivate,
    archived: folders.has("archive"),
    issue,
    pendingSince: pending ? (pending.sentAt ?? pending.requestedAt).toISOString() : null,
  };
}

/** Stav složky jednoho záznamu načtený z databáze. */
export async function folderInfoOf(
  db: Executor,
  entityType: DriveEntityType,
  entityId: string,
  extra: { isPrivate: boolean },
  now: Date = new Date(),
): Promise<DriveFolderInfo> {
  const folders = await loadFolders(db, entityType, entityId);
  const requests = await loadRequestsOfEntity(db, entityType, entityId, 30);
  return composeFolderInfo(folders, requests, extra, now);
}

/** Stavy složek více záznamů naráz (seznam klientů): tři dotazy bez ohledu na počet. */
export async function folderInfosOf(
  db: Executor,
  entityType: DriveEntityType,
  entityIds: readonly string[],
  privacy: ReadonlyMap<string, boolean>,
  now: Date = new Date(),
): Promise<Map<string, DriveFolderInfo>> {
  const out = new Map<string, DriveFolderInfo>();
  if (!entityIds.length) return out;
  const ids = [...entityIds];
  const folderRows = await db
    .select({
      entityId: driveFolder.entityId,
      subkey: driveFolder.subkey,
      folderId: driveFolder.folderId,
    })
    .from(driveFolder)
    .where(and(eq(driveFolder.entityType, entityType), inArray(driveFolder.entityId, ids)));
  const requestRows = await db
    .select()
    .from(driveRequest)
    .where(and(eq(driveRequest.entityType, entityType), inArray(driveRequest.entityId, ids)))
    .orderBy(desc(driveRequest.id));
  for (const id of ids) {
    const folders = new Map(
      folderRows.filter((r) => r.entityId === id).map((r) => [r.subkey, r.folderId] as const),
    );
    const requests = requestRows.filter((r) => r.entityId === id);
    out.set(id, composeFolderInfo(folders, requests, { isPrivate: privacy.get(id) ?? false }, now));
  }
  return out;
}

/** Počet řádků (pro diagnostiku): požadavky podle stavu od zadaného data. */
export async function countByState(
  db: Executor,
  since: Date,
): Promise<Record<DriveRequestState, number>> {
  const rows = await db
    .select({ state: driveRequest.state, n: sql<number>`count(*)::int` })
    .from(driveRequest)
    .where(sql`${driveRequest.requestedAt} >= ${since}`)
    .groupBy(driveRequest.state);
  const out: Record<DriveRequestState, number> = {
    pending: 0,
    sent: 0,
    done: 0,
    error: 0,
    timeout: 0,
  };
  for (const r of rows) out[r.state as DriveRequestState] = r.n;
  return out;
}
