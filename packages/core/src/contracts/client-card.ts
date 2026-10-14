import type { Ctx } from "../rbac/types";
import type { DriveState } from "./types";

/**
 * Záložky karty klienta (`company` s `client_status`): každý modul přidává jen svou záložku (`recordTabs.company`)
 * a musí použít `id` a `order` odsud. Prázdné záložky se skrývají podle `tabCounts`.
 */
export const CLIENT_TABS = {
  prehled: 0,
  kontext: 10,
  kontakty: 20,
  zakazky: 30,
  obchody: 40,
  ukoly: 50,
  poznamky: 60,
  finance: 70,
  reklama: 80,
  hosting: 90,
  historie: 800,
} as const;
/** Identifikátor záložky karty klienta. */
export type ClientTabId = keyof typeof CLIENT_TABS;

/** Pořadí karet na Přehledu klienta (`recordOverview.company`, `order`). */
export const CLIENT_OVERVIEW_ORDER = {
  kontakty: 10,
  zakazky: 20,
  obchody: 30,
  ukoly: 40,
  finance: 50,
  udalosti: 90,
} as const;

/** Pořadí akcí v hlavičce karty klienta (`recordActions.company`, `order`). */
export const CLIENT_ACTIONS = {
  disk: 10,
  call: 20,
  email: 30,
  web: 40,
  task: 50,
  note: 60,
  job: 70,
  deal: 80,
} as const;

/** Souhrn na Přehledu klienta; každý poskytovatel doplní jen svou část. */
export type ClientSummary = {
  contacts: {
    count: number;
    primary: { personId: string; name: string; phone?: string; email?: string } | null;
  };
  jobs: { active: number; total: number };
  deals: { open: number; openValueMinor: number };
  tasks: { open: number; overdue: number };
  finance: {
    income12mMinor: number;
    incomeTotalMinor: number;
    activeRetainerMinor: number;
    unpaidCount: number;
  };
  lastActivityAt: string | null;
  drive: { state: DriveState; url: string | null };
};

/** Sloupce tabulky klientů, které počítají jiné moduly (podle zobrazujícího: soukromé se nezapočítají). */
export type ClientListMetrics = {
  activeJobs: number;
  income12mMinor: number;
  lastActivityAt: string | null;
  driveState: DriveState;
};

/**
 * Příspěvek modulu ke kartě klienta (`ModuleServer.contributions.clientCard`). Čte ho modul `klienti`;
 * implementace musí respektovat soukromé záznamy (`privateScope`) a mít záznam v `privatePaths`.
 */
export type ClientTabProvider = {
  tabCounts?(ctx: Ctx, companyId: string): Promise<Partial<Record<ClientTabId, number>>>;
  summary?(ctx: Ctx, companyId: string): Promise<Partial<ClientSummary>>;
  listMetrics?(ctx: Ctx, companyIds: string[]): Promise<Record<string, Partial<ClientListMetrics>>>;
};
