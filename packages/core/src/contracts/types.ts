/*
  Sdílené typy a konstanty, které znají všechny moduly OPSYS (docs/opsys/D-plan-a-kontrakty.md §2.1). Kontrakt je zmrazený:
  přidávat smí jen architekt (žádost do docs/opsys/ZADOSTI.md), přejmenovat ani mazat nikdo. Žádné importy z DB ani ze zod,
  soubor se dostane i do prohlížeče.
*/

/** Typ služby (zakázky i klientova nabídka). Hodnoty jsou kód, popisky se doplňují v UI. */
export type ServiceType = "web" | "marketing" | "systemy";
/** Měsíc ve tvaru `YYYY-MM`, např. `2026-12`. */
export type YearMonth = string;
/** Stav klienta (`company.client_status`); `null` = organizace není klient. */
export type ClientStatus = "lead" | "active" | "paused" | "former";
/** Stav složky na Google Disku u klienta nebo zakázky. */
export type DriveState = "none" | "pending" | "ready" | "error" | "timeout";
/** Stav zakázky (pipeline `job/status`). */
export type JobStatus = "planned" | "active" | "paused" | "done" | "cancelled";
/** Způsob fakturace zakázky. `hourly` je jen příznak bez automatiky (R-25). */
export type BillingModel = "one_off" | "intro_then_retainer" | "retainer" | "hourly";
/** Fáze marketingové zakázky (úvod → rozhodnutí → retainer → konec). */
export type MarketingStage = "intro" | "decision" | "retainer" | "ended";
/** Druh platby. */
export type PaymentKind = "one_off" | "intro" | "retainer" | "extra" | "recurring";

/** Pravidlo rozdělení platby mezi dvě osoby (vstup editoru rozdělení). */
export type SplitRuleInput = {
  userId: string;
  mode: "percent" | "fixed_per_payment" | "fixed_total";
  /** Procenta 0–100 (jen `percent`). */
  percent?: number;
  /** Částka v haléřích (jen `fixed_*`). */
  fixedMinor?: number;
  appliesTo: "all" | PaymentKind;
  validFrom?: YearMonth | null;
  validTo?: YearMonth | null;
};

/** Nastavení retaineru při založení zakázky („Rovnou retainer“, R-36). */
export type RetainerSetup = {
  amountMinor: number;
  fromMonth: YearMonth;
  /** Den vystavení v měsíci, 1–28. */
  issueDay: number;
  issuerMode: "fixed" | "alternate";
  issuerId: string;
  firstIssuerId?: string;
  split: SplitRuleInput[];
};

/** Vyhodí tělo veřejné funkce modulu, které ještě nikdo nenaprogramoval (kostra S0). */
export class NotImplementedError extends Error {
  constructor(what: string) {
    super(`Zatím neimplementováno: ${what}`);
    this.name = "NotImplementedError";
  }
}

/** Minimální snímky záznamů, které putují v událostech a ve webhookech (nikdy celé řádky). */
export type DealSnap = {
  id: string;
  title: string;
  companyId: string | null;
  personId: string | null;
  stageId: string | null;
  result: "open" | "won" | "lost";
  valueMinor: number | null;
  services: ServiceType[];
  ownerId: string | null;
  source: string | null;
};
/** Snímek klienta v událostech `client.*`. */
export type ClientSnap = {
  id: string;
  name: string;
  ico: string | null;
  status: ClientStatus | null;
  /** Datum prvního přechodu do stavu `active` (`YYYY-MM-DD`). */
  since: string | null;
};
/** Snímek zakázky v událostech `project.*`. */
export type ProjectSnap = {
  id: string;
  number: string;
  title: string;
  type: ServiceType;
  companyId: string | null;
  ownerId: string | null;
  startDate: string | null;
  dueDate: string | null;
};
/** Snímek úkolu v událostech `task.*`. */
export type TaskSnap = {
  id: string;
  title: string;
  typeKey: string;
  status: "todo" | "in_progress" | "done" | "canceled";
  assigneeId: string | null;
  dueDate: string | null;
  dueTime: string | null;
  dealId: string | null;
  jobId: string | null;
  companyId: string | null;
};
/** Snímek platby v událostech `payment.*`. */
export type PaymentSnap = {
  id: string;
  jobId: string | null;
  companyId: string | null;
  kind: PaymentKind;
  amountMinor: number;
  issuerId: string | null;
  status: "planned" | "issued" | "paid" | "canceled";
  invoiceNumber: string | null;
  issuedOn: string | null;
  dueOn: string | null;
  paidOn: string | null;
  allocations: { userId: string; amountMinor: number }[];
};
