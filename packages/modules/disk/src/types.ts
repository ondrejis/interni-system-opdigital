/*
  Typy a konstanty modulu „disk“, které smí číst i prohlížeč (UI): žádný zod, drizzle ani serverový kód.
  Serverové vstupy a výstupy příkazů jsou v `contract.ts`.
*/
import type { DriveState, ServiceType } from "@rebar/core/contracts";

/** Typ záznamu, ke kterému patří složka: klient (`company`) nebo zakázka (`job`). */
export type DriveEntityType = "company" | "job";

/** Služby klienta, které mají na Disku vlastní složku (shodné s `ServiceType` z kontraktů). */
export const DRIVE_SERVICES = [
  "web",
  "marketing",
  "systemy",
] as const satisfies readonly ServiceType[];

/** Druh požadavku na Disk (shodný s názvem události `drive.*` bez předpony). */
export const DRIVE_REQUEST_KINDS = [
  "client.create",
  "client.add_service",
  "client.rename",
  "client.archive",
  "client.restore",
  "project.create",
] as const;
/** Jeden z druhů požadavku na Disk (`client.create`, `project.create`…). */
export type DriveRequestKind = (typeof DRIVE_REQUEST_KINDS)[number];

/** Stav požadavku (fronta k n8n). */
export type DriveRequestState = "pending" | "sent" | "done" | "error" | "timeout";

/** Jak dlouho čekáme na odpověď n8n, než se požadavek převede na `timeout` („Zkusit znovu“). */
export const DRIVE_TIMEOUT_MINUTES = 10;

/**
 * Uzel stromu složek v Nastavení. `id` je stabilní identifikátor uzlu (nemění se přejmenováním); `service` mají jen
 * složky služeb klienta (`10 Web`…): vytvoří se, jen když klient danou službu má, a pod nimi vznikají složky zakázek.
 */
export type FolderNode = {
  id: string;
  name: string;
  service?: ServiceType;
  children: FolderNode[];
};

/**
 * Struktura složek z Nastavení → Google Disk: strom pod složkou klienta a strom podsložek zakázky pro každý typ.
 * Změna platí jen pro nově zakládané složky.
 */
export type DriveStructure = {
  version: 1;
  /** Složka s klienty na sdíleném disku. */
  clientsRoot: string;
  /** Složka s bývalými klienty. */
  archiveRoot: string;
  /** Název složky zakázky; proměnné `{RRRR-MM}`, `{RRRR}`, `{MM}`, `{Název zakázky}`, `{Číslo}`. */
  jobFolderName: string;
  /** Podsložky klienta (obecná složka, složky služeb…). */
  client: FolderNode[];
  /** Podsložky zakázky podle jejího typu. */
  job: Record<ServiceType, FolderNode[]>;
};

/** Uzel stromu tak, jak se posílá n8n (bez interních ID, jen to, co se má založit). */
export type ResolvedNode = { name: string; service?: ServiceType; children: ResolvedNode[] };

/** Poslední neúspěšný požadavek u záznamu (zobrazí se vedle tlačítka). */
export type DriveIssue = {
  requestId: string;
  event: DriveRequestKind;
  state: "error" | "timeout";
  message: string;
  at: string;
};

/** Stav složky záznamu pro tlačítko „Otevřít Disk“ (příkaz `disk.folderState`). */
export type DriveFolderInfo = {
  state: DriveState;
  folderId: string | null;
  url: string | null;
  /** Záznam je soukromý (složka se sama nezakládá; ruční založení vyžaduje potvrzení varování). */
  isPrivate: boolean;
  /** Složka klienta je v Archivu (klient je Bývalý). */
  archived: boolean;
  /** Poslední požadavek skončil chybou nebo vypršel; u existující složky jde o neúspěšnou úpravu. */
  issue: DriveIssue | null;
  /** Kdy čekající požadavek odešel (UI z toho pozná, že už se blíží vypršení). */
  pendingSince: string | null;
};

/** Adresa složky na Disku z jejího ID (systém si pamatuje ID, ne cestu). */
export function driveFolderUrl(folderId: string): string {
  return `https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}`;
}

/** Požadavek ve výpisu v Nastavení → Google Disk. */
export type DriveRequestRow = {
  id: string;
  event: DriveRequestKind;
  entityType: DriveEntityType;
  entityId: string;
  /** Název klienta nebo zakázky (`null`, když je záznam smazaný nebo ho aktér nevidí). */
  label: string | null;
  state: DriveRequestState;
  error: string | null;
  attempts: number;
  isPrivate: boolean;
  requestedAt: string;
  doneAt: string | null;
};

/** Stav napojení na n8n pro Nastavení → Google Disk (`disk.status`). */
export type DiskStatus = {
  enabled: boolean;
  /** Adresa, na kterou n8n posílá výsledky (podepsaný `POST`). */
  callbackUrl: string;
  /** Aktivní webhooky, které odebírají události Disku. */
  endpoints: { id: string; name: string; includePrivate: boolean }[];
  /** Požadavky za posledních 7 dní podle stavu. */
  counts7d: Record<DriveRequestState, number>;
  lastDoneAt: string | null;
  recent: DriveRequestRow[];
};

/** Jedna kontrola z testu napojení (`disk.test`). */
export type DiskCheck = {
  key: string;
  label: string;
  status: "ok" | "warn" | "error";
  detail: string;
};

/** Výsledek testu napojení; `ok` je pravda, když žádná kontrola není chyba. */
export type DiskTestResult = { ok: boolean; checks: DiskCheck[] };
