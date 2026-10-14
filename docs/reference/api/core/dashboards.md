# @rebar/core/dashboards

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/core/dashboards` (soubor `packages/core/src/dashboards/index.ts`). Exportů: 116, z toho s popisem 62.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`bucketLabel`](#bucketlabel) | function | Popisek koše pro osu grafu: „říjen 2026“, „T41 2026“, „9. 10.“, „Q4 2026“, „2026“. |  |
| [`bucketStart`](#bucketstart) | function | Začátek koše, do kterého datum spadá (týden začíná pondělím). |  |
| [`bucketTruncSql`](#buckettruncsql) | function | SQL výraz začátku koše pro datumový sloupec; koš je jen z whitelistu, SQL se nikdy nesestavuje z řetězce (týden začíná pondělím). |  |
| [`bucketsBetween`](#bucketsbetween) | function | Všechny koše od začátku po konec rozsahu (i prázdné, aby časová řada neměla díry). |  |
| [`capRangeToToday`](#caprangetotoday) | function | Zkrátí konec období na dnešek (fond pracovní doby a využití se počítají jen do teď); `null`, když období ještě nezačalo. |  |
| [`cellText`](#celltext) | function | Textová podoba hodnoty buňky pro PDF a náhledy. |  |
| [`choiceParam`](#choiceparam) | function | Hodnota parametru `select` jen z povolených voleb (whitelist); cokoli jiného padá na výchozí. |  |
| [`clampLimit`](#clamplimit) | function | Počet řádků, který widget smí chtít: 1 až 100. |  |
| [`clearDashboardCache`](#cleardashboardcache) | function |  |  |
| [`cloneBoard`](#cloneboard) | function | Kopie nástěnky (i cizí sdílené) jako moje osobní. |  |
| [`comparisonRange`](#comparisonrange) | function | Srovnávací období: předchozí stejně dlouhé období (u celých měsíců, čtvrtletí a let předchozí kalendářní měsíc / čtvrtletí / rok, ne „30 dní zpět“) nebo stejné období o rok dříve. |  |
| [`createBoard`](#createboard) | function |  |  |
| [`dashboardFileStem`](#dashboardfilestem) | function |  |  |
| [`dayRangeInstants`](#dayrangeinstants) | function | Období kalendářních dnů (včetně obou konců) jako okamžiky: začátek `od 00:00` a **vyloučený** konec `do + 1 den 00:00` v české zóně. Přechod letního času tak nikdy neposune hranici dne (den má 23 nebo 25 hodin). |  |
| [`defaultBucket`](#defaultbucket) | function | Rozumný koš podle délky období. |  |
| [`defaultForwardRange`](#defaultforwardrange) | function | Výchozí rozsah časové řady bez zvoleného období: od začátku současného koše dopředu (6 měsíců, 12 týdnů, 30 dní, 4 čtvrtletí, 3 roky). Používá ho plán peněžních toků, který se dívá do budoucna. |  |
| [`deleteBoard`](#deleteboard) | function |  |  |
| [`deltaOf`](#deltaof) | function | Změna proti srovnávacímu období. `pct` je `null`, když je základ nula (dělení nulou). |  |
| [`describeFilters`](#describefilters) | function | Popis filtrů nástěnky pro hlavičku PDF. |  |
| [`describeMetric`](#describemetric) | function |  |  |
| [`emptyDefinition`](#emptydefinition) | function | Prázdná nástěnka. |  |
| [`ensureSeedDashboards`](#ensureseeddashboards) | function | Založí chybějící výchozí nástěnky z konfigurace klienta. Idempotentní: nástěnka, kterou správce upravil nebo smazal, se znovu nevytváří ani nepřepisuje (klíč zůstává u smazaného řádku). Role, která v systému není, se přeskočí. |  |
| [`entityHref`](#entityhref) | function | Odkaz na detail cizí entity (zákazník…), jen když aktér čte všechny její záznamy; při rozsahu „jen moje“ by odkaz mohl vést na záznam, který aktér nevidí. |  |
| [`evaluateWidget`](#evaluatewidget) | function | Vyhodnotí jeden widget pro aktéra. Vždy přes datovou vrstvu s oprávněními aktéra (rozsah „jen moje“, skryté atributy, oprávnění metrik): definice widgetu nemůže odhalit nic, co by aktér neviděl v seznamu. Chyba se nevyhazuje, vrací se jako výsledek, takže jeden rozbitý widget nerozbije nástěnku. Výsledky se krátce (30 s) pamatují na uživatele. |  |
| [`filtersFromSearch`](#filtersfromsearch) | function | Filtry z parametrů URL (`obdobi`, `od`, `do`, `zakazka`, `osoba`); neplatné hodnoty se tiše zahodí. |  |
| [`filtersToSearch`](#filterstosearch) | function | Opačně: jen odchylky od výchozího stavu, ať je adresa krátká. |  |
| [`formatCompact`](#formatcompact) | function | Krátký tvar pro osy grafů („1,2 mil.“, „350 tis.“). Peníze se zkracují v korunách. |  |
| [`formatValue`](#formatvalue) | function | Hodnota widgetu jako text podle formátu (peníze jsou v haléřích). |  |
| [`getBoard`](#getboard) | function | Otevření nástěnky; správce nástěnek smí otevřít i cizí (kontrola ze Nastavení, jak vypadá výchozí sada role). |  |
| [`homeBoardId`](#homeboardid) | function | Nástěnka, která se má otevřít na úvodní stránce místo klasického Přehledu (výchozí pro roli s příznakem „domů“). |  |
| [`isBucket`](#isbucket) | function |  |  |
| [`isoWeek`](#isoweek) | function | ISO číslo týdne a rok, ke kterému týden patří (čtvrtek rozhoduje). |  |
| [`listAllBoards`](#listallboards) | function | Správce: všechny nástěnky v systému (Nastavení → Nástěnky). |  |
| [`listBoards`](#listboards) | function | Nástěnky, které aktér vidí, v pořadí přepínače: nejdřív podle jeho vlastního řazení, pak výchozí pro roli, moje a sdílené (podle názvu). |  |
| [`metricAvailable`](#metricavailable) | function | Metrika je pro aktéra dostupná, jen když má všechna její oprávnění. |  |
| [`migrateDefinition`](#migratedefinition) | function | Přečte definici z databáze (nebo z konfigurace): doplní chybějící verzi, převede starší verze krok za krokem na aktuální a ověří. Novější verzi, než umí tento systém, odmítne srozumitelnou větou (nástěnka vznikla v novější verzi). |  |
| [`numberChoiceParam`](#numberchoiceparam) | function | Číselný parametr omezený na výčet povolených hodnot (`days` = 7, 14, 30…). |  |
| [`parseDefinition`](#parsedefinition) | function | Zod chybu převede na větu pro uživatele. |  |
| [`parseWidget`](#parsewidget) | function |  |  |
| [`pct1`](#pct1) | function | Podíl `num / den` v procentech na jedno desetinné místo; při nulovém jmenovateli `null`. |  |
| [`periodOf`](#periodof) | function | Období filtrů nástěnky. |  |
| [`recordDashboardExport`](#recorddashboardexport) | function | Stopa exportu z nástěnky (widget nebo celá nástěnka): záznam v „historii exportů“ a v auditu. Data samotná se do záznamu neukládají, jen kdo, co, kolik řádků a s jakými filtry. |  |
| [`renderDashboardPdf`](#renderdashboardpdf) | function | Snímek nástěnky do PDF pro poradu: hlavička klienta, použité filtry a widgety v pořadí nástěnky. KPI se řadí do řad, grafy mají podobu tabulky s pruhy (bez rastrových obrázků a těžkých závislostí). Widget, který se nenačetl, má místo obsahu důvod. |  |
| [`reorderBoards`](#reorderboards) | function | Moje pořadí nástěnek v přepínači (ostatní se řadí za ně). |  |
| [`resolvePeriod`](#resolveperiod) | function | Období podle předvolby k danému dni. `all` a neplatné vlastní období = `null` (bez omezení). |  |
| [`resultToTable`](#resulttotable) | function | Data widgetu jako tabulka pro CSV / XLSX (typovaně: částky jako částky, data jako data). Co widget zobrazuje, to se exportuje, nic navíc, takže export nemůže prozradit víc než samotný widget. |  |
| [`scopedEntity`](#scopedentity) | function | Rozsah aktéra pro dotaz metriky: stejná podmínka, kterou používá seznam entity (oprávnění ke čtení, rozsah „vše“ / „jen moje“, nesmazané). Bez oprávnění vyhodí chybu, chybějící entita (vypnutý modul) je srozumitelná chyba. |  |
| [`seedDashboard`](#seeddashboard) | function | Doplní id a rozměry widgetů a složí definici ve verzi, kterou systém čte. |  |
| [`setRoleDefault`](#setroledefault) | function | Výchozí nástěnka pro roli (správce): vidí ji všichni z této role. S příznakem `home` se otevírá na úvodní stránce místo klasického Přehledu (za roli nejvýš jedna). `roleKey = null` výchozí nastavení zruší. |  |
| [`shareBoard`](#shareboard) | function | Sdílení s rolemi a uživateli (autor nebo správce). Nahradí dosavadní sdílení. |  |
| [`sourceCatalog`](#sourcecatalog) | function | Katalog zdrojů, které aktér smí použít ve widgetech: čitelné entity a dostupné metriky. |  |
| [`tableToCsv`](#tabletocsv) | function | CSV z dat widgetu (středník nebo čárka podle klienta, UTF-8 s BOM, ochrana proti vzorcům). |  |
| [`tableToXlsx`](#tabletoxlsx) | function | XLSX z dat widgetu: částky jako částky, data jako data, čísla jako čísla. |  |
| [`tryScopedEntity`](#tryscopedentity) | function | Jako `scopedEntity`, ale bez oprávnění nebo při vypnutém modulu vrátí `null` (pro doplňkové popisky a odkazy). |  |
| [`updateBoard`](#updateboard) | function |  |  |
| [`AGG_FUNCTIONS`](#agg_functions) | const |  |  |
| [`BUCKETS`](#buckets) | const |  |  |
| [`BUILTINS`](#builtins) | const |  |  |
| [`CHART_KINDS`](#chart_kinds) | const |  |  |
| [`COMPARE_LABELS`](#compare_labels) | const |  |  |
| [`COMPARE_MODES`](#compare_modes) | const |  |  |
| [`DASHBOARD_MANAGE`](#dashboard_manage) | const |  |  |
| [`DASHBOARD_WRITE`](#dashboard_write) | const | Oprávnění: skládat vlastní nástěnky / spravovat cizí, výchozí a sdílené. |  |
| [`DEFAULT_CACHE_TTL_MS`](#default_cache_ttl_ms) | const |  |  |
| [`DEFAULT_FILTERS`](#default_filters) | const |  |  |
| [`DEFAULT_TIMEOUT_MS`](#default_timeout_ms) | const |  |  |
| [`DEFINITION_MIGRATIONS`](#definition_migrations) | const | Dnes existuje jediná verze; sem přijdou převody, až se tvar definice změní (a test, který je projde všechny). |  |
| [`DEFINITION_VERSION`](#definition_version) | const |  |  |
| [`MAX_BOARDS_PER_USER`](#max_boards_per_user) | const | Nejvíc nástěnek, které si uživatel může založit. |  |
| [`MAX_WIDGETS`](#max_widgets) | const | Nejvíc widgetů na nástěnce (každý je dotaz; nástěnka se musí načíst do pár sekund). |  |
| [`MAX_WIDGET_HEIGHT`](#max_widget_height) | const |  |  |
| [`PERIOD_LABELS`](#period_labels) | const |  |  |
| [`PERIOD_PRESETS`](#period_presets) | const |  |  |
| [`VALUE_FORMATS`](#value_formats) | const | Jak se hodnota ukazuje: peníze jsou v haléřích, `minutes` v minutách (7:30 h), `hours` v desetinných hodinách. |  |
| [`WIDGET_TYPES`](#widget_types) | const |  |  |
| [`WIDGET_WIDTHS`](#widget_widths) | const |  |  |
| [`definitionSchema`](#definitionschema) | const |  |  |
| [`eachDay`](#eachday) | const |  |  |
| [`widgetSchema`](#widgetschema) | const |  |  |
| [`AggFn`](#aggfn) | type |  |  |
| [`BoardDetail`](#boarddetail) | type |  |  |
| [`Bucket`](#bucket) | type |  |  |
| [`BuiltinKind`](#builtinkind) | type |  |  |
| [`BuiltinSource`](#builtinsource) | type |  |  |
| [`ChartCategory`](#chartcategory) | type |  |  |
| [`ChartKind`](#chartkind) | type |  |  |
| [`ChartSeriesData`](#chartseriesdata) | type |  |  |
| [`CompareMode`](#comparemode) | type |  |  |
| [`DashboardDefinition`](#dashboarddefinition) | type |  |  |
| [`DashboardEnv`](#dashboardenv) | type | Prostředí vyhodnocení: registr entit, metriky zapnutých modulů a vestavěné zdroje. Dodává aplikace. |  |
| [`DashboardFilters`](#dashboardfilters) | type | Filtry nahoře na nástěnce: propisují se do widgetů a do URL. |  |
| [`DashboardKind`](#dashboardkind) | type |  |  |
| [`DashboardPdfInput`](#dashboardpdfinput) | type |  |  |
| [`DashboardSeed`](#dashboardseed) | type |  |  |
| [`DashboardSeedInput`](#dashboardseedinput) | type | Výchozí nástěnka v `clients/<klient>/config.ts` → `dashboards.defaults`. |  |
| [`DashboardSummary`](#dashboardsummary) | type |  |  |
| [`DashboardWidget`](#dashboardwidget) | type | Mřížka má 12 sloupců; `w` je šířka ve sloupcích, `h` výška v řádcích (po 96 px). Pořadí widgetů je pořadí v poli. |  |
| [`DateRange`](#daterange) | type |  |  |
| [`DefinitionMigrations`](#definitionmigrations) | type | Oprava dřívějších verzí definice na aktuální. Každý krok převádí verzi `n` na `n + 1`. |  |
| [`EntitySource`](#entitysource) | type | Zdroj dat z entity: filtr → agregace → seskupení (hodnota nebo období) → řazení a limit. Žádné ruční SQL. |  |
| [`MetricInfo`](#metricinfo) | type |  |  |
| [`MetricSource`](#metricsource) | type | Pojmenovaná metrika, kterou dodává modul (`dashboardMetrics`). |  |
| [`PeriodPreset`](#periodpreset) | type |  |  |
| [`RecordsSource`](#recordssource) | type | Seznam záznamů (top N, nejbližší termíny): sloupce a řazení jako v seznamu entity. |  |
| [`ResultTable`](#resulttable) | type |  |  |
| [`ScopedEntity`](#scopedentity) | type | Entita zúžená na to, co aktér smí vidět, s hotovou podmínkou `WHERE` (smazané, oprávnění, rozsah „jen moje“). |  |
| [`SeedDashboard`](#seeddashboard) | type |  |  |
| [`SeedWidget`](#seedwidget) | type |  |  |
| [`TableColumn`](#tablecolumn) | type |  |  |
| [`ValueFormat`](#valueformat) | type |  |  |
| [`WidgetMeta`](#widgetmeta) | type |  |  |
| [`WidgetOptions`](#widgetoptions) | type |  |  |
| [`WidgetOutcome`](#widgetoutcome) | type | Výsledek jednoho widgetu při načtení: chyba jednoho widgetu nerozbije nástěnku. |  |
| [`WidgetResult`](#widgetresult) | type |  |  |
| [`WidgetSource`](#widgetsource) | type |  |  |
| [`WidgetType`](#widgettype) | type |  |  |

### bucketLabel

function · `packages/core/src/dashboards/periods.ts`

Popisek koše pro osu grafu: „říjen 2026“, „T41 2026“, „9. 10.“, „Q4 2026“, „2026“.

```ts
function bucketLabel(start: string, bucket: Bucket): string
```

### bucketStart

function · `packages/core/src/dashboards/periods.ts`

Začátek koše, do kterého datum spadá (týden začíná pondělím).

```ts
function bucketStart(date: string, bucket: Bucket): string
```

### bucketTruncSql

function · `packages/core/src/dashboards/metric-helpers.ts`

SQL výraz začátku koše pro datumový sloupec; koš je jen z whitelistu, SQL se nikdy nesestavuje z řetězce (týden začíná pondělím).

```ts
function bucketTruncSql(column: AnyPgColumn | SQL, bucket: Bucket): SQL
```

### bucketsBetween

function · `packages/core/src/dashboards/periods.ts`

Všechny koše od začátku po konec rozsahu (i prázdné, aby časová řada neměla díry).

```ts
function bucketsBetween(range: DateRange, bucket: Bucket, max = 400): string[]
```

### capRangeToToday

function · `packages/core/src/dashboards/metric-helpers.ts`

Zkrátí konec období na dnešek (fond pracovní doby a využití se počítají jen do teď); `null`, když období ještě nezačalo.

```ts
function capRangeToToday(range: DateRange, today: string): DateRange | null
```

### cellText

function · `packages/core/src/dashboards/result-table.ts`

Textová podoba hodnoty buňky pro PDF a náhledy.

```ts
function cellText(type: TableColumn["type"], format: ValueFormat | undefined, v: unknown): string
```

### choiceParam

function · `packages/core/src/dashboards/metric-helpers.ts`

Hodnota parametru `select` jen z povolených voleb (whitelist); cokoli jiného padá na výchozí.

```ts
function choiceParam<T extends string>(params: Record<string, string | number | boolean>, key: string, allowed: readonly T[], fallback: T): T
```

### clampLimit

function · `packages/core/src/dashboards/metric-helpers.ts`

Počet řádků, který widget smí chtít: 1 až 100.

```ts
function clampLimit(limit: number, fallback = 12): number
```

### clearDashboardCache

function · `packages/core/src/dashboards/evaluate.ts`

_Bez popisu._

```ts
function clearDashboardCache(): void
```

### cloneBoard

function · `packages/core/src/dashboards/service.ts`

Kopie nástěnky (i cizí sdílené) jako moje osobní.

```ts
async function cloneBoard(ctx: Ctx, id: string, name?: string): Promise<{ id: string }>
```

### comparisonRange

function · `packages/core/src/dashboards/periods.ts`

Srovnávací období: předchozí stejně dlouhé období (u celých měsíců, čtvrtletí a let předchozí kalendářní měsíc /
čtvrtletí / rok, ne „30 dní zpět“) nebo stejné období o rok dříve.

```ts
function comparisonRange(range: DateRange, mode: CompareMode): DateRange | null
```

### createBoard

function · `packages/core/src/dashboards/service.ts`

_Bez popisu._

```ts
async function createBoard(ctx: Ctx, input: { name: string; definition?: unknown }): Promise<{ id: string }>
```

### dashboardFileStem

function · `packages/core/src/dashboards/export.ts`

_Bez popisu._

```ts
function dashboardFileStem(title: string): string
```

### dayRangeInstants

function · `packages/core/src/dashboards/metric-helpers.ts`

Období kalendářních dnů (včetně obou konců) jako okamžiky: začátek `od 00:00` a **vyloučený** konec `do + 1 den 00:00`
v české zóně. Přechod letního času tak nikdy neposune hranici dne (den má 23 nebo 25 hodin).

```ts
function dayRangeInstants(range: DateRange, tz = "Europe/Prague"): { start: Date; end: Date }
```

### defaultBucket

function · `packages/core/src/dashboards/periods.ts`

Rozumný koš podle délky období.

```ts
function defaultBucket(range: DateRange | null): Bucket
```

### defaultForwardRange

function · `packages/core/src/dashboards/metric-helpers.ts`

Výchozí rozsah časové řady bez zvoleného období: od začátku současného koše dopředu (6 měsíců, 12 týdnů, 30 dní,
4 čtvrtletí, 3 roky). Používá ho plán peněžních toků, který se dívá do budoucna.

```ts
function defaultForwardRange(today: string, bucket: Bucket): DateRange
```

### deleteBoard

function · `packages/core/src/dashboards/service.ts`

_Bez popisu._

```ts
async function deleteBoard(ctx: Ctx, id: string): Promise<void>
```

### deltaOf

function · `packages/core/src/dashboards/format.ts`

Změna proti srovnávacímu období. `pct` je `null`, když je základ nula (dělení nulou).

```ts
function deltaOf(value: number | null, previous: number | null): { abs: number; pct: number | null } | undefined
```

### describeFilters

function · `packages/core/src/dashboards/pdf.ts`

Popis filtrů nástěnky pro hlavičku PDF.

```ts
function describeFilters(f: { period: keyof typeof PERIOD_LABELS; from?: string | undefined; to?: string | undefined }, extra: { range: { from: string; to: string } | null; job?: string | undefined; user?: string | undefined; }): string
```

### describeMetric

function · `packages/core/src/dashboards/evaluate.ts`

_Bez popisu._

```ts
function describeMetric(m: DashboardMetricDef): MetricInfo
```

### emptyDefinition

function · `packages/core/src/dashboards/definition.ts`

Prázdná nástěnka.

```ts
function emptyDefinition(): DashboardDefinition
```

### ensureSeedDashboards

function · `packages/core/src/dashboards/service.ts`

Založí chybějící výchozí nástěnky z konfigurace klienta. Idempotentní: nástěnka, kterou správce upravil nebo smazal,
se znovu nevytváří ani nepřepisuje (klíč zůstává u smazaného řádku). Role, která v systému není, se přeskočí.

```ts
async function ensureSeedDashboards(db: Executor, seeds: readonly SeedDashboard[]): Promise<{ created: string[]; skipped: string[] }>
```

### entityHref

function · `packages/core/src/dashboards/metric-helpers.ts`

Odkaz na detail cizí entity (zákazník…), jen když aktér čte všechny její záznamy; při rozsahu „jen moje“ by odkaz
mohl vést na záznam, který aktér nevidí.

```ts
function entityHref(ctx: Ctx, deps: { registry: EntityRegistry }, entityKey: string, id: string): string | undefined
```

### evaluateWidget

function · `packages/core/src/dashboards/evaluate.ts`

Vyhodnotí jeden widget pro aktéra. Vždy přes datovou vrstvu s oprávněními aktéra (rozsah „jen moje“, skryté atributy,
oprávnění metrik): definice widgetu nemůže odhalit nic, co by aktér neviděl v seznamu. Chyba se nevyhazuje, vrací se
jako výsledek, takže jeden rozbitý widget nerozbije nástěnku. Výsledky se krátce (30 s) pamatují na uživatele.

```ts
async function evaluateWidget(ctx: Ctx, env: DashboardEnv, rawWidget: unknown, filters: DashboardFilters, opts: { fresh?: boolean } = {}): Promise<WidgetOutcome>
```

### filtersFromSearch

function · `packages/core/src/dashboards/periods.ts`

Filtry z parametrů URL (`obdobi`, `od`, `do`, `zakazka`, `osoba`); neplatné hodnoty se tiše zahodí.

```ts
function filtersFromSearch(get: (key: string) => string | null | undefined, fallbackPeriod: PeriodPreset = "all"): DashboardFilters
```

### filtersToSearch

function · `packages/core/src/dashboards/periods.ts`

Opačně: jen odchylky od výchozího stavu, ať je adresa krátká.

```ts
function filtersToSearch(f: DashboardFilters, fallbackPeriod: PeriodPreset = "all"): Record<string, string>
```

### formatCompact

function · `packages/core/src/dashboards/format.ts`

Krátký tvar pro osy grafů („1,2 mil.“, „350 tis.“). Peníze se zkracují v korunách.

```ts
function formatCompact(format: ValueFormat, value: number): string
```

### formatValue

function · `packages/core/src/dashboards/format.ts`

Hodnota widgetu jako text podle formátu (peníze jsou v haléřích).

```ts
function formatValue(format: ValueFormat, value: number | null | undefined): string
```

### getBoard

function · `packages/core/src/dashboards/service.ts`

Otevření nástěnky; správce nástěnek smí otevřít i cizí (kontrola ze Nastavení, jak vypadá výchozí sada role).

```ts
async function getBoard(ctx: Ctx, id: string): Promise<BoardDetail>
```

### homeBoardId

function · `packages/core/src/dashboards/service.ts`

Nástěnka, která se má otevřít na úvodní stránce místo klasického Přehledu (výchozí pro roli s příznakem „domů“).

```ts
async function homeBoardId(ctx: Ctx): Promise<string | null>
```

### isBucket

function · `packages/core/src/dashboards/periods.ts`

_Bez popisu._

```ts
function isBucket(v: unknown): v is Bucket
```

### isoWeek

function · `packages/core/src/dashboards/periods.ts`

ISO číslo týdne a rok, ke kterému týden patří (čtvrtek rozhoduje).

```ts
function isoWeek(date: string): { year: number; week: number }
```

### listAllBoards

function · `packages/core/src/dashboards/service.ts`

Správce: všechny nástěnky v systému (Nastavení → Nástěnky).

```ts
async function listAllBoards(ctx: Ctx): Promise<DashboardSummary[]>
```

### listBoards

function · `packages/core/src/dashboards/service.ts`

Nástěnky, které aktér vidí, v pořadí přepínače: nejdřív podle jeho vlastního řazení, pak výchozí pro roli,
moje a sdílené (podle názvu).

```ts
async function listBoards(ctx: Ctx): Promise<DashboardSummary[]>
```

### metricAvailable

function · `packages/core/src/dashboards/evaluate.ts`

Metrika je pro aktéra dostupná, jen když má všechna její oprávnění.

```ts
function metricAvailable(ctx: Ctx, m: DashboardMetricDef): boolean
```

### migrateDefinition

function · `packages/core/src/dashboards/definition.ts`

Přečte definici z databáze (nebo z konfigurace): doplní chybějící verzi, převede starší verze krok za krokem na
aktuální a ověří. Novější verzi, než umí tento systém, odmítne srozumitelnou větou (nástěnka vznikla v novější verzi).

```ts
function migrateDefinition(raw: unknown, migrations: DefinitionMigrations = DEFINITION_MIGRATIONS, target = DEFINITION_VERSION): DashboardDefinition
```

### numberChoiceParam

function · `packages/core/src/dashboards/metric-helpers.ts`

Číselný parametr omezený na výčet povolených hodnot (`days` = 7, 14, 30…).

```ts
function numberChoiceParam(params: Record<string, string | number | boolean>, key: string, allowed: readonly number[], fallback: number): number
```

### parseDefinition

function · `packages/core/src/dashboards/definition.ts`

Zod chybu převede na větu pro uživatele.

```ts
function parseDefinition(raw: unknown): DashboardDefinition
```

### parseWidget

function · `packages/core/src/dashboards/definition.ts`

_Bez popisu._

```ts
function parseWidget(raw: unknown): DashboardWidget
```

### pct1

function · `packages/core/src/dashboards/metric-helpers.ts`

Podíl `num / den` v procentech na jedno desetinné místo; při nulovém jmenovateli `null`.

```ts
function pct1(num: number, den: number): number | null
```

### periodOf

function · `packages/core/src/dashboards/periods.ts`

Období filtrů nástěnky.

```ts
function periodOf(f: DashboardFilters, today: string): DateRange | null
```

### recordDashboardExport

function · `packages/core/src/dashboards/export.ts`

Stopa exportu z nástěnky (widget nebo celá nástěnka): záznam v „historii exportů“ a v auditu. Data samotná
se do záznamu neukládají, jen kdo, co, kolik řádků a s jakými filtry.

```ts
async function recordDashboardExport(ctx: Ctx, v: { label: string; format: string; rows: number; fileName: string; spec: Record<string, unknown>; boardId?: string; }): Promise<void>
```

### renderDashboardPdf

function · `packages/core/src/dashboards/pdf.ts`

Snímek nástěnky do PDF pro poradu: hlavička klienta, použité filtry a widgety v pořadí nástěnky. KPI se řadí do řad,
grafy mají podobu tabulky s pruhy (bez rastrových obrázků a těžkých závislostí). Widget, který se nenačetl, má místo
obsahu důvod.

```ts
async function renderDashboardPdf(input: DashboardPdfInput): Promise<Buffer>
```

### reorderBoards

function · `packages/core/src/dashboards/service.ts`

Moje pořadí nástěnek v přepínači (ostatní se řadí za ně).

```ts
async function reorderBoards(ctx: Ctx, ids: readonly string[]): Promise<void>
```

### resolvePeriod

function · `packages/core/src/dashboards/periods.ts`

Období podle předvolby k danému dni. `all` a neplatné vlastní období = `null` (bez omezení).

```ts
function resolvePeriod(preset: PeriodPreset, today: string, custom?: { from?: string | undefined; to?: string | undefined }): DateRange | null
```

### resultToTable

function · `packages/core/src/dashboards/result-table.ts`

Data widgetu jako tabulka pro CSV / XLSX (typovaně: částky jako částky, data jako data). Co widget zobrazuje, to se
exportuje, nic navíc, takže export nemůže prozradit víc než samotný widget.

```ts
function resultToTable(result: WidgetResult, title: string): ResultTable
```

### scopedEntity

function · `packages/core/src/dashboards/metric-helpers.ts`

Rozsah aktéra pro dotaz metriky: stejná podmínka, kterou používá seznam entity (oprávnění ke čtení, rozsah „vše“ /
„jen moje“, nesmazané). Bez oprávnění vyhodí chybu, chybějící entita (vypnutý modul) je srozumitelná chyba.

```ts
async function scopedEntity(ctx: Ctx, deps: { registry: EntityRegistry }, entityKey: string, filters?: FilterGroup): Promise<ScopedEntity>
```

### seedDashboard

function · `packages/core/src/dashboards/seed.ts`

Doplní id a rozměry widgetů a složí definici ve verzi, kterou systém čte.

```ts
function seedDashboard(d: DashboardSeedInput): DashboardSeed
```

### setRoleDefault

function · `packages/core/src/dashboards/service.ts`

Výchozí nástěnka pro roli (správce): vidí ji všichni z této role. S příznakem `home` se otevírá na úvodní stránce
místo klasického Přehledu (za roli nejvýš jedna). `roleKey = null` výchozí nastavení zruší.

```ts
async function setRoleDefault(ctx: Ctx, id: string, to: { roleKey: string | null; home?: boolean }): Promise<void>
```

### shareBoard

function · `packages/core/src/dashboards/service.ts`

Sdílení s rolemi a uživateli (autor nebo správce). Nahradí dosavadní sdílení.

```ts
async function shareBoard(ctx: Ctx, id: string, to: { roles: readonly string[]; users: readonly string[] }): Promise<void>
```

### sourceCatalog

function · `packages/core/src/dashboards/evaluate.ts`

Katalog zdrojů, které aktér smí použít ve widgetech: čitelné entity a dostupné metriky.

```ts
function sourceCatalog(ctx: Ctx, env: DashboardEnv): { entities: { key: string; label: string; module: "kontakty" | "zakazky" | "poptavky" | "dochazka" | "kalendar"; }[]; metrics: MetricInfo[]; }
```

### tableToCsv

function · `packages/core/src/dashboards/export.ts`

CSV z dat widgetu (středník nebo čárka podle klienta, UTF-8 s BOM, ochrana proti vzorcům).

```ts
function tableToCsv(t: ResultTable, fmt: CsvFormat = DEFAULT_CSV_FORMAT): AsyncGenerator<Buffer>
```

### tableToXlsx

function · `packages/core/src/dashboards/export.ts`

XLSX z dat widgetu: částky jako částky, data jako data, čísla jako čísla.

```ts
function tableToXlsx(t: ResultTable, name: string, title?: string): AsyncGenerator<Buffer>
```

### tryScopedEntity

function · `packages/core/src/dashboards/metric-helpers.ts`

Jako `scopedEntity`, ale bez oprávnění nebo při vypnutém modulu vrátí `null` (pro doplňkové popisky a odkazy).

```ts
async function tryScopedEntity(ctx: Ctx, deps: { registry: EntityRegistry }, entityKey: string): Promise<ScopedEntity | null>
```

### updateBoard

function · `packages/core/src/dashboards/service.ts`

_Bez popisu._

```ts
async function updateBoard(ctx: Ctx, id: string, patch: { name?: string; definition?: unknown; expectedUpdatedAt?: string }): Promise<{ updatedAt: string }>
```

### AGG_FUNCTIONS

const · `packages/core/src/dashboards/types.ts`

_Bez popisu._

```ts
const AGG_FUNCTIONS: readonly ["count", "sum", "avg", "min", "max"]
```

### BUCKETS

const · `packages/core/src/dashboards/types.ts`

_Bez popisu._

```ts
const BUCKETS: readonly ["day", "week", "month", "quarter", "year"]
```

### BUILTINS

const · `packages/core/src/dashboards/types.ts`

_Bez popisu._

```ts
const BUILTINS: readonly ["attention", "tiles", "my_tasks"]
```

### CHART_KINDS

const · `packages/core/src/dashboards/types.ts`

_Bez popisu._

```ts
const CHART_KINDS: readonly ["bar", "stacked", "line", "timeseries", "pie", "donut"]
```

### COMPARE_LABELS

const · `packages/core/src/dashboards/format.ts`

_Bez popisu._

```ts
const COMPARE_LABELS: Record<CompareMode, string>
```

### COMPARE_MODES

const · `packages/core/src/dashboards/types.ts`

_Bez popisu._

```ts
const COMPARE_MODES: readonly ["none", "previous_period", "previous_year"]
```

### DASHBOARD_MANAGE

const · `packages/core/src/dashboards/service.ts`

_Bez popisu._

```ts
const DASHBOARD_MANAGE: "dashboards.manage"
```

### DASHBOARD_WRITE

const · `packages/core/src/dashboards/service.ts`

Oprávnění: skládat vlastní nástěnky / spravovat cizí, výchozí a sdílené.

```ts
const DASHBOARD_WRITE: "dashboards.write"
```

### DEFAULT_CACHE_TTL_MS

const · `packages/core/src/dashboards/evaluate.ts`

_Bez popisu._

```ts
const DEFAULT_CACHE_TTL_MS: 30000
```

### DEFAULT_FILTERS

const · `packages/core/src/dashboards/periods.ts`

_Bez popisu._

```ts
const DEFAULT_FILTERS: DashboardFilters
```

### DEFAULT_TIMEOUT_MS

const · `packages/core/src/dashboards/evaluate.ts`

_Bez popisu._

```ts
const DEFAULT_TIMEOUT_MS: 8000
```

### DEFINITION_MIGRATIONS

const · `packages/core/src/dashboards/definition.ts`

Dnes existuje jediná verze; sem přijdou převody, až se tvar definice změní (a test, který je projde všechny).

```ts
const DEFINITION_MIGRATIONS: DefinitionMigrations
```

### DEFINITION_VERSION

const · `packages/core/src/dashboards/types.ts`

_Bez popisu._

```ts
const DEFINITION_VERSION: 1
```

### MAX_BOARDS_PER_USER

const · `packages/core/src/dashboards/definition.ts`

Nejvíc nástěnek, které si uživatel může založit.

```ts
const MAX_BOARDS_PER_USER: 25
```

### MAX_WIDGETS

const · `packages/core/src/dashboards/definition.ts`

Nejvíc widgetů na nástěnce (každý je dotaz; nástěnka se musí načíst do pár sekund).

```ts
const MAX_WIDGETS: 24
```

### MAX_WIDGET_HEIGHT

const · `packages/core/src/dashboards/types.ts`

_Bez popisu._

```ts
const MAX_WIDGET_HEIGHT: 6
```

### PERIOD_LABELS

const · `packages/core/src/dashboards/types.ts`

_Bez popisu._

```ts
const PERIOD_LABELS: Record<PeriodPreset, string>
```

### PERIOD_PRESETS

const · `packages/core/src/dashboards/types.ts`

_Bez popisu._

```ts
const PERIOD_PRESETS: readonly ["all", "today", "this_week", "last_week", "this_month", "last_month", "this_quarter", "last_quarter", "this_year", "last_year", "last_7_days", "last_30_days", "last_90_days", "custom"]
```

### VALUE_FORMATS

const · `packages/core/src/dashboards/types.ts`

Jak se hodnota ukazuje: peníze jsou v haléřích, `minutes` v minutách (7:30 h), `hours` v desetinných hodinách.

```ts
const VALUE_FORMATS: readonly ["number", "money", "percent", "hours", "minutes"]
```

### WIDGET_TYPES

const · `packages/core/src/dashboards/types.ts`

_Bez popisu._

```ts
const WIDGET_TYPES: readonly ["kpi", "chart", "table", "list", "status", "gauge", "builtin"]
```

### WIDGET_WIDTHS

const · `packages/core/src/dashboards/types.ts`

_Bez popisu._

```ts
const WIDGET_WIDTHS: readonly [3, 4, 6, 8, 12]
```

### definitionSchema

const · `packages/core/src/dashboards/definition.ts`

_Bez popisu._

```ts
const definitionSchema: z.ZodObject<{ schemaVersion: z.ZodLiteral<1>; widgets: z.ZodArray<z.ZodObject<{ id: z.ZodString; type: z.ZodEnum<{ kpi: "kpi"; chart: "chart"; table: "table"; list: "list"; status: "status"; gauge: "gauge"; builtin: "builtin"; }>; title: z…
```

### eachDay

const · `packages/core/src/dashboards/periods.ts`

_Bez popisu._

```ts
const eachDay: (from: string, to: string) => string[]
```

### widgetSchema

const · `packages/core/src/dashboards/definition.ts`

_Bez popisu._

```ts
const widgetSchema: z.ZodObject<{ id: z.ZodString; type: z.ZodEnum<{ kpi: "kpi"; chart: "chart"; table: "table"; list: "list"; status: "status"; gauge: "gauge"; builtin: "builtin"; }>; title: z.ZodString; w: z.ZodNumber; h: z.ZodNumber; source: z.ZodDiscrimin…
```

### AggFn

type · `packages/core/src/dashboards/types.ts`

_Bez popisu._

```ts
type AggFn = (typeof AGG_FUNCTIONS)[number];
```

### BoardDetail

type · `packages/core/src/dashboards/service.ts`

_Bez popisu._

```ts
type BoardDetail = { summary: DashboardSummary; definition: DashboardDefinition };
```

### Bucket

type · `packages/core/src/dashboards/types.ts`

_Bez popisu._

```ts
type Bucket = (typeof BUCKETS)[number];
```

### BuiltinKind

type · `packages/core/src/dashboards/types.ts`

_Bez popisu._

```ts
type BuiltinKind = (typeof BUILTINS)[number];
```

### BuiltinSource

type · `packages/core/src/dashboards/types.ts`

_Bez popisu._

```ts
type BuiltinSource = { kind: "builtin"; builtin: BuiltinKind };
```

### ChartCategory

type · `packages/core/src/dashboards/types.ts`

_Bez popisu._

```ts
type ChartCategory = {
  key: string;
  label: string;
  href?: string | undefined;
  color?: string | undefined;
};
```

### ChartKind

type · `packages/core/src/dashboards/types.ts`

_Bez popisu._

```ts
type ChartKind = (typeof CHART_KINDS)[number];
```

### ChartSeriesData

type · `packages/core/src/dashboards/types.ts`

_Bez popisu._

```ts
type ChartSeriesData = { key: string; label: string; values: (number | null)[] };
```

### CompareMode

type · `packages/core/src/dashboards/types.ts`

_Bez popisu._

```ts
type CompareMode = (typeof COMPARE_MODES)[number];
```

### DashboardDefinition

type · `packages/core/src/dashboards/types.ts`

_Bez popisu._

```ts
type DashboardDefinition = {
  schemaVersion: number;
  widgets: DashboardWidget[];
  /** Výchozí období při otevření nástěnky. */
  defaultPeriod?: PeriodPreset | undefined;
};
```

### DashboardEnv

type · `packages/core/src/dashboards/evaluate.ts`

Prostředí vyhodnocení: registr entit, metriky zapnutých modulů a vestavěné zdroje. Dodává aplikace.

```ts
type DashboardEnv = {
  registry: EntityRegistry;
  deps: ModuleDeps;
  metrics: ReadonlyMap<string, DashboardMetricDef>;
  builtins?: {
    attention?: (ctx: Ctx) => Promise<AttentionItem[]>;
    tiles?: (ctx: Ctx) => Promise<WidgetData[]>;
  };
  /** Doba platnosti mezipaměti na uživatele (ms); 0 = vypnuto. Výchozí 30 s. */
  cacheTtlMs?: number;
  /** Nejdelší doba jednoho dotazu (ms). Výchozí 8 s. */
  timeoutMs?: number;
  now?: () => Date;
};
```

### DashboardFilters

type · `packages/core/src/dashboards/types.ts`

Filtry nahoře na nástěnce: propisují se do widgetů a do URL.

```ts
type DashboardFilters = {
  period: PeriodPreset;
  from?: string | undefined;
  to?: string | undefined;
  jobId?: string | undefined;
  userId?: string | undefined;
};
```

### DashboardKind

type · `packages/core/src/dashboards/types.ts`

_Bez popisu._

```ts
type DashboardKind = "personal" | "shared" | "role_default";
```

### DashboardPdfInput

type · `packages/core/src/dashboards/pdf.ts`

_Bez popisu._

```ts
type DashboardPdfInput = {
  title: string;
  header: ExportHeader;
  /** Popis použitých filtrů nástěnky (období, zakázka, osoba). */
  filterText: string;
  widgets: readonly {
    id: string;
    title: string;
    /** Šířka ve sloupcích z 12; malé widgety (KPI) se řadí vedle sebe. */
    w: number;
    outcome: WidgetOutcome;
  }[];
  generatedAt: string;
};
```

### DashboardSeed

type · `packages/core/src/dashboards/seed.ts`

_Bez popisu._

```ts
type DashboardSeed = {
  key: string;
  name: string;
  role: string;
  home?: boolean;
  definition: DashboardDefinition;
};
```

### DashboardSeedInput

type · `packages/core/src/dashboards/seed.ts`

Výchozí nástěnka v `clients/<klient>/config.ts` → `dashboards.defaults`.

```ts
type DashboardSeedInput = {
  /** Stálý klíč (malá písmena, číslice, pomlčky); podle něj se nástěnka zakládá jen jednou. */
  key: string;
  name: string;
  /** Klíč role, pro kterou je nástěnka výchozí (`owner`, `office`, `foreman`…). */
  role: string;
  /** Otevírá se na úvodní stránce místo klasického Přehledu. Výchozí ne. */
  home?: boolean;
  defaultPeriod?: PeriodPreset;
  widgets: readonly SeedWidget[];
};
```

### DashboardSummary

type · `packages/core/src/dashboards/types.ts`

_Bez popisu._

```ts
type DashboardSummary = {
  id: string;
  name: string;
  /** Moje nástěnka / sdílená se mnou / výchozí pro mou roli. */
  kind: DashboardKind;
  mine: boolean;
  /** Smím ji upravovat (autor nebo správce). */
  canEdit: boolean;
  ownerName: string | null;
  defaultForRole: string | null;
  isHome: boolean;
  shared: { roles: string[]; users: string[] };
  widgetCount: number;
  position: number;
  updatedAt: string;
};
```

### DashboardWidget

type · `packages/core/src/dashboards/types.ts`

Mřížka má 12 sloupců; `w` je šířka ve sloupcích, `h` výška v řádcích (po 96 px). Pořadí widgetů je pořadí v poli.

```ts
type DashboardWidget = {
  id: string;
  type: WidgetType;
  title: string;
  w: number;
  h: number;
  source: WidgetSource;
  options?: WidgetOptions | undefined;
};
```

### DateRange

type · `packages/core/src/dashboards/types.ts`

_Bez popisu._

```ts
type DateRange = { from: string; to: string };
```

### DefinitionMigrations

type · `packages/core/src/dashboards/definition.ts`

Oprava dřívějších verzí definice na aktuální. Každý krok převádí verzi `n` na `n + 1`.

```ts
type DefinitionMigrations = Record<
  number,
  (raw: Record<string, unknown>) => Record<string, unknown>
>;
```

### EntitySource

type · `packages/core/src/dashboards/types.ts`

Zdroj dat z entity: filtr → agregace → seskupení (hodnota nebo období) → řazení a limit. Žádné ruční SQL.

```ts
type EntitySource = {
  kind: "entity";
  entity: string;
  filters?: FilterGroup | undefined;
  /** Datumový atribut, podle kterého se filtruje období nástěnky. */
  dateAttr?: string | undefined;
  /** Atribut s odkazem na zakázku / na uživatele, který se omezí filtrem nástěnky. */
  jobAttr?: string | undefined;
  personAttr?: string | undefined;
  agg: { fn: AggFn; attr?: string | undefined };
  groupBy?: { attr: string; bucket?: Bucket | undefined } | undefined;
  /** Druhé seskupení pro skládaný graf (jen hodnotové atributy). */
  splitBy?: string | undefined;
  sort?: { by: "value" | "label"; dir: "asc" | "desc" } | undefined;
  limit?: number | undefined;
};
```

### MetricInfo

type · `packages/core/src/dashboards/types.ts`

_Bez popisu._

```ts
type MetricInfo = {
  key: string;
  label: string;
  description?: string | undefined;
  format: ValueFormat;
  shape: "scalar" | "series";
  supports: { period: boolean; job: boolean; person: boolean; bucket: boolean };
  params: {
    key: string;
    label: string;
    type: "select" | "number" | "boolean";
    choices?: { value: string; label: string }[] | undefined;
    default?: string | number | boolean | undefined;
  }[];
};
```

### MetricSource

type · `packages/core/src/dashboards/types.ts`

Pojmenovaná metrika, kterou dodává modul (`dashboardMetrics`).

```ts
type MetricSource = {
  kind: "metric";
  metric: string;
  params?: Record<string, string | number | boolean> | undefined;
  bucket?: Bucket | undefined;
  limit?: number | undefined;
};
```

### PeriodPreset

type · `packages/core/src/dashboards/types.ts`

_Bez popisu._

```ts
type PeriodPreset = (typeof PERIOD_PRESETS)[number];
```

### RecordsSource

type · `packages/core/src/dashboards/types.ts`

Seznam záznamů (top N, nejbližší termíny): sloupce a řazení jako v seznamu entity.

```ts
type RecordsSource = {
  kind: "records";
  entity: string;
  filters?: FilterGroup | undefined;
  dateAttr?: string | undefined;
  jobAttr?: string | undefined;
  personAttr?: string | undefined;
  columns: string[];
  sort?: { attr: string; dir: "asc" | "desc" }[] | undefined;
  limit?: number | undefined;
};
```

### ResultTable

type · `packages/core/src/dashboards/result-table.ts`

_Bez popisu._

```ts
type ResultTable = {
  columns: { header: string; type: XlsxColumnType }[];
  rows: unknown[][];
  /** Řádek součtů nebo poznámky se nepoužívá; jen data widgetu. */
};
```

### ScopedEntity

type · `packages/core/src/dashboards/metric-helpers.ts`

Entita zúžená na to, co aktér smí vidět, s hotovou podmínkou `WHERE` (smazané, oprávnění, rozsah „jen moje“).

```ts
type ScopedEntity = {
  /** Entita bez atributů, které aktér nesmí vidět (ceny, marže). */
  entity: ResolvedEntity;
  /** Podmínka pro dotaz nad tabulkou entity: nesmazané záznamy v rozsahu aktéra (a případný filtr). */
  where: SQL;
  /** Poddotaz `select id from <tabulka> where <podmínka>`: id záznamů, které aktér vidí. */
  idsSubquery: SQL;
  /** Odkaz na detail záznamu, o kterém víme, že ho aktér vidí. */
  href: (id: string) => string;
};
```

### SeedDashboard

type · `packages/core/src/dashboards/service.ts`

_Bez popisu._

```ts
type SeedDashboard = {
  /** Stálý klíč sady; podle něj se nástěnka zakládá jen jednou (správce ji pak může upravit nebo smazat). */
  key: string;
  name: string;
  /** Klíč role, pro kterou je nástěnka výchozí. */
  role: string;
  /** Otevírá se na úvodní stránce místo klasického Přehledu (výchozí ne, ať vzhled zůstane stejný). */
  home?: boolean;
  definition: unknown;
};
```

### SeedWidget

type · `packages/core/src/dashboards/seed.ts`

_Bez popisu._

```ts
type SeedWidget = Omit<DashboardWidget, "id" | "w" | "h"> & {
  id?: string;
  w?: number;
  h?: number;
};
```

### TableColumn

type · `packages/core/src/dashboards/types.ts`

_Bez popisu._

```ts
type TableColumn = {
  key: string;
  label: string;
  type: "text" | "money" | "number" | "percent" | "date" | "minutes" | "hours" | "status";
};
```

### ValueFormat

type · `packages/core/src/dashboards/types.ts`

_Bez popisu._

```ts
type ValueFormat = (typeof VALUE_FORMATS)[number];
```

### WidgetMeta

type · `packages/core/src/dashboards/types.ts`

_Bez popisu._

```ts
type WidgetMeta = {
  /** Použité období (po dosazení filtru nástěnky); `null` = bez omezení. */
  period: DateRange | null;
  /** Výsledek byl oříznut limitem (víc skupin / řádků, než se ukazuje). */
  truncated?: boolean | undefined;
  generatedAt: string;
};
```

### WidgetOptions

type · `packages/core/src/dashboards/types.ts`

_Bez popisu._

```ts
type WidgetOptions = {
  chart?: ChartKind | undefined;
  format?: ValueFormat | undefined;
  compare?: CompareMode | undefined;
  /** Cíl měřidla ve stejných jednotkách jako hodnota (peníze v haléřích). */
  target?: number | undefined;
};
```

### WidgetOutcome

type · `packages/core/src/dashboards/types.ts`

Výsledek jednoho widgetu při načtení: chyba jednoho widgetu nerozbije nástěnku.

```ts
type WidgetOutcome =
  { ok: true; result: WidgetResult } | { ok: false; error: string; code: string };
```

### WidgetResult

type · `packages/core/src/dashboards/types.ts`

_Bez popisu._

```ts
type WidgetResult = (
  | {
      kind: "kpi";
      format: ValueFormat;
      value: number | null;
      /** Text místo čísla (nejmenší / největší datum). */
      text?: string | undefined;
      previous?: number | null | undefined;
      /** Absolutní a procentuální změna proti předchozímu období; `pct` je `null` při nulovém základu. */
      delta?: { abs: number; pct: number | null } | undefined;
      compare?: CompareMode | undefined;
      hint?: string | undefined;
    }
  | {
      kind: "gauge";
      format: ValueFormat;
      value: number | null;
      target: number;
      /** 0–∞ v procentech cíle (nad 100 je překročeno). */
      pct: number | null;
    }
  | {
      kind: "chart";
      chart: ChartKind;
      format: ValueFormat;
      categories: ChartCategory[];
      series: ChartSeriesData[];
    }
  | {
      kind: "table";
      columns: TableColumn[];
      rows: { id: string; href?: string | undefined; cells: Record<string, unknown> }[];
      format?: ValueFormat | undefined;
    }
  | {
      kind: "list";
      items: {
        id: string;
        title: string;
        subtitle?: string | undefined;
// … (zkráceno, celá deklarace je ve zdroji)
```

### WidgetSource

type · `packages/core/src/dashboards/types.ts`

_Bez popisu._

```ts
type WidgetSource = EntitySource | RecordsSource | MetricSource | BuiltinSource;
```

### WidgetType

type · `packages/core/src/dashboards/types.ts`

_Bez popisu._

```ts
type WidgetType = (typeof WIDGET_TYPES)[number];
```
