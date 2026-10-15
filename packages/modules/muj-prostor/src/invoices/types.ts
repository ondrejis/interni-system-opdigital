import type { InvoiceStatus, RecurringKind, RecurringPeriod } from "../labels";

/*
  Tvary výsledků příkazů opakovaných faktur (MPR-3): čisté typy bez zod, čte je UI i testy. Vstupy příkazů jsou
  v `contract.ts`. Peníze v haléřích (CZK), data `YYYY-MM-DD`.
*/

/** Řádek návrhu faktury s popisky služby a klienta. */
export type InvoiceRow = {
  id: string;
  serviceId: string;
  serviceName: string;
  serviceKind: RecurringKind;
  period: RecurringPeriod;
  companyId: string | null;
  companyName: string | null;
  periodFrom: string;
  periodTo: string;
  amountMinor: number;
  status: InvoiceStatus;
  fakturoidNumber: string | null;
  fakturoidUrl: string | null;
  /** Platba ve financích už vznikla. */
  hasPayment: boolean;
  /** Poslední chyba (Fakturoid, platba); u hotové faktury bez platby je to důvod, proč platba chybí. */
  error: string | null;
  approvedAt: string | null;
  /** Co se s řádkem dá udělat (UI tlačítka; server kontroluje znovu). */
  canEdit: boolean;
  canApprove: boolean;
  canCancel: boolean;
  canReopen: boolean;
  canRetryPayment: boolean;
};

/** Služba, které se nedá připravit návrh, a proč. */
export type BlockedService = {
  serviceId: string;
  name: string;
  companyName: string | null;
  reason: "no_price" | "no_company";
};

/** Nastavení Fakturoidu pro UI (bez tajemství). */
export type FakturoidStatus = {
  configured: boolean;
  /** `fake` = vývojový režim bez reálného účtu. */
  mode: "real" | "fake" | null;
  account: string | null;
  clientIdHint: string | null;
  contactEmail: string | null;
  status: "ok" | "reauth" | "error" | null;
};

/** Výsledek `muj-prostor.invoices.overview`. */
export type InvoicesOverview = {
  today: string;
  rows: InvoiceRow[];
  summary: {
    draftCount: number;
    draftTotalMinor: number;
    /** Schválené, ale ve Fakturoidu ještě nevytvořené (typicky po chybě). */
    pendingCount: number;
    sentCount: number;
    /** Hotové faktury bez platby ve financích. */
    withoutPaymentCount: number;
  };
  blocked: BlockedService[];
  fakturoid: FakturoidStatus;
};

/** Výsledek `muj-prostor.invoices.prepare`. */
export type PrepareResult = {
  created: number;
  existing: number;
  blocked: BlockedService[];
};

/** Výsledek `muj-prostor.invoices.approve`. */
export type ApproveResult = {
  id: string;
  fakturoidNumber: string;
  fakturoidUrl: string;
  /** Další obnova služby po posunu o období (`null`, když už byla posunutá jinak). */
  nextRenewal: string | null;
  /** Platba ve financích vznikla; `false` = faktura je hotová, platbu je třeba dodat (`error` říká proč). */
  paymentCreated: boolean;
  warning: string | null;
};

/** Výsledek `muj-prostor.fakturoid.test`. */
export type FakturoidTestResult =
  { ok: true; accountName: string; mode: "real" | "fake" } | { ok: false; message: string };
