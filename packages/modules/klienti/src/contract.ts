/*
  Kontrakt modulu „klienti“ (M1): zod vstupy příkazů a tvary výstupů. Klient nemá vlastní tabulku, je to organizace
  (`company`) se `client_status`; modul tedy nemá schéma, jen příkazy, službu `clients` a UI karty klienta.
*/
import { z } from "zod";
import type {
  ClientStatus,
  ClientSummary,
  ClientTabId,
  DriveState,
  ServiceType,
} from "@rebar/core/contracts";

const id = z.uuid();
const status = z.enum(["lead", "active", "paused", "former"]);
const service = z.enum(["web", "marketing", "systemy"]);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum zadejte ve tvaru RRRR-MM-DD.");
const text = (max: number) => z.string().trim().max(max);

/** `klienti.list`: výchozí jen lead, aktivní a pozastavení; `includeFormer` přidá bývalé. */
export const listInput = z.object({
  includeFormer: z.boolean().default(false),
  search: text(100).optional(),
});
/** Vstup `klienti.list` před doplněním výchozích hodnot. */
export type ListInput = z.input<typeof listInput>;

/** Společný vstup příkazů nad jedním klientem. */
export const clientRefInput = z.object({ companyId: id });

/**
 * `klienti.setStatus`: změna stavu. Bývalý vyžaduje důvod; datum ukončení je volitelné (výchozí dnes).
 * „Klient od“ se uloží při prvním přechodu na Aktivní (R-17).
 */
export const setStatusInput = clientRefInput.extend({
  status,
  reason: text(1000).optional(),
  endedOn: day.optional(),
});
/** Vstup `klienti.setStatus` před doplněním výchozích hodnot. */
export type SetStatusInput = z.input<typeof setStatusInput>;

/** `klienti.setServices`: úplný seznam služeb klienta (přidané spustí `client.service_added`). */
export const setServicesInput = clientRefInput.extend({ services: z.array(service).max(3) });

/** Pole kontextu klienta (R-27); prázdný text pole smaže. */
export const CONTEXT_FIELDS = ["decisionMaker", "howToCommunicate", "history", "notes"] as const;
/** Název pole kontextu klienta. */
export type ContextField = (typeof CONTEXT_FIELDS)[number];
/** `klienti.saveContext`: jen předaná pole (autosave po jednom poli); `endReason` je „proč spolupráce skončila“. */
export const saveContextInput = clientRefInput.extend({
  decisionMaker: text(5000).optional(),
  howToCommunicate: text(5000).optional(),
  history: text(10000).optional(),
  notes: text(5000).optional(),
  endReason: text(1000).optional(),
});
/** Vstup `klienti.saveContext` před doplněním výchozích hodnot. */
export type SaveContextInput = z.input<typeof saveContextInput>;

/** Řádek tabulky klientů (`klienti.list`). Sloupce, na které aktér nemá právo, jsou `null`. */
export type ClientRow = {
  id: string;
  name: string;
  status: ClientStatus;
  services: ServiceType[];
  ownerId: string | null;
  ownerName: string | null;
  tags: string[];
  isPrivate: boolean;
  /** Aktivní zakázky (jen viditelné aktérovi). */
  activeJobs: number;
  /** Příjem za 12 měsíců v haléřích; `null` bez práva na finance. */
  income12mMinor: number | null;
  clientSince: string | null;
  lastActivityAt: string | null;
  driveState: DriveState;
  web: string | null;
};
/** Výsledek `klienti.list`: řádky a to, co aktér smí vidět a dělat. */
export type ClientListResult = {
  rows: ClientRow[];
  /** Smí aktér vidět finance (sloupec příjem)? */
  canSeeIncome: boolean;
  canWrite: boolean;
  /** Aktér vidí soukromé záznamy (sloupec se zámkem). */
  canSeePrivate: boolean;
};

/** Kontext klienta (čtyři pojmenovaná pole + důvod ukončení). */
export type ClientContextDto = {
  decisionMaker: string;
  howToCommunicate: string;
  history: string;
  notes: string;
  endReason: string;
};

/** Souhrn karty klienta (`klienti.summary`): souhrny modulů s výchozími nulami a údaje o stavu. */
export type ClientCardSummary = {
  companyId: string;
  name: string;
  status: ClientStatus | null;
  since: string | null;
  until: string | null;
  summary: ClientSummary;
  /** Smí aktér vidět finanční souhrn? */
  canSeeFinance: boolean;
  /** Finanční souhrn jsou jen součty ze sdílených zakázek (aktér nevidí soukromé). */
  financeSharedOnly: boolean;
  context: ClientContextDto;
};

/** Počty záložek karty (`klienti.tabCounts`) a záložky, které se mají skrýt (bez dat). */
export type ClientTabsResult = {
  counts: Partial<Record<ClientTabId, number>>;
  hidden: ClientTabId[];
};

/** Prázdný souhrn: základ, který přepisují poskytovatelé. */
export function emptySummary(): ClientSummary {
  return {
    contacts: { count: 0, primary: null },
    jobs: { active: 0, total: 0 },
    deals: { open: 0, openValueMinor: 0 },
    tasks: { open: 0, overdue: 0 },
    finance: { income12mMinor: 0, incomeTotalMinor: 0, activeRetainerMinor: 0, unpaidCount: 0 },
    lastActivityAt: null,
    drive: { state: "none", url: null },
  };
}
