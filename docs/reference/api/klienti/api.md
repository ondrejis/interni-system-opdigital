# @rebar/klienti/api

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/klienti/api` (soubor `packages/modules/klienti/src/api.ts`). Exportů: 16, z toho s popisem 14.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`clientUrl`](#clienturl) | function | Adresa karty klienta (detail organizace, KLI: karta klienta je detail `company`). |  |
| [`groupClients`](#groupclients) | function | Seskupí řádky podle stavu nebo služby (klient s více službami je v každé své skupině; bez služby ve skupině „Bez služby“). Pořadí skupin je pevné; prázdné skupiny se vynechají. |  |
| [`hiddenTabs`](#hiddentabs) | function | Které záložky se skryjí: záložka bez dat (počet 0). Záložky, které vykresluje `klienti` sám (Zakázky, Obchody), se skryjí i když poskytovatel chybí (modul není zapnutý); u cizích záložek chybějící počet nic neznamená (modul záložku nemusí nabízet), proto se skrývají jen při výslovné nule. |  |
| [`planStatusChange`](#planstatuschange) | function | Pravidla přechodu stavu klienta (KLI-02, R-17): - „klient od“ se uloží jen při prvním přechodu na Aktivní a pak se už nemění; - Bývalý má datum ukončení (výchozí dnes) a důvod; ruční přechod (`manual`) důvod vyžaduje; - návrat z Bývalého smaže datum ukončení (důvod zůstává v historii změn). Vrací `{ error }`, když přechod nejde (chybí důvod). |  |
| [`CLIENT_STATUSES`](#client_statuses) | const | Stavy klienta v pořadí, v jakém se nabízejí. |  |
| [`CLIENT_STATUS_LABELS`](#client_status_labels) | const |  |  |
| [`SERVICES`](#services) | const | Služby v pořadí, v jakém se nabízejí. |  |
| [`SERVICE_LABELS`](#service_labels) | const |  |  |
| [`ClientCardSummary`](#clientcardsummary) | type | Souhrn karty klienta (`klienti.summary`): souhrny modulů s výchozími nulami a údaje o stavu. |  |
| [`ClientContextDto`](#clientcontextdto) | type | Kontext klienta (čtyři pojmenovaná pole + důvod ukončení). |  |
| [`ClientGroupBy`](#clientgroupby) | type | Seskupení seznamu klientů. |  |
| [`ClientListResult`](#clientlistresult) | type | Výsledek `klienti.list`: řádky a to, co aktér smí vidět a dělat. |  |
| [`ClientRow`](#clientrow) | type | Řádek tabulky klientů (`klienti.list`). Sloupce, na které aktér nemá právo, jsou `null`. |  |
| [`ClientState`](#clientstate) | type | Stav klienta před a po přechodu, jak ho pravidla vidí. |  |
| [`ClientTabsResult`](#clienttabsresult) | type | Počty záložek karty (`klienti.tabCounts`) a záložky, které se mají skrýt (bez dat). |  |
| [`StatusPlan`](#statusplan) | type | Co přechod stavu zapíše do `company` a které události z něj vzniknou. |  |

### clientUrl

function · `packages/modules/klienti/src/api.ts`

Adresa karty klienta (detail organizace, KLI: karta klienta je detail `company`).

```ts
function clientUrl(companyId: string): string
```

### groupClients

function · `packages/modules/klienti/src/shared.ts`

Seskupí řádky podle stavu nebo služby (klient s více službami je v každé své skupině; bez služby ve skupině
„Bez služby“). Pořadí skupin je pevné; prázdné skupiny se vynechají.

```ts
function groupClients<T extends Groupable>(rows: readonly T[], by: ClientGroupBy): { key: string; label: string; rows: T[] }[]
```

### hiddenTabs

function · `packages/modules/klienti/src/shared.ts`

Které záložky se skryjí: záložka bez dat (počet 0). Záložky, které vykresluje `klienti` sám (Zakázky, Obchody), se
skryjí i když poskytovatel chybí (modul není zapnutý); u cizích záložek chybějící počet nic neznamená (modul
záložku nemusí nabízet), proto se skrývají jen při výslovné nule.

```ts
function hiddenTabs(counts: Partial<Record<ClientTabId, number>>, all: readonly ClientTabId[]): ClientTabId[]
```

### planStatusChange

function · `packages/modules/klienti/src/shared.ts`

Pravidla přechodu stavu klienta (KLI-02, R-17):
- „klient od“ se uloží jen při prvním přechodu na Aktivní a pak se už nemění;
- Bývalý má datum ukončení (výchozí dnes) a důvod; ruční přechod (`manual`) důvod vyžaduje;
- návrat z Bývalého smaže datum ukončení (důvod zůstává v historii změn).
Vrací `{ error }`, když přechod nejde (chybí důvod).

```ts
function planStatusChange(before: ClientState, to: ClientStatus, input: { reason?: string | undefined; endedOn?: string | undefined; source: "manual" | "deal_won" | "job_ended"; }, today: string): StatusPlan | { error: string }
```

### CLIENT_STATUSES

const · `packages/modules/klienti/src/shared.ts`

Stavy klienta v pořadí, v jakém se nabízejí.

```ts
const CLIENT_STATUSES: readonly ClientStatus[]
```

### CLIENT_STATUS_LABELS

const · `packages/modules/klienti/src/shared.ts`

_Bez popisu._

```ts
const CLIENT_STATUS_LABELS: Record<ClientStatus, string>
```

### SERVICES

const · `packages/modules/klienti/src/shared.ts`

Služby v pořadí, v jakém se nabízejí.

```ts
const SERVICES: readonly ServiceType[]
```

### SERVICE_LABELS

const · `packages/modules/klienti/src/shared.ts`

_Bez popisu._

```ts
const SERVICE_LABELS: Record<ServiceType, string>
```

### ClientCardSummary

type · `packages/modules/klienti/src/contract.ts`

Souhrn karty klienta (`klienti.summary`): souhrny modulů s výchozími nulami a údaje o stavu.

```ts
type ClientCardSummary = {
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
```

### ClientContextDto

type · `packages/modules/klienti/src/contract.ts`

Kontext klienta (čtyři pojmenovaná pole + důvod ukončení).

```ts
type ClientContextDto = {
  decisionMaker: string;
  howToCommunicate: string;
  history: string;
  notes: string;
  endReason: string;
};
```

### ClientGroupBy

type · `packages/modules/klienti/src/shared.ts`

Seskupení seznamu klientů.

```ts
type ClientGroupBy = "none" | "status" | "service";
```

### ClientListResult

type · `packages/modules/klienti/src/contract.ts`

Výsledek `klienti.list`: řádky a to, co aktér smí vidět a dělat.

```ts
type ClientListResult = {
  rows: ClientRow[];
  /** Smí aktér vidět finance (sloupec příjem)? */
  canSeeIncome: boolean;
  canWrite: boolean;
  /** Aktér vidí soukromé záznamy (sloupec se zámkem). */
  canSeePrivate: boolean;
};
```

### ClientRow

type · `packages/modules/klienti/src/contract.ts`

Řádek tabulky klientů (`klienti.list`). Sloupce, na které aktér nemá právo, jsou `null`.

```ts
type ClientRow = {
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
```

### ClientState

type · `packages/modules/klienti/src/shared.ts`

Stav klienta před a po přechodu, jak ho pravidla vidí.

```ts
type ClientState = {
  status: ClientStatus | null;
  since: string | null;
  until: string | null;
};
```

### ClientTabsResult

type · `packages/modules/klienti/src/contract.ts`

Počty záložek karty (`klienti.tabCounts`) a záložky, které se mají skrýt (bez dat).

```ts
type ClientTabsResult = {
  counts: Partial<Record<ClientTabId, number>>;
  hidden: ClientTabId[];
};
```

### StatusPlan

type · `packages/modules/klienti/src/shared.ts`

Co přechod stavu zapíše do `company` a které události z něj vzniknou.

```ts
type StatusPlan = {
  changed: boolean;
  /** Sloupce k zápisu (vlastnosti tabulky `company`). */
  patch: {
    clientStatus: ClientStatus;
    clientSince?: string;
    clientUntil?: string | null;
    clientEndReason?: string;
  };
  /** „Klient od“ po přechodu. */
  since: string | null;
};
```
