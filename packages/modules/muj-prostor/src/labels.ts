/*
  Čisté typy a popisky modulu „Můj prostor“ bez závislosti na databázi, aby je mohlo importovat i UI (prohlížeč).
  Hodnoty kódů odpovídají sloupcům v `schema.ts` (hlídá to `entities.ts` přes typy).
*/

/** Druh opakované služby. */
export type RecurringKind = "hosting" | "maintenance";
/** Období, za které se služba platí. */
export type RecurringPeriod = "yearly" | "monthly";
/** Stav opakované služby. */
export type RecurringStatus = "active" | "paused" | "canceled";
/** Kdo platí doménu. */
export type DomainPayer = "agency" | "client";
/** Stav návrhu opakované faktury. */
export type InvoiceStatus = "draft" | "approved" | "sent_to_fakturoid" | "canceled";

/** Popisky druhů opakované služby. */
export const RECURRING_KIND_LABELS: Record<RecurringKind, string> = {
  hosting: "Hosting",
  maintenance: "Údržba",
};
/** Popisky období opakované služby. */
export const RECURRING_PERIOD_LABELS: Record<RecurringPeriod, string> = {
  yearly: "Ročně",
  monthly: "Měsíčně",
};
/** Popisky stavů opakované služby. */
export const RECURRING_STATUS_LABELS: Record<RecurringStatus, string> = {
  active: "Aktivní",
  paused: "Pozastavená",
  canceled: "Zrušená",
};
/** Popisky plátců domény. */
export const DOMAIN_PAYER_LABELS: Record<DomainPayer, string> = {
  agency: "Agentura",
  client: "Klient",
};
/** Popisky stavů návrhu opakované faktury. */
export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: "Koncept",
  approved: "Schváleno",
  sent_to_fakturoid: "Odesláno do Fakturoidu",
  canceled: "Zrušeno",
};

/** Barvy stavů opakované služby (štítek `Chip`). */
export const RECURRING_STATUS_COLORS: Record<RecurringStatus, string> = {
  active: "green",
  paused: "orange",
  canceled: "gray",
};
