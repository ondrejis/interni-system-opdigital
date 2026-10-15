# @rebar/finance/api

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/finance/api` (soubor `packages/modules/finance/src/api.ts`). Exportů: 8, z toho s popisem 8.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`financeService`](#financeservice) | function | Služba `finance` pro ostatní moduly (D §2.3): zakázky, klienti, hodiny, můj prostor. |  |
| [`BalanceView`](#balanceview) | type | Výsledek `finance.balance` (hlavní číslo vyrovnání). |  |
| [`ClientFinanceOverview`](#clientfinanceoverview) | type | Záložka Finance na kartě klienta. |  |
| [`JobFinanceOverview`](#jobfinanceoverview) | type | Záložka Finance v detailu zakázky. |  |
| [`PaymentRow`](#paymentrow) | type | Řádek platby v seznamech a detailech. |  |
| [`People`](#people) | type | Lidé podle id. |  |
| [`PersonRef`](#personref) | type | Člověk v odpovědích: celé jméno, křestní jméno (do vět „Z platby … dostane Ondřej …“) a zkratka. |  |
| [`RetainerView`](#retainerview) | type | Retainer zakázky. |  |

### financeService

function · `packages/modules/finance/src/data/finance-service.ts`

Služba `finance` pro ostatní moduly (D §2.3): zakázky, klienti, hodiny, můj prostor.

```ts
function financeService(deps: ModuleDeps): ServiceMap["finance"]
```

### BalanceView

type · `packages/modules/finance/src/contract.ts`

Výsledek `finance.balance` (hlavní číslo vyrovnání).

```ts
type BalanceView = {
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
```

### ClientFinanceOverview

type · `packages/modules/finance/src/contract.ts`

Záložka Finance na kartě klienta.

```ts
type ClientFinanceOverview = {
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
```

### JobFinanceOverview

type · `packages/modules/finance/src/contract.ts`

Záložka Finance v detailu zakázky.

```ts
type JobFinanceOverview = {
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
```

### PaymentRow

type · `packages/modules/finance/src/contract.ts`

Řádek platby v seznamech a detailech.

```ts
type PaymentRow = {
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
```

### People

type · `packages/modules/finance/src/contract.ts`

Lidé podle id.

```ts
type People = Record<string, PersonRef>;
```

### PersonRef

type · `packages/modules/finance/src/contract.ts`

Člověk v odpovědích: celé jméno, křestní jméno (do vět „Z platby … dostane Ondřej …“) a zkratka.

```ts
type PersonRef = { id: string; name: string; firstName: string; shortName: string | null };
```

### RetainerView

type · `packages/modules/finance/src/contract.ts`

Retainer zakázky.

```ts
type RetainerView = {
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
```
