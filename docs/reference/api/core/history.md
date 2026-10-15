# @rebar/core/history

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/core/history` (soubor `packages/core/src/history/index.ts`). Exportů: 11, z toho s popisem 11.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`exportHistoryCsv`](#exporthistorycsv) | function | Export historie do CSV (HIS-06): stejné filtry a stejná viditelnost jako stránka (`auditReadScope`), jeden řádek na změněné pole. Vyžaduje `activity.export` (výchozí jen vlastník). Zapíše se do historie jako `export`. |  |
| [`historyWhere`](#historywhere) | function | Podmínky filtru nad `audit_log` (bez viditelnosti: ta se přidává vždy zvlášť). |  |
| [`listRecent`](#listrecent) | function | Posledních `RECENT_LIMIT` otevřených záznamů uživatele. Názvy se načítají přes engine s viditelností: záznam, který uživatel už nesmí vidět (zamčený, smazaný), se v nabídce neobjeví. |  |
| [`queryHistory`](#queryhistory) | function | Globální historie změn (HIS-02). Čte výhradně přes `auditReadScope(ctx)`: partner nevidí historii soukromých záznamů (ani bývalých soukromých) a bezpečnostní události vidí jen své. Skrytá pole a částky podle oprávnění se vynechají jako v časové ose záznamu. Smazané záznamy mají odkaz do koše. Vyžaduje `activity.read`. |  |
| [`trackRecent`](#trackrecent) | function | Zapamatuje otevřený záznam pro „Nedávné“ v paletě (`recent_record`): jeden řádek na záznam, drží se posledních `RECENT_LIMIT`. Opakované otevření v krátké době (obnovení dat, realtime) řádek nepřepisuje. Neukládá nic pro neznámý typ a pro záznam bez id ve tvaru UUID. |  |
| [`RECENT_LIMIT`](#recent_limit) | const | Kolik naposledy otevřených záznamů se pamatuje na uživatele (HLE-02). |  |
| [`historyFilterSchema`](#historyfilterschema) | const | Filtry globální historie změn (`/historie`). Všechny jsou volitelné a kombinují se logickým A. |  |
| [`HistoryFilters`](#historyfilters) | type | Filtry globální historie (vstup `queryHistory`, `exportHistoryCsv` a stránky `/historie`). |  |
| [`HistoryItem`](#historyitem) | type | Jedna změna v globální historii: kdo, co, komu, před → po a kam odkazuje (záznam, nebo koš). |  |
| [`HistoryTargetState`](#historytargetstate) | type | Jak je záznam, kterého se změna týká, dnes: existuje, je v koši, nebo už není (trvale smazán, nebo není entita). |  |
| [`RecentItem`](#recentitem) | type | Naposledy otevřený záznam pro paletu Cmd+K (název, typ a adresa). |  |

### exportHistoryCsv

function · `packages/core/src/history/query.ts`

Export historie do CSV (HIS-06): stejné filtry a stejná viditelnost jako stránka (`auditReadScope`), jeden řádek
na změněné pole. Vyžaduje `activity.export` (výchozí jen vlastník). Zapíše se do historie jako `export`.

```ts
async function exportHistoryCsv(ctx: Ctx, registry: EntityRegistry, filters: HistoryFilters = {}): Promise<{ csv: string; rows: number; truncated: boolean }>
```

### historyWhere

function · `packages/core/src/history/query.ts`

Podmínky filtru nad `audit_log` (bez viditelnosti: ta se přidává vždy zvlášť).

```ts
function historyWhere(f: z.output<typeof historyFilterSchema>): (SQL | undefined)[]
```

### listRecent

function · `packages/core/src/history/recent.ts`

Posledních `RECENT_LIMIT` otevřených záznamů uživatele. Názvy se načítají přes engine s viditelností: záznam, který
uživatel už nesmí vidět (zamčený, smazaný), se v nabídce neobjeví.

```ts
async function listRecent(ctx: Ctx, registry: EntityRegistry): Promise<RecentItem[]>
```

### queryHistory

function · `packages/core/src/history/query.ts`

Globální historie změn (HIS-02). Čte výhradně přes `auditReadScope(ctx)`: partner nevidí historii soukromých záznamů
(ani bývalých soukromých) a bezpečnostní události vidí jen své. Skrytá pole a částky podle oprávnění se vynechají jako
v časové ose záznamu. Smazané záznamy mají odkaz do koše. Vyžaduje `activity.read`.

```ts
async function queryHistory(ctx: Ctx, registry: EntityRegistry, raw: HistoryFilters = {}): Promise<{ items: HistoryItem[]; total: number; /** Typy záznamů, které v (viditelné) historii jsou; pro filtr. */ entityTypes: { value: string; label: string }[]; /** Uživatelé, kteří v (viditelné) historii něco udělali; pro filtr. */ actors: { value: string; label: string }[]; actions: string[]; }>
```

### trackRecent

function · `packages/core/src/history/recent.ts`

Zapamatuje otevřený záznam pro „Nedávné“ v paletě (`recent_record`): jeden řádek na záznam, drží se posledních
`RECENT_LIMIT`. Opakované otevření v krátké době (obnovení dat, realtime) řádek nepřepisuje. Neukládá nic pro
neznámý typ a pro záznam bez id ve tvaru UUID.

```ts
async function trackRecent(ctx: Ctx, registry: EntityRegistry, entityType: string, entityId: string): Promise<void>
```

### RECENT_LIMIT

const · `packages/core/src/history/recent.ts`

Kolik naposledy otevřených záznamů se pamatuje na uživatele (HLE-02).

```ts
const RECENT_LIMIT: 8
```

### historyFilterSchema

const · `packages/core/src/history/query.ts`

Filtry globální historie změn (`/historie`). Všechny jsou volitelné a kombinují se logickým A.

```ts
const historyFilterSchema: z.ZodObject<{ actorId: z.ZodOptional<z.ZodUUID>; actorKind: z.ZodOptional<z.ZodEnum<{ agency: "agency"; user: "user"; system: "system"; n8n: "n8n"; google: "google"; meta: "meta"; job: "job"; }>>; entityType: z.ZodOptional<z.ZodString>; en…
```

### HistoryFilters

type · `packages/core/src/history/query.ts`

Filtry globální historie (vstup `queryHistory`, `exportHistoryCsv` a stránky `/historie`).

```ts
type HistoryFilters = z.input<typeof historyFilterSchema>;
```

### HistoryItem

type · `packages/core/src/history/query.ts`

Jedna změna v globální historii: kdo, co, komu, před → po a kam odkazuje (záznam, nebo koš).

```ts
type HistoryItem = {
  id: string;
  at: string;
  actor: string;
  actorKind: string;
  actorId: string | null;
  action: string;
  category: string;
  entityType: string;
  entityLabel: string;
  entityId: string;
  entityTitle: string | null;
  summary: string | null;
  changes: AuditChange[];
  /** Odkaz na záznam (`live`) nebo do koše (`deleted`); jinak `null`. */
  href: string | null;
  state: HistoryTargetState;
};
```

### HistoryTargetState

type · `packages/core/src/history/query.ts`

Jak je záznam, kterého se změna týká, dnes: existuje, je v koši, nebo už není (trvale smazán, nebo není entita).

```ts
type HistoryTargetState = "live" | "deleted" | "gone" | "none";
```

### RecentItem

type · `packages/core/src/history/recent.ts`

Naposledy otevřený záznam pro paletu Cmd+K (název, typ a adresa).

```ts
type RecentItem = {
  entityType: string;
  id: string;
  title: string;
  label: string;
  url: string;
};
```
