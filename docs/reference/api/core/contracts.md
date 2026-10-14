# @rebar/core/contracts

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/core/contracts` (soubor `packages/core/src/contracts/index.ts`). Exportů: 46, z toho s popisem 46.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`phoneSearchKeys`](#phonesearchkeys) | function | Klíče pro hledání telefonu (`search_document.search_text`): jen číslice bez předvolby, tedy posledních 9 číslic (celé číslo, když je kratší). Hledaný text se normalizuje stejně a hledá se podčástí, takže „777 12“ najde „+420 777 123 456“. Číslo s méně než třemi číslicemi se neindexuje. |  |
| [`renderEmailTemplate`](#renderemailtemplate) | function | Předmět a text zprávy z šablony. Hodnoty se dosazují jako text (nikdy HTML); předmět je jednořádkový, konce řádků v textu se sjednotí na `\n`. |  |
| [`renderTemplate`](#rendertemplate) | function | Dosadí proměnné `{klic}` do textu; neznámá proměnná zůstane v textu beze změny, prázdná hodnota se dosadí jako prázdný text. |  |
| [`toE164`](#toe164) | function | Telefon ve tvaru E.164 (`+420777123456`), nebo `null`, když to není platné číslo. Číslo bez předvolby se čte v zemi `cc` (výchozí CZ), číslo s `+` nebo `00` si zemi nese samo. Ukládá se do `person_contact_point.value_norm`. |  |
| [`unknownVariables`](#unknownvariables) | function | Proměnné v textu, které nejsou mezi `known` (překlep: `{castak}`); pro kontrolu při ukládání šablony. |  |
| [`NotImplementedError`](#notimplementederror) | class | Vyhodí tělo veřejné funkce modulu, které ještě nikdo nenaprogramoval (kostra S0). |  |
| [`CLIENT_ACTIONS`](#client_actions) | const | Pořadí akcí v hlavičce karty klienta (`recordActions.company`, `order`). |  |
| [`CLIENT_OVERVIEW_ORDER`](#client_overview_order) | const | Pořadí karet na Přehledu klienta (`recordOverview.company`, `order`). |  |
| [`CLIENT_TABS`](#client_tabs) | const | Záložky karty klienta (`company` s `client_status`): každý modul přidává jen svou záložku (`recordTabs.company`) a musí použít `id` a `order` odsud. Prázdné záložky se skrývají podle `tabCounts`. |  |
| [`WEBHOOK_EVENTS`](#webhook_events) | const | Události, které odcházejí i jako webhooky (ostatní jsou jen interní mezi moduly). `drive.*` jen endpointům `drive.*`. |  |
| [`BillingModel`](#billingmodel) | type | Způsob fakturace zakázky. `hourly` je jen příznak bez automatiky (R-25). |  |
| [`ClientListMetrics`](#clientlistmetrics) | type | Sloupce tabulky klientů, které počítají jiné moduly (podle zobrazujícího: soukromé se nezapočítají). |  |
| [`ClientSnap`](#clientsnap) | type | Snímek klienta v událostech `client.*`. |  |
| [`ClientStatus`](#clientstatus) | type | Stav klienta (`company.client_status`); `null` = organizace není klient. |  |
| [`ClientSummary`](#clientsummary) | type | Souhrn na Přehledu klienta; každý poskytovatel doplní jen svou část. |  |
| [`ClientTabId`](#clienttabid) | type | Identifikátor záložky karty klienta. |  |
| [`ClientTabProvider`](#clienttabprovider) | type | Příspěvek modulu ke kartě klienta (`ModuleServer.contributions.clientCard`). Čte ho modul `klienti`; implementace musí respektovat soukromé záznamy (`privateScope`) a mít záznam v `privatePaths`. |  |
| [`ContributionKey`](#contributionkey) | type | Klíč příspěvku. |  |
| [`ContributionMap`](#contributionmap) | type | Příspěvky modulů, které čte jiný modul (server): modul přidává, hostitel o něm neví. Klíč je v `ModuleServer.contributions`, čte se `deps.services.all("<klíč>")`. |  |
| [`CreateMeetingInput`](#createmeetinginput) | type | Vstup `tasks.createMeeting` (schůzka z kalendáře = úkol typu Schůzka). |  |
| [`DealSnap`](#dealsnap) | type | Minimální snímky záznamů, které putují v událostech a ve webhookech (nikdy celé řádky). |  |
| [`DomainActor`](#domainactor) | type | Kdo událost způsobil. |  |
| [`DomainEvent`](#domainevent) | type | Událost tak, jak ji dostane `eventHandlers` modulu (a jak se serializuje do webhooku). |  |
| [`DomainEventEntity`](#domainevententity) | type | Záznam, ke kterému se událost vztahuje (`isPrivate` rozhoduje o webhookách a realtime). |  |
| [`DomainEventMap`](#domaineventmap) | type | Katalog doménových událostí OPSYS (D §2.2). Klíč je název události, hodnota payload `data`. Přidávat smí jen architekt; události označené ve `WEBHOOK_EVENTS` odcházejí i jako webhooky (podepsané, viz C2). |  |
| [`DomainEventName`](#domaineventname) | type | Název doménové události. |  |
| [`DriveEventData`](#driveeventdata) | type | Data událostí pro složky na Google Disku (`drive.*`); odesílají se n8n a v odpovědi se volá callback. |  |
| [`DriveState`](#drivestate) | type | Stav složky na Google Disku u klienta nebo zakázky. |  |
| [`EmailEntityType`](#emailentitytype) | type | Entity, ze kterých jde napsat e-mail ze šablony. |  |
| [`EmailVarsProvider`](#emailvarsprovider) | type | Proměnné šablon e-mailů, které modul nabízí pro entitu (`{jmeno}`, `{firma}`…). Přispívá kontakty, obchody, zakázky a jádro (`odesilatel`); čte `sablony-emailu` a `muj-prostor` (`ModuleServer.contributions.emailVars`). |  |
| [`JobStatus`](#jobstatus) | type | Stav zakázky (pipeline `job/status`). |  |
| [`MarketingStage`](#marketingstage) | type | Fáze marketingové zakázky (úvod → rozhodnutí → retainer → konec). |  |
| [`PaymentKind`](#paymentkind) | type | Druh platby. |  |
| [`PaymentSnap`](#paymentsnap) | type | Snímek platby v událostech `payment.*`. |  |
| [`ProjectSnap`](#projectsnap) | type | Snímek zakázky v událostech `project.*`. |  |
| [`RetainerSetup`](#retainersetup) | type | Nastavení retaineru při založení zakázky („Rovnou retainer“, R-36). |  |
| [`ServiceKey`](#servicekey) | type | Klíč služby. |  |
| [`ServiceMap`](#servicemap) | type | Služby, které modul nabízí ostatním (D §2.3). Volají se přes `deps.services.optional("<klíč>")` — vypnutý nebo zatím nehotový modul službu nemá. Typ je tady v jádru, aby ho konzument nemusel importovat z cizího modulu. |  |
| [`ServiceType`](#servicetype) | type | Typ služby (zakázky i klientova nabídka). Hodnoty jsou kód, popisky se doplňují v UI. |  |
| [`SlotMap`](#slotmap) | type | Sloty, do kterých moduly přispívají komponentami (`ModuleUi.slots`) a které hostitel vykreslí přes `<Slot name="…" />` z `@rebar/ui`. Hostitel o přispěvatelích neví. Klíč je název slotu, hodnota props komponenty. |  |
| [`SlotName`](#slotname) | type | Název slotu. |  |
| [`SplitRuleInput`](#splitruleinput) | type | Pravidlo rozdělení platby mezi dvě osoby (vstup editoru rozdělení). |  |
| [`TaskSnap`](#tasksnap) | type | Snímek úkolu v událostech `task.*`. |  |
| [`TemplatePaymentInput`](#templatepaymentinput) | type | Platba z šablony zakázky (vstup `finance.initJobFinance`). |  |
| [`TemplateTaskInput`](#templatetaskinput) | type | Úkol z šablony zakázky (vstup `tasks.createFromTemplate`). |  |
| [`YearMonth`](#yearmonth) | type | Měsíc ve tvaru `YYYY-MM`, např. `2026-12`. |  |

### phoneSearchKeys

function · `packages/core/src/contracts/phone.ts`

Klíče pro hledání telefonu (`search_document.search_text`): jen číslice bez předvolby, tedy posledních 9 číslic
(celé číslo, když je kratší). Hledaný text se normalizuje stejně a hledá se podčástí, takže „777 12“ najde
„+420 777 123 456“. Číslo s méně než třemi číslicemi se neindexuje.

```ts
function phoneSearchKeys(raw: string): string[]
```

### renderEmailTemplate

function · `packages/core/src/contracts/email-vars.ts`

Předmět a text zprávy z šablony. Hodnoty se dosazují jako text (nikdy HTML); předmět je jednořádkový,
konce řádků v textu se sjednotí na `\n`.

```ts
function renderEmailTemplate(tpl: { subject: string; body: string }, vars: Partial<Record<string, string>>): { subject: string; body: string }
```

### renderTemplate

function · `packages/core/src/contracts/email-vars.ts`

Dosadí proměnné `{klic}` do textu; neznámá proměnná zůstane v textu beze změny, prázdná hodnota se dosadí jako prázdný text.

```ts
function renderTemplate(text: string, vars: Partial<Record<string, string>>): string
```

### toE164

function · `packages/core/src/contracts/phone.ts`

Telefon ve tvaru E.164 (`+420777123456`), nebo `null`, když to není platné číslo. Číslo bez předvolby se čte
v zemi `cc` (výchozí CZ), číslo s `+` nebo `00` si zemi nese samo. Ukládá se do `person_contact_point.value_norm`.

```ts
function toE164(raw: string, cc: string = "CZ"): string | null
```

### unknownVariables

function · `packages/core/src/contracts/email-vars.ts`

Proměnné v textu, které nejsou mezi `known` (překlep: `{castak}`); pro kontrolu při ukládání šablony.

```ts
function unknownVariables(text: string, known: Iterable<string>): string[]
```

### NotImplementedError

class · `packages/core/src/contracts/types.ts`

Vyhodí tělo veřejné funkce modulu, které ještě nikdo nenaprogramoval (kostra S0).

```ts
class NotImplementedError extends Error {
  constructor(what: string);
}
```

### CLIENT_ACTIONS

const · `packages/core/src/contracts/client-card.ts`

Pořadí akcí v hlavičce karty klienta (`recordActions.company`, `order`).

```ts
const CLIENT_ACTIONS: { readonly disk: 10; readonly call: 20; readonly email: 30; readonly web: 40; readonly task: 50; readonly note: 60; readonly job: 70; readonly deal: 80; }
```

### CLIENT_OVERVIEW_ORDER

const · `packages/core/src/contracts/client-card.ts`

Pořadí karet na Přehledu klienta (`recordOverview.company`, `order`).

```ts
const CLIENT_OVERVIEW_ORDER: { readonly kontakty: 10; readonly zakazky: 20; readonly obchody: 30; readonly ukoly: 40; readonly finance: 50; readonly udalosti: 90; }
```

### CLIENT_TABS

const · `packages/core/src/contracts/client-card.ts`

Záložky karty klienta (`company` s `client_status`): každý modul přidává jen svou záložku (`recordTabs.company`)
a musí použít `id` a `order` odsud. Prázdné záložky se skrývají podle `tabCounts`.

```ts
const CLIENT_TABS: { readonly prehled: 0; readonly kontext: 10; readonly kontakty: 20; readonly zakazky: 30; readonly obchody: 40; readonly ukoly: 50; readonly poznamky: 60; readonly finance: 70; readonly reklama: 80; readonly hosting: 90; readonly historie:…
```

### WEBHOOK_EVENTS

const · `packages/core/src/contracts/events.ts`

Události, které odcházejí i jako webhooky (ostatní jsou jen interní mezi moduly). `drive.*` jen endpointům `drive.*`.

```ts
const WEBHOOK_EVENTS: readonly DomainEventName[]
```

### BillingModel

type · `packages/core/src/contracts/types.ts`

Způsob fakturace zakázky. `hourly` je jen příznak bez automatiky (R-25).

```ts
type BillingModel = "one_off" | "intro_then_retainer" | "retainer" | "hourly";
```

### ClientListMetrics

type · `packages/core/src/contracts/client-card.ts`

Sloupce tabulky klientů, které počítají jiné moduly (podle zobrazujícího: soukromé se nezapočítají).

```ts
type ClientListMetrics = {
  activeJobs: number;
  income12mMinor: number;
  lastActivityAt: string | null;
  driveState: DriveState;
};
```

### ClientSnap

type · `packages/core/src/contracts/types.ts`

Snímek klienta v událostech `client.*`.

```ts
type ClientSnap = {
  id: string;
  name: string;
  ico: string | null;
  status: ClientStatus | null;
  /** Datum prvního přechodu do stavu `active` (`YYYY-MM-DD`). */
  since: string | null;
};
```

### ClientStatus

type · `packages/core/src/contracts/types.ts`

Stav klienta (`company.client_status`); `null` = organizace není klient.

```ts
type ClientStatus = "lead" | "active" | "paused" | "former";
```

### ClientSummary

type · `packages/core/src/contracts/client-card.ts`

Souhrn na Přehledu klienta; každý poskytovatel doplní jen svou část.

```ts
type ClientSummary = {
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
```

### ClientTabId

type · `packages/core/src/contracts/client-card.ts`

Identifikátor záložky karty klienta.

```ts
type ClientTabId = keyof typeof CLIENT_TABS;
```

### ClientTabProvider

type · `packages/core/src/contracts/client-card.ts`

Příspěvek modulu ke kartě klienta (`ModuleServer.contributions.clientCard`). Čte ho modul `klienti`;
implementace musí respektovat soukromé záznamy (`privateScope`) a mít záznam v `privatePaths`.

```ts
type ClientTabProvider = {
  tabCounts?(ctx: Ctx, companyId: string): Promise<Partial<Record<ClientTabId, number>>>;
  summary?(ctx: Ctx, companyId: string): Promise<Partial<ClientSummary>>;
  listMetrics?(ctx: Ctx, companyIds: string[]): Promise<Record<string, Partial<ClientListMetrics>>>;
};
```

### ContributionKey

type · `packages/core/src/contracts/services.ts`

Klíč příspěvku.

```ts
type ContributionKey = keyof ContributionMap;
```

### ContributionMap

type · `packages/core/src/contracts/services.ts`

Příspěvky modulů, které čte jiný modul (server): modul přidává, hostitel o něm neví. Klíč je v
`ModuleServer.contributions`, čte se `deps.services.all("<klíč>")`.

```ts
type ContributionMap = {
  /** Karta klienta: počty záložek, souhrn a metriky seznamu klientů. */
  clientCard: ClientTabProvider;
  /** Proměnné šablon e-mailů pro entitu (`company`, `person`, `deal`, `job`). */
  emailVars: EmailVarsProvider;
};
```

### CreateMeetingInput

type · `packages/core/src/contracts/services.ts`

Vstup `tasks.createMeeting` (schůzka z kalendáře = úkol typu Schůzka).

```ts
type CreateMeetingInput = {
  title: string;
  startsAt: string;
  endsAt: string;
  allDay?: boolean;
  place?: string | null;
  attendeeEmails?: string[];
  assigneeId?: string | null;
  dealId?: string | null;
  companyId?: string | null;
  personId?: string | null;
  jobId?: string | null;
  isPrivate?: boolean;
};
```

### DealSnap

type · `packages/core/src/contracts/types.ts`

Minimální snímky záznamů, které putují v událostech a ve webhookech (nikdy celé řádky).

```ts
type DealSnap = {
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
```

### DomainActor

type · `packages/core/src/contracts/events.ts`

Kdo událost způsobil.

```ts
type DomainActor = {
  kind: "user" | "system" | "n8n" | "google" | "meta" | "job";
  id: string | null;
  label?: string;
};
```

### DomainEvent

type · `packages/core/src/contracts/events.ts`

Událost tak, jak ji dostane `eventHandlers` modulu (a jak se serializuje do webhooku).

```ts
type DomainEvent<K extends DomainEventName = DomainEventName> = {
  id: string;
  name: K;
  occurredAt: string;
  actor: DomainActor;
  entity: DomainEventEntity;
  data: DomainEventMap[K];
  previous?: unknown;
};
```

### DomainEventEntity

type · `packages/core/src/contracts/events.ts`

Záznam, ke kterému se událost vztahuje (`isPrivate` rozhoduje o webhookách a realtime).

```ts
type DomainEventEntity = { type: string; id: string; isPrivate: boolean };
```

### DomainEventMap

type · `packages/core/src/contracts/events.ts`

Katalog doménových událostí OPSYS (D §2.2). Klíč je název události, hodnota payload `data`. Přidávat smí jen architekt;
události označené ve `WEBHOOK_EVENTS` odcházejí i jako webhooky (podepsané, viz C2).

```ts
type DomainEventMap = {
  "deal.created": { deal: DealSnap };
  "deal.stage_changed": {
    deal: DealSnap;
    fromStageId: string | null;
    toStageId: string;
    secondsInPrevious: number | null;
  };
  "deal.won": { deal: DealSnap; jobIds: string[] };
  "deal.lost": { deal: DealSnap; reason: string | null; note: string | null };
  "client.status_changed": {
    client: ClientSnap;
    from: ClientStatus | null;
    to: ClientStatus | null;
    reason?: string;
    endedOn?: string;
  };
  "client.renamed": { clientId: string; from: string; to: string };
  "client.service_added": { clientId: string; service: ServiceType };
  "project.created": { project: ProjectSnap };
  "project.phase_changed": {
    project: ProjectSnap;
    fromPhaseId: string | null;
    toPhaseId: string | null;
  };
  "project.phase_completed": {
    jobId: string;
    phaseId: string;
    name: string;
    role: "intro_evaluation" | "retainer" | null;
    type: ServiceType;
    marketingStage: MarketingStage | null;
    isLast: boolean;
  };
  "project.completed": {
    project: ProjectSnap;
    reason: "finished" | "retainer_ended" | "cancelled";
  };
  "task.created": { task: TaskSnap };
  "task.completed": { task: TaskSnap };
// … (zkráceno, celá deklarace je ve zdroji)
```

### DomainEventName

type · `packages/core/src/contracts/events.ts`

Název doménové události.

```ts
type DomainEventName = keyof DomainEventMap;
```

### DriveEventData

type · `packages/core/src/contracts/events.ts`

Data událostí pro složky na Google Disku (`drive.*`); odesílají se n8n a v odpovědi se volá callback.

```ts
type DriveEventData = {
  requestId: string;
  client: { id: string; name: string; ico: string | null; folderId?: string | null };
  project?: {
    id: string;
    code: string;
    name: string;
    type: ServiceType;
    startDate: string | null;
    folderId?: string | null;
  };
  /** Strom složek z Nastavení → Google Disk. */
  structure: Record<string, unknown>;
  callbackUrl: string;
};
```

### DriveState

type · `packages/core/src/contracts/types.ts`

Stav složky na Google Disku u klienta nebo zakázky.

```ts
type DriveState = "none" | "pending" | "ready" | "error" | "timeout";
```

### EmailEntityType

type · `packages/core/src/contracts/email-vars.ts`

Entity, ze kterých jde napsat e-mail ze šablony.

```ts
type EmailEntityType = "company" | "person" | "deal" | "job";
```

### EmailVarsProvider

type · `packages/core/src/contracts/email-vars.ts`

Proměnné šablon e-mailů, které modul nabízí pro entitu (`{jmeno}`, `{firma}`…). Přispívá kontakty, obchody, zakázky
a jádro (`odesilatel`); čte `sablony-emailu` a `muj-prostor` (`ModuleServer.contributions.emailVars`).

```ts
type EmailVarsProvider = {
  entityType: EmailEntityType;
  vars: readonly { key: string; label: string }[];
  /** Hodnoty proměnných pro jeden záznam (jen text; neznámý záznam = prázdný objekt). */
  resolve(ctx: Ctx, id: string): Promise<Record<string, string>>;
};
```

### JobStatus

type · `packages/core/src/contracts/types.ts`

Stav zakázky (pipeline `job/status`).

```ts
type JobStatus = "planned" | "active" | "paused" | "done" | "cancelled";
```

### MarketingStage

type · `packages/core/src/contracts/types.ts`

Fáze marketingové zakázky (úvod → rozhodnutí → retainer → konec).

```ts
type MarketingStage = "intro" | "decision" | "retainer" | "ended";
```

### PaymentKind

type · `packages/core/src/contracts/types.ts`

Druh platby.

```ts
type PaymentKind = "one_off" | "intro" | "retainer" | "extra" | "recurring";
```

### PaymentSnap

type · `packages/core/src/contracts/types.ts`

Snímek platby v událostech `payment.*`.

```ts
type PaymentSnap = {
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
```

### ProjectSnap

type · `packages/core/src/contracts/types.ts`

Snímek zakázky v událostech `project.*`.

```ts
type ProjectSnap = {
  id: string;
  number: string;
  title: string;
  type: ServiceType;
  companyId: string | null;
  ownerId: string | null;
  startDate: string | null;
  dueDate: string | null;
};
```

### RetainerSetup

type · `packages/core/src/contracts/types.ts`

Nastavení retaineru při založení zakázky („Rovnou retainer“, R-36).

```ts
type RetainerSetup = {
  amountMinor: number;
  fromMonth: YearMonth;
  /** Den vystavení v měsíci, 1–28. */
  issueDay: number;
  issuerMode: "fixed" | "alternate";
  issuerId: string;
  firstIssuerId?: string;
  split: SplitRuleInput[];
};
```

### ServiceKey

type · `packages/core/src/contracts/services.ts`

Klíč služby.

```ts
type ServiceKey = keyof ServiceMap;
```

### ServiceMap

type · `packages/core/src/contracts/services.ts`

Služby, které modul nabízí ostatním (D §2.3). Volají se přes `deps.services.optional("<klíč>")` — vypnutý nebo
zatím nehotový modul službu nemá. Typ je tady v jádru, aby ho konzument nemusel importovat z cizího modulu.

```ts
type ServiceMap = {
  /** Vlastník: modul `klienti`. */
  clients: {
    setStatus(
      ctx: Ctx,
      input: {
        companyId: string;
        status: ClientStatus;
        reason?: string;
        endedOn?: string;
        source: "manual" | "deal_won" | "job_ended";
      },
    ): Promise<{ changed: boolean; clientSince: string | null }>;
    addServices(ctx: Ctx, companyId: string, services: ServiceType[]): Promise<void>;
  };
  /** Vlastník: modul `disk`. */
  disk: {
    requestFolder(
      ctx: Ctx,
      input: { entityType: "company" | "job"; id: string; force?: boolean },
    ): Promise<{ requestId: string | null; skipped?: "private" | "disabled" }>;
    folderState(
      ctx: Ctx,
      entityType: "company" | "job",
      ids: string[],
    ): Promise<Record<string, { state: DriveState; folderId: string | null; url: string | null }>>;
  };
  /** Vlastník: modul `ukoly`. */
  tasks: {
    createFromTemplate(
      ctx: Ctx,
      input: {
        jobId: string;
        ownerId: string;
        leadId?: string;
        startDate: string;
        phaseIds: string[];
        items: TemplateTaskInput[];
      },
    ): Promise<{ taskIds: string[] }>;
// … (zkráceno, celá deklarace je ve zdroji)
```

### ServiceType

type · `packages/core/src/contracts/types.ts`

Typ služby (zakázky i klientova nabídka). Hodnoty jsou kód, popisky se doplňují v UI.

```ts
type ServiceType = "web" | "marketing" | "systemy";
```

### SlotMap

type · `packages/core/src/contracts/slots.ts`

Sloty, do kterých moduly přispívají komponentami (`ModuleUi.slots`) a které hostitel vykreslí přes `<Slot name="…" />`
z `@rebar/ui`. Hostitel o přispěvatelích neví. Klíč je název slotu, hodnota props komponenty.

```ts
type SlotMap = {
  /** Hlavička zakázky: akce navíc (např. „Pokračovat na retainer“). Přispívá finance. */
  "job.header.extra": { jobId: string; row: RecordRow };
  /** Dialog založení zakázky: sekce navíc (editor rozdělení plateb). Přispívá finance. */
  "job.create.extras": {
    value: SplitRuleInput[] | null;
    onChange: (value: SplitRuleInput[] | null) => void;
    type: ServiceType;
    ownerId: string;
  };
  /** Dialog úkolu: akce navíc (např. „Zapsat čas“). Přispívá hodiny. */
  "task.dialog.extras": { taskId: string };
  /** Nastavení → Integrace: panely integrací (ARES, Meta, Fakturoid). */
  "settings.integrations": object;
};
```

### SlotName

type · `packages/core/src/contracts/slots.ts`

Název slotu.

```ts
type SlotName = keyof SlotMap;
```

### SplitRuleInput

type · `packages/core/src/contracts/types.ts`

Pravidlo rozdělení platby mezi dvě osoby (vstup editoru rozdělení).

```ts
type SplitRuleInput = {
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
```

### TaskSnap

type · `packages/core/src/contracts/types.ts`

Snímek úkolu v událostech `task.*`.

```ts
type TaskSnap = {
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
```

### TemplatePaymentInput

type · `packages/core/src/contracts/services.ts`

Platba z šablony zakázky (vstup `finance.initJobFinance`).

```ts
type TemplatePaymentInput = {
  description: string;
  kind: PaymentKind;
  amountMinor: number;
  issuerId: string;
  dueOn?: string | null;
  periodMonth?: YearMonth | null;
};
```

### TemplateTaskInput

type · `packages/core/src/contracts/services.ts`

Úkol z šablony zakázky (vstup `tasks.createFromTemplate`).

```ts
type TemplateTaskInput = {
  phaseId?: string | null;
  title: string;
  typeKey?: string;
  priority?: "none" | "low" | "medium" | "high" | "urgent";
  assigneeId?: string | null;
  dueDate?: string | null;
  estimateMin?: number | null;
  description?: string | null;
};
```

### YearMonth

type · `packages/core/src/contracts/types.ts`

Měsíc ve tvaru `YYYY-MM`, např. `2026-12`.

```ts
type YearMonth = string;
```
