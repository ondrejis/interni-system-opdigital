# @rebar/core/dashboards-shared

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/core/dashboards-shared` (soubor `packages/core/src/dashboards/shared.ts`). Exportů: 60, z toho s popisem 23.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`bucketLabel`](dashboards.md#bucketlabel) | function | Popisek koše pro osu grafu: „říjen 2026“, „T41 2026“, „9. 10.“, „Q4 2026“, „2026“. | v `@rebar/core/dashboards` |
| [`bucketStart`](dashboards.md#bucketstart) | function | Začátek koše, do kterého datum spadá (týden začíná pondělím). | v `@rebar/core/dashboards` |
| [`bucketsBetween`](dashboards.md#bucketsbetween) | function | Všechny koše od začátku po konec rozsahu (i prázdné, aby časová řada neměla díry). | v `@rebar/core/dashboards` |
| [`comparisonRange`](dashboards.md#comparisonrange) | function | Srovnávací období: předchozí stejně dlouhé období (u celých měsíců, čtvrtletí a let předchozí kalendářní měsíc / čtvrtletí / rok, ne „30 dní zpět“) nebo stejné období o rok dříve. | v `@rebar/core/dashboards` |
| [`defaultBucket`](dashboards.md#defaultbucket) | function | Rozumný koš podle délky období. | v `@rebar/core/dashboards` |
| [`deltaOf`](dashboards.md#deltaof) | function | Změna proti srovnávacímu období. `pct` je `null`, když je základ nula (dělení nulou). | v `@rebar/core/dashboards` |
| [`filtersFromSearch`](dashboards.md#filtersfromsearch) | function | Filtry z parametrů URL (`obdobi`, `od`, `do`, `zakazka`, `osoba`); neplatné hodnoty se tiše zahodí. | v `@rebar/core/dashboards` |
| [`filtersToSearch`](dashboards.md#filterstosearch) | function | Opačně: jen odchylky od výchozího stavu, ať je adresa krátká. | v `@rebar/core/dashboards` |
| [`formatCompact`](dashboards.md#formatcompact) | function | Krátký tvar pro osy grafů („1,2 mil.“, „350 tis.“). Peníze se zkracují v korunách. | v `@rebar/core/dashboards` |
| [`formatValue`](dashboards.md#formatvalue) | function | Hodnota widgetu jako text podle formátu (peníze jsou v haléřích). | v `@rebar/core/dashboards` |
| [`isBucket`](dashboards.md#isbucket) | function |  | v `@rebar/core/dashboards` |
| [`isoWeek`](dashboards.md#isoweek) | function | ISO číslo týdne a rok, ke kterému týden patří (čtvrtek rozhoduje). | v `@rebar/core/dashboards` |
| [`periodOf`](dashboards.md#periodof) | function | Období filtrů nástěnky. | v `@rebar/core/dashboards` |
| [`resolvePeriod`](dashboards.md#resolveperiod) | function | Období podle předvolby k danému dni. `all` a neplatné vlastní období = `null` (bez omezení). | v `@rebar/core/dashboards` |
| [`seedDashboard`](dashboards.md#seeddashboard) | function | Doplní id a rozměry widgetů a složí definici ve verzi, kterou systém čte. | v `@rebar/core/dashboards` |
| [`standardDashboards`](dashboards.md#standarddashboards) | function | Výchozí nástěnky podle rolí (majitel, kancelář, mistr, účetní) pro zapnuté moduly. Widgety modulů, které klient nemá zapnuté, se vynechají; nástěnka, které nezbyde žádný widget, se nezakládá. Žádná se neotevírá na úvodní stránce (zůstává klasický Přehled), uživatel ji najde v přepínači nástěnek. | v `@rebar/core/dashboards` |
| [`AGG_FUNCTIONS`](dashboards.md#agg_functions) | const |  | v `@rebar/core/dashboards` |
| [`BUCKETS`](dashboards.md#buckets) | const |  | v `@rebar/core/dashboards` |
| [`BUILTINS`](dashboards.md#builtins) | const |  | v `@rebar/core/dashboards` |
| [`CHART_KINDS`](dashboards.md#chart_kinds) | const |  | v `@rebar/core/dashboards` |
| [`COMPARE_LABELS`](dashboards.md#compare_labels) | const |  | v `@rebar/core/dashboards` |
| [`COMPARE_MODES`](dashboards.md#compare_modes) | const |  | v `@rebar/core/dashboards` |
| [`DEFAULT_FILTERS`](dashboards.md#default_filters) | const |  | v `@rebar/core/dashboards` |
| [`DEFINITION_VERSION`](dashboards.md#definition_version) | const |  | v `@rebar/core/dashboards` |
| [`MAX_WIDGET_HEIGHT`](dashboards.md#max_widget_height) | const |  | v `@rebar/core/dashboards` |
| [`PERIOD_LABELS`](dashboards.md#period_labels) | const |  | v `@rebar/core/dashboards` |
| [`PERIOD_PRESETS`](dashboards.md#period_presets) | const |  | v `@rebar/core/dashboards` |
| [`VALUE_FORMATS`](dashboards.md#value_formats) | const | Jak se hodnota ukazuje: peníze jsou v haléřích, `minutes` v minutách (7:30 h), `hours` v desetinných hodinách. | v `@rebar/core/dashboards` |
| [`WIDGET_TYPES`](dashboards.md#widget_types) | const |  | v `@rebar/core/dashboards` |
| [`WIDGET_WIDTHS`](dashboards.md#widget_widths) | const |  | v `@rebar/core/dashboards` |
| [`AggFn`](dashboards.md#aggfn) | type |  | v `@rebar/core/dashboards` |
| [`Bucket`](dashboards.md#bucket) | type |  | v `@rebar/core/dashboards` |
| [`BuiltinKind`](dashboards.md#builtinkind) | type |  | v `@rebar/core/dashboards` |
| [`BuiltinSource`](dashboards.md#builtinsource) | type |  | v `@rebar/core/dashboards` |
| [`ChartCategory`](dashboards.md#chartcategory) | type |  | v `@rebar/core/dashboards` |
| [`ChartKind`](dashboards.md#chartkind) | type |  | v `@rebar/core/dashboards` |
| [`ChartSeriesData`](dashboards.md#chartseriesdata) | type |  | v `@rebar/core/dashboards` |
| [`CompareMode`](dashboards.md#comparemode) | type |  | v `@rebar/core/dashboards` |
| [`DashboardDefinition`](dashboards.md#dashboarddefinition) | type |  | v `@rebar/core/dashboards` |
| [`DashboardFilters`](dashboards.md#dashboardfilters) | type | Filtry nahoře na nástěnce: propisují se do widgetů a do URL. | v `@rebar/core/dashboards` |
| [`DashboardKind`](dashboards.md#dashboardkind) | type |  | v `@rebar/core/dashboards` |
| [`DashboardSeed`](dashboards.md#dashboardseed) | type |  | v `@rebar/core/dashboards` |
| [`DashboardSeedInput`](dashboards.md#dashboardseedinput) | type | Výchozí nástěnka v `clients/<klient>/config.ts` → `dashboards.defaults`. | v `@rebar/core/dashboards` |
| [`DashboardSummary`](dashboards.md#dashboardsummary) | type |  | v `@rebar/core/dashboards` |
| [`DashboardWidget`](dashboards.md#dashboardwidget) | type | Mřížka má 12 sloupců; `w` je šířka ve sloupcích, `h` výška v řádcích (po 96 px). Pořadí widgetů je pořadí v poli. | v `@rebar/core/dashboards` |
| [`DateRange`](dashboards.md#daterange) | type |  | v `@rebar/core/dashboards` |
| [`EntitySource`](dashboards.md#entitysource) | type | Zdroj dat z entity: filtr → agregace → seskupení (hodnota nebo období) → řazení a limit. Žádné ruční SQL. | v `@rebar/core/dashboards` |
| [`MetricInfo`](dashboards.md#metricinfo) | type |  | v `@rebar/core/dashboards` |
| [`MetricSource`](dashboards.md#metricsource) | type | Pojmenovaná metrika, kterou dodává modul (`dashboardMetrics`). | v `@rebar/core/dashboards` |
| [`PeriodPreset`](dashboards.md#periodpreset) | type |  | v `@rebar/core/dashboards` |
| [`RecordsSource`](dashboards.md#recordssource) | type | Seznam záznamů (top N, nejbližší termíny): sloupce a řazení jako v seznamu entity. | v `@rebar/core/dashboards` |
| [`SeedWidget`](dashboards.md#seedwidget) | type |  | v `@rebar/core/dashboards` |
| [`TableColumn`](dashboards.md#tablecolumn) | type |  | v `@rebar/core/dashboards` |
| [`ValueFormat`](dashboards.md#valueformat) | type |  | v `@rebar/core/dashboards` |
| [`WidgetMeta`](dashboards.md#widgetmeta) | type |  | v `@rebar/core/dashboards` |
| [`WidgetOptions`](dashboards.md#widgetoptions) | type |  | v `@rebar/core/dashboards` |
| [`WidgetOutcome`](dashboards.md#widgetoutcome) | type | Výsledek jednoho widgetu při načtení: chyba jednoho widgetu nerozbije nástěnku. | v `@rebar/core/dashboards` |
| [`WidgetResult`](dashboards.md#widgetresult) | type |  | v `@rebar/core/dashboards` |
| [`WidgetSource`](dashboards.md#widgetsource) | type |  | v `@rebar/core/dashboards` |
| [`WidgetType`](dashboards.md#widgettype) | type |  | v `@rebar/core/dashboards` |
