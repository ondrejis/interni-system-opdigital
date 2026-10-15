import { z } from "zod";
import type { ServiceType, SplitRuleInput } from "@rebar/core/contracts";
import type {
  Allocation,
  BalanceMonth,
  DueState,
  PairDebt,
  PaymentTotals,
  ValidationIssue,
} from "./logic";

/*
  Kontrakt příkazů modulu „finance“ (FIN-B, M1): zod vstupy všech příkazů `finance.*` a tvary výstupů (typy). Čte ho UI
  (FIN-C, jen `import type`) i ostatní moduly. Peníze jsou v haléřích (CZK), data `YYYY-MM-DD`, měsíce `YYYY-MM`,
  id UUID. Čistá logika (rozdělení, saldo, splatnost, plán retaineru) je v `./logic`; tady jsou jen tvary pro příkazy.

  Společné konvence:
  - Příkazy, které mění částku, fakturujícího, pravidla nebo datum platby a tím přepočítají rozdělení, vracejí
    `MutationResult`: buď `ok`, nebo `needs_confirmation` (přepočet změní rozdělení už ZAPLACENÉ platby, FIN-13/SPOL-15).
    UI ukáže `changes` a zavolá příkaz znovu s `confirmRecalc: true`; do potvrzení se nic nezapíše.
  - Odpovědi, které ukazují lidi, nesou `people` (id → jméno), aby UI nemuselo číst uživatele zvlášť.
  - Soukromé záznamy (soukromá zakázka, platba bez zakázky) vidí jen vlastník; partner je v odpovědích nemá.
*/

const id = z.uuid();
const isoDate = z.iso.date();
const yearMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Měsíc ve tvaru RRRR-MM.");
const text = (max: number) => z.string().trim().max(max);
const minorPositive = z
  .number()
  .int()
  .positive("Částka musí být kladná.")
  .max(Number.MAX_SAFE_INTEGER);

/* ---------- společné hodnoty ---------- */

/** Druh platby, který se smí zadat ručně (`recurring` vzniká jen z Fakturoidu). */
export const manualKind = z.enum(["one_off", "intro", "retainer", "extra"]);
/** Stav platby. */
export const paymentStatus = z.enum(["planned", "issued", "paid", "canceled"]);
/** Základ výpočtu salda. */
export const balanceBasis = z.enum(["paid", "issued"]);
/** Způsob vyrovnání mezi partnery. */
export const settlementMethod = z.enum(["invoice", "transfer", "offset"]);
const paymentKindAll = z.enum(["one_off", "intro", "retainer", "extra", "recurring"]);

/** Pravidlo rozdělení (stejný tvar jako `SplitRuleInput` z kontraktů jádra). */
export const splitRuleInput = z.object({
  userId: id,
  mode: z.enum(["percent", "fixed_per_payment", "fixed_total"]),
  percent: z.number().min(0).max(100).optional(),
  fixedMinor: z.number().int().min(0).optional(),
  appliesTo: z.union([z.literal("all"), paymentKindAll]),
  validFrom: yearMonth.nullish(),
  validTo: yearMonth.nullish(),
}) satisfies z.ZodType<SplitRuleInput>;

/** Podíl jednoho člověka na platbě (ruční rozdělení). */
export const allocationInput = z.object({ userId: id, amountMinor: z.number().int().min(0) });

/* ---------- platby ---------- */

/** Seznam plateb s filtry (FIN-12). Součty (`totals`) se počítají přes celou vyfiltrovanou sadu, ne jen stránku. */
export const paymentListInput = z.object({
  /** Období (včetně obou konců) podle `dateField`. */
  period: z.object({ from: isoDate.optional(), to: isoDate.optional() }).optional(),
  /** Které datum se filtruje: `effective` = zaplaceno, jinak vystaveno, jinak splatnost. */
  dateField: z.enum(["effective", "issued", "paid", "due"]).default("effective"),
  statuses: z.array(paymentStatus).max(4).optional(),
  kinds: z.array(paymentKindAll).max(5).optional(),
  issuerId: id.optional(),
  /** Typ zakázky (web, marketing, systémy). */
  jobType: z.enum(["web", "marketing", "systemy"]).optional(),
  companyId: id.optional(),
  jobId: id.optional(),
  /** Jen vystavené po splatnosti (R-40). */
  overdueOnly: z.boolean().default(false),
  search: text(120).optional(),
  /** Vlastník: zahrnout soukromé platby (výchozí ano). Partner je nevidí nikdy. */
  includePrivate: z.boolean().default(true),
  sort: z
    .enum(["createdAt", "description", "amountMinor", "status", "dueOn", "issuedOn", "paidOn"])
    .default("createdAt"),
  direction: z.enum(["asc", "desc"]).default("desc"),
  limit: z.number().int().min(1).max(500).default(100),
  offset: z.number().int().min(0).default(0),
});
/** Detail jedné platby. */
export const paymentGetInput = z.object({ id });

const paymentCreateBase = z.object({
  jobId: id,
  description: z.string().trim().min(1, "Vyplňte popis platby.").max(200),
  kind: manualKind.default("one_off"),
  amountMinor: minorPositive,
  /** Kdo fakturuje (dostane peníze a haléře po zaokrouhlení). */
  issuerId: id,
  /** Měsíc, za který platba je; u druhu `retainer` povinný (určuje platnost pravidel). */
  periodMonth: yearMonth.nullish(),
  /** U plánované platby plánované datum vystavení, jinak skutečné. */
  issuedOn: isoDate.nullish(),
  dueOn: isoDate.nullish(),
  note: text(2000).nullish(),
  /** Stav při založení (výchozí Plánovaná); Vystavená a Zaplacená vyžadují číslo faktury. */
  status: z.enum(["planned", "issued", "paid"]).default("planned"),
  invoiceNumber: text(80).nullish(),
  invoiceUrl: z.string().trim().max(500).nullish(),
  paidOn: isoDate.nullish(),
  /** Ruční rozdělení (štítek „Rozděleno ručně“); vyžaduje `finance.splits_edit`. */
  allocations: z.array(allocationInput).max(10).optional(),
  confirmRecalc: z.boolean().default(false),
});
/** Založení platby (ručně). */
export const paymentCreateInput = paymentCreateBase.superRefine((v, ctx) => {
  if (v.kind === "retainer" && !v.periodMonth)
    ctx.addIssue({
      code: "custom",
      path: ["periodMonth"],
      message: "U retaineru vyplňte měsíc, za který platba je.",
    });
  if (v.status !== "planned" && !v.invoiceNumber?.trim())
    ctx.addIssue({
      code: "custom",
      path: ["invoiceNumber"],
      message: "Vyplňte číslo faktury.",
    });
});

/** Úprava platby; chybějící pole se nemění, `null` pole vymaže. Změna částky, fakturujícího nebo dat přepočítá rozdělení. */
export const paymentUpdateInput = z
  .object({
    id,
    description: z.string().trim().min(1).max(200).optional(),
    kind: manualKind.optional(),
    amountMinor: minorPositive.optional(),
    issuerId: id.optional(),
    periodMonth: yearMonth.nullish(),
    issuedOn: isoDate.nullish(),
    dueOn: isoDate.nullish(),
    paidOn: isoDate.nullish(),
    invoiceNumber: text(80).nullish(),
    invoiceUrl: z.string().trim().max(500).nullish(),
    note: text(2000).nullish(),
    /** Nové ruční rozdělení (při změně částky ručně rozdělené platby povinné, nebo `resetAllocation`). */
    allocations: z.array(allocationInput).max(10).optional(),
    /** Vrátit rozdělení podle pravidel zakázky. */
    resetAllocation: z.boolean().optional(),
    confirmRecalc: z.boolean().default(false),
  })
  .refine(
    (v) =>
      Object.entries(v).some(
        ([k, val]) => k !== "id" && k !== "confirmRecalc" && val !== undefined,
      ),
    { message: "Není co uložit." },
  );

/** Přechod stavu: Plánovaná → Vystavená (číslo faktury, datum) → Zaplacená (datum úhrady), nebo Zrušená; i zpět o stupeň. */
export const paymentTransitionInput = z.object({
  id,
  to: paymentStatus,
  invoiceNumber: text(80).nullish(),
  invoiceUrl: z.string().trim().max(500).nullish(),
  issuedOn: isoDate.nullish(),
  dueOn: isoDate.nullish(),
  paidOn: isoDate.nullish(),
  confirmRecalc: z.boolean().default(false),
});

/** Ruční přepis rozdělení jedné platby (`allocations`), nebo návrat k pravidlům (`null`). */
export const paymentOverrideInput = z.object({
  id,
  allocations: z.array(allocationInput).max(10).nullable(),
  confirmRecalc: z.boolean().default(false),
});
/** Přepočet rozdělení všech plateb zakázky podle pravidel (po změně pravidel nebo dat). */
export const paymentRecalcInput = z.object({
  jobId: id,
  confirmRecalc: z.boolean().default(false),
});

/* ---------- pravidla rozdělení ---------- */

export const splitGetInput = z.object({ jobId: id });
export const splitSetInput = z.object({
  jobId: id,
  rules: z.array(splitRuleInput).max(30),
  confirmRecalc: z.boolean().default(false),
});
/** Živý náhled „Z platby 10 000 Kč dostane Ondřej 6 000 Kč, Patrik 4 000 Kč.“ (FIN-04). */
export const splitPreviewInput = z.object({
  amountMinor: minorPositive.default(1_000_000),
  kind: manualKind.default("one_off"),
  /** Kdo fakturuje; bez něj se použije první osoba z pravidel. */
  issuerId: id.optional(),
  month: yearMonth.optional(),
  rules: z.array(splitRuleInput).max(30),
});
/** Výchozí pravidla nových zakázek (Nastavení → Finance). */
export const splitDefaultInput = z.object({});

/* ---------- retainer ---------- */

/** Pokračovat na retainer (ZAK-14): měsíční částka, od kdy, den vystavení, kdo fakturuje, rozdělení. */
export const retainerContinueInput = z.object({
  jobId: id,
  amountMinor: minorPositive,
  fromMonth: yearMonth,
  issueDay: z.number().int().min(1).max(28),
  issuerMode: z.enum(["fixed", "alternate"]),
  /** Při `fixed` fakturující, při `alternate` druhý v pořadí (kdo začíná je `firstIssuerId`). */
  issuerId: id,
  firstIssuerId: id.optional(),
  /** Pravidla rozdělení retaineru (pak platí jen pro druh `retainer`); vyžaduje `finance.splits_edit`. */
  split: z.array(splitRuleInput).max(30).optional(),
});
/** Změna retaineru od měsíce `effectiveFrom` (výchozí aktuální): upraví se i již založené plánované platby od něj dál. */
export const retainerChangeInput = z.object({
  jobId: id,
  effectiveFrom: yearMonth.optional(),
  amountMinor: minorPositive.optional(),
  issueDay: z.number().int().min(1).max(28).optional(),
  issuerMode: z.enum(["fixed", "alternate"]).optional(),
  issuerId: id.optional(),
  firstIssuerId: id.nullish(),
  split: z.array(splitRuleInput).max(30).optional(),
});
/** Dopad ukončení retaineru k měsíci (dotaz před potvrzením, ZAK-17). */
export const retainerEndPreviewInput = z.object({ jobId: id, endMonth: yearMonth });
/**
 * Ukončit retainer. Bez retaineru (volba „Ukončit“ po vyhodnocení úvodní fáze) jen ukončí marketingovou fázi a zakázku.
 * S retainerem nastaví poslední měsíc, zruší budoucí plánované platby a zakázku dokončí (důvod „retainer_ended“),
 * končí-li k aktuálnímu nebo dřívějšímu měsíci; jinak ji dokončí měsíční úloha po posledním měsíci.
 */
export const retainerEndInput = z.object({
  jobId: id,
  endMonth: yearMonth.optional(),
  /** Zrušit plánované platby po `endMonth` (potvrzení z dialogu). */
  cancelPlanned: z.boolean().default(true),
  /** Dokončit zakázku, končí-li retainer už teď. */
  closeJob: z.boolean().default(true),
});

/* ---------- přehled zakázky a klienta ---------- */

/** Záložka Finance v detailu zakázky: pravidla, platby, součty a retainer. */
export const jobOverviewInput = z.object({ jobId: id });
/** Záložka Finance na kartě klienta: platby všech zakázek, součty za rok a celkem, retainery. */
export const clientOverviewInput = z.object({
  companyId: id,
  year: z.number().int().min(2000).max(2200).optional(),
});

/* ---------- vyrovnání ---------- */

export const settlementCreateInput = z
  .object({
    fromUserId: id,
    toUserId: id,
    amountMinor: minorPositive,
    settledOn: isoDate,
    method: settlementMethod,
    /** Číslo dokladu (faktura mezi IČO, číslo převodu…). */
    reference: text(120).nullish(),
    note: text(2000).nullish(),
  })
  .refine((v) => v.fromUserId !== v.toUserId, {
    message: "Vyrovnání musí mít dvě různé osoby.",
    path: ["toUserId"],
  });
/** Storno vyrovnání (měkké; záznam zůstane v historii a přestane se počítat). */
export const settlementCancelInput = z.object({ id, reason: text(500).optional() });
export const settlementListInput = z.object({
  includeCanceled: z.boolean().default(true),
  limit: z.number().int().min(1).max(500).default(100),
});
export const balanceInput = z.object({ basis: balanceBasis.optional() });
/** Měsíční rozpis; s `month` navíc konkrétní platby toho měsíce (rozklik). */
export const balanceMonthsInput = z.object({
  basis: balanceBasis.optional(),
  month: yearMonth.optional(),
});

/* ---------- přehledy a nastavení ---------- */

export const reportsInput = z.object({
  year: z.number().int().min(2000).max(2200).optional(),
  /** Vlastník: zahrnout soukromé zakázky a platby bez zakázky (výchozí ne). */
  includePrivate: z.boolean().default(false),
  basis: balanceBasis.default("paid"),
});
export const settingsGetInput = z.object({});
export const settingsSetInput = z
  .object({
    balanceBasis: balanceBasis.optional(),
    /** Výchozí rozdělení nových zakázek; `null` = nenastaveno (použije se 50/50 mezi vlastníkem a partnerem). */
    defaultSplit: z.array(splitRuleInput).max(30).nullable().optional(),
  })
  .refine((v) => v.balanceBasis !== undefined || v.defaultSplit !== undefined, {
    message: "Není co uložit.",
  });

/* ---------- výstupy ---------- */

/** Člověk v odpovědích: celé jméno, křestní jméno (do vět „Z platby … dostane Ondřej …“) a zkratka. */
export type PersonRef = { id: string; name: string; firstName: string; shortName: string | null };
/** Lidé podle id. */
export type People = Record<string, PersonRef>;

/** Řádek platby v seznamech a detailech. */
export type PaymentRow = {
  id: string;
  jobId: string | null;
  jobNumber: string | null;
  jobTitle: string | null;
  jobType: ServiceType | null;
  companyId: string | null;
  companyName: string | null;
  description: string;
  kind: "one_off" | "intro" | "retainer" | "extra" | "recurring";
  periodMonth: string | null;
  amountMinor: number;
  issuerId: string | null;
  status: "planned" | "issued" | "paid" | "canceled";
  invoiceNumber: string | null;
  invoiceUrl: string | null;
  issuedOn: string | null;
  dueOn: string | null;
  paidOn: string | null;
  /** `manual` = „Rozděleno ručně“. */
  allocationMode: "rules" | "manual";
  source: "manual" | "template" | "retainer" | "fakturoid";
  retainerId: string | null;
  note: string | null;
  isPrivate: boolean;
  /** Po splatnosti (vystavená, červeně), plánovaná po termínu (jen upozornění), v pořádku, bez splatnosti. */
  dueState: DueState;
  allocations: Allocation[];
  createdAt: string;
};

/** Výsledek `finance.payment.list`. */
export type PaymentListResult = {
  rows: PaymentRow[];
  /** Počet plateb po filtru (bez stránkování). */
  total: number;
  /** Součty přes celou vyfiltrovanou sadu (patička tabulky, FIN-12). */
  totals: PaymentTotals;
  people: People;
};

/** Změna rozdělení platby při přepočtu. */
export type AllocationChange = {
  paymentId: string;
  description: string;
  status: "planned" | "issued" | "paid" | "canceled";
  before: Allocation[];
  after: Allocation[];
};

/**
 * Výsledek příkazů, které mohou přepočítat rozdělení: `ok`, nebo `needs_confirmation` (nic nezapsáno; `changes` jsou
 * zaplacené platby, jejichž rozdělení by se změnilo; UI zavolá příkaz znovu s `confirmRecalc: true`).
 */
export type MutationResult<T> =
  | ({ status: "ok"; warnings: ValidationIssue[]; recalculated: number } & T)
  | { status: "needs_confirmation"; changes: AllocationChange[] };

/** Detail platby (`finance.payment.get`) a výsledek jejích příkazů. */
export type PaymentDetail = {
  payment: PaymentRow;
  /** Klíče pravidel (id), podle kterých se platba rozdělila. */
  appliedRuleIds: string[];
  warnings: ValidationIssue[];
  people: People;
};
/** Výsledek `finance.payment.create/update/transition/overrideAllocation`. */
export type PaymentMutation = MutationResult<{ payment: PaymentRow; people: People }>;
/** Výsledek `finance.payment.recalc`. */
export type RecalcResult = MutationResult<Record<string, never>>;

/** Pravidlo rozdělení v odpovědích (s id a pořadím). */
export type SplitRuleView = SplitRuleInput & { id: string; position: number };
/** Výsledek `finance.split.get`. */
export type SplitGetResult = {
  rules: SplitRuleView[];
  /** Chyby a upozornění pravidel (např. součet procent pod 100 %). */
  issues: ValidationIssue[];
  /** Aktér smí pravidla měnit (`finance.splits_edit`). */
  canEdit: boolean;
  people: People;
};
/** Výsledek `finance.split.set`. */
export type SplitSetResult = MutationResult<{ rules: SplitRuleView[] }>;
/** Výsledek `finance.split.preview` (bez podrobností výpočtu). */
export type SplitPreviewResult = {
  text: string;
  allocations: Allocation[];
  warnings: ValidationIssue[];
  error: string | null;
};
/** Výsledek `finance.split.default`. */
export type SplitDefaultResult = {
  rules: SplitRuleInput[];
  /** `false` = v Nastavení není zadáno, rozdělení je odvozeno (50/50 mezi vlastníkem a partnerem). */
  configured: boolean;
  people: People;
};

/** Retainer zakázky. */
export type RetainerView = {
  id: string;
  jobId: string;
  amountMinor: number;
  fromMonth: string;
  toMonth: string | null;
  issueDay: number;
  issuerMode: "fixed" | "alternate";
  issuerId: string;
  firstIssuerId: string | null;
  active: boolean;
};
/** Výsledek `finance.retainer.continue`. */
export type RetainerContinueResult = {
  retainer: RetainerView;
  paymentIds: string[];
  warnings: ValidationIssue[];
};
/** Výsledek `finance.retainer.change`. */
export type RetainerChangeResult = {
  retainer: RetainerView;
  /** Kolik již založených plánovaných plateb se upravilo. */
  updatedPayments: number;
  warnings: ValidationIssue[];
};
/** Dopad ukončení retaineru (`finance.retainer.endPreview`). */
export type RetainerEndPreview = {
  /** Plánované platby po `endMonth`, které se zruší. */
  cancel: { id: string; periodMonth: string; description: string; amountMinor: number }[];
  /** Platby po `endMonth`, které už jsou vystavené nebo zaplacené a zůstanou (vyřeší se ručně). */
  kept: { id: string; periodMonth: string; description: string; status: string }[];
  /** Zakázka se po ukončení hned dokončí (končí k aktuálnímu nebo dřívějšímu měsíci). */
  closesJobNow: boolean;
};
/** Výsledek `finance.retainer.end`. */
export type RetainerEndResult = {
  canceledPaymentIds: string[];
  keptPaymentIds: string[];
  /** Zakázka dokončena; `null`, když ještě běží do posledního měsíce. UI nabídne klienta Bývalý, když `!clientHasOtherActiveJob`. */
  completed: { openTasks: number; unpaidPayments: number; clientHasOtherActiveJob: boolean } | null;
};

/** Záložka Finance v detailu zakázky. */
export type JobFinanceOverview = {
  job: {
    id: string;
    number: string;
    title: string;
    type: ServiceType;
    companyId: string | null;
    status: string;
    billingModel: string;
    marketingStage: string | null;
    isPrivate: boolean;
  };
  rules: SplitRuleView[];
  ruleIssues: ValidationIssue[];
  payments: PaymentRow[];
  totals: PaymentTotals;
  retainer: RetainerView | null;
  /** Po vyhodnocení úvodní fáze čeká volba Pokračovat / Ukončit. */
  decisionPending: boolean;
  /** Aktér smí: zapisovat platby, upravovat pravidla. */
  canWrite: boolean;
  canEditSplit: boolean;
  people: People;
};

/** Záložka Finance na kartě klienta. */
export type ClientFinanceOverview = {
  companyId: string;
  year: number;
  /** Zaplaceno v roce, za posledních 12 měsíců a celkem (jen viditelné zakázky). */
  paidYearMinor: number;
  paid12mMinor: number;
  paidTotalMinor: number;
  unpaidCount: number;
  unpaidMinor: number;
  /** Aktivní měsíční retainery klienta. */
  retainers: (RetainerView & { jobNumber: string; jobTitle: string })[];
  payments: PaymentRow[];
  totals: PaymentTotals;
  people: People;
};

/** Řádek vyrovnání. */
export type SettlementRow = {
  id: string;
  fromUserId: string;
  toUserId: string;
  amountMinor: number;
  settledOn: string;
  method: "invoice" | "transfer" | "offset";
  reference: string | null;
  note: string | null;
  canceledAt: string | null;
  createdAt: string;
};
/** Výsledek `finance.settlement.list`. */
export type SettlementListResult = { rows: SettlementRow[]; people: People };

/** Souhrn za osobu (součet přes všechny měsíce vyrovnání). */
export type PersonBalanceRow = {
  userId: string;
  /** Kolik osoba vyfakturovala (přijala od klientů). */
  invoicedMinor: number;
  /** Kolik jí z plateb patří. */
  entitledMinor: number;
  /** Fakturoval − patří mu (kladné = drží víc, než mu patří). */
  differenceMinor: number;
};
/** Výsledek `finance.balance` (hlavní číslo vyrovnání). */
export type BalanceView = {
  basis: "paid" | "issued";
  /** „Patrik dluží Ondřejovi 12 400 Kč“, nebo „Vyrovnáno“. */
  headlineText: string;
  headline: PairDebt | null;
  pairs: PairDebt[];
  /** Dluhy před zápočtem vyrovnání. */
  grossPairs: PairDebt[];
  settlementsApplied: number;
  perPerson: PersonBalanceRow[];
  /** Předvyplnění „Zapsat vyrovnání“ (dlužník → věřitel, částka = saldo); `null`, když je vyrovnáno. */
  suggestedSettlement: { fromUserId: string; toUserId: string; amountMinor: number } | null;
  /** Zapsaná vyrovnání (včetně stornovaných). */
  settlements: SettlementRow[];
  people: People;
};
/** Výsledek `finance.balance.months`. */
export type BalanceMonthsResult = {
  basis: "paid" | "issued";
  months: BalanceMonth[];
  /** Platby zvoleného měsíce (jen když je zadán `month`). */
  payments: PaymentRow[] | null;
  people: People;
};

/** Měsíční příjem osoby (`monthly[0]` = leden). */
export type IncomeByPersonRow = { userId: string; monthly: number[]; totalMinor: number };
/** Příjem podle typu zakázky (`recurring` = platby z Fakturoidu bez zakázky). */
export type IncomeByTypeRow = {
  type: ServiceType | "recurring";
  amountMinor: number;
  count: number;
  byPerson: Record<string, number>;
};
/** Klient v žebříčku. */
export type TopClientRow = {
  companyId: string;
  companyName: string | null;
  amountMinor: number;
  count: number;
};
/** Měsíční příjem z retainerů: `paidMinor` zaplaceno, `openMinor` vystaveno a plánováno (`month` = `YYYY-MM`). */
export type RetainerIncomeRow = {
  month: string;
  paidMinor: number;
  openMinor: number;
  count: number;
};
/** Výsledek `finance.reports` (FIN-19). */
export type ReportsResult = {
  year: number;
  basis: "paid" | "issued";
  includePrivate: boolean;
  incomeByPerson: { rows: IncomeByPersonRow[]; totalsByMonth: number[]; totalMinor: number };
  incomeByType: IncomeByTypeRow[];
  topClients: TopClientRow[];
  retainerIncome: RetainerIncomeRow[];
  people: People;
};

/** Výsledek `finance.settings.get`. */
export type FinanceSettings = {
  balanceBasis: "paid" | "issued";
  defaultSplit: SplitRuleInput[];
  /** `false` = výchozí rozdělení není zadáno a je odvozeno (50/50). */
  defaultSplitConfigured: boolean;
  people: People;
};
