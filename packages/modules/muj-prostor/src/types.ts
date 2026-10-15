import type { DomainSummary } from "./domains/logic";
import type { HostingSummary, RenewalLevel } from "./hosting/logic";
import type { DomainPayer, RecurringKind, RecurringPeriod, RecurringStatus } from "./labels";

/*
  Tvary výsledků příkazů hostingu a domén (čisté typy, bez zod): čte je UI (`import type`) i testy. Vstupy příkazů
  jsou v `contract.ts`. Peníze jsou v haléřích (CZK), data `YYYY-MM-DD`.
*/

/** Řádek služby (hosting, údržba) s popiskem klienta a stavem obnovy. */
export type ServiceRow = {
  id: string;
  companyId: string;
  companyName: string | null;
  kind: RecurringKind;
  name: string;
  web: string | null;
  priceMinor: number | null;
  period: RecurringPeriod;
  status: RecurringStatus;
  nextRenewal: string | null;
  runsAt: string | null;
  /** Dnů do obnovy (záporné po termínu); `null` bez data nebo u neaktivní služby. */
  daysLeft: number | null;
  renewal: RenewalLevel;
  updatedAt: string;
};

/** Výsledek `muj-prostor.hosting.overview`: souhrn a nejbližší obnovy (do 30 dní včetně po termínu). */
export type HostingOverview = {
  today: string;
  summary: HostingSummary;
  due: ServiceRow[];
};

/** Výsledek `muj-prostor.hosting.markRenewed`. */
export type MarkRenewedResult = { id: string; previous: string; next: string };

/** Řádek domény pro seznam domén (barvy expirace se dopočítají v prohlížeči z `today`, `expiresOn`, `warnDays`). */
export type DomainRow = {
  id: string;
  domain: string;
  companyId: string | null;
  companyName: string | null;
  registrar: string | null;
  expiresOn: string | null;
  payer: DomainPayer;
  autoRenew: boolean;
  renewalPriceMinor: number | null;
  recurringServiceId: string | null;
  hostingName: string | null;
  warnDays: number;
  note: string | null;
};

/** Výsledek `muj-prostor.domains.list`. */
export type DomainListResult = {
  today: string;
  rows: DomainRow[];
  summary: DomainSummary;
  /** Domén je víc, než se vrátilo (strop příkazu). */
  truncated: boolean;
};

/** Proč se doména při hromadném vložení nevložila. */
export type BulkSkipReason = "invalid" | "duplicate_in_input" | "exists";

/** Výsledek `muj-prostor.domains.bulkAdd`. */
export type BulkAddResult = {
  created: { id: string; domain: string }[];
  skipped: { input: string; reason: BulkSkipReason }[];
  /** Zadání mělo víc zápisů, než je strop; zbytek se nezpracoval. */
  truncated: boolean;
};

/** Výsledek `muj-prostor.domains.assignClient`. */
export type AssignClientResult = { updated: number };

/** Záložka „Hosting a domény“ na kartě klienta (`muj-prostor.client.overview`). */
export type ClientHostingOverview = {
  today: string;
  services: ServiceRow[];
  domains: DomainRow[];
};
