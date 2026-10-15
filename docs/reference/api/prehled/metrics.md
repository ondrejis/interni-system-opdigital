# @rebar/prehled/metrics

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/prehled/metrics` (soubor `packages/modules/prehled/src/metrics.ts`). Exportů: 3, z toho s popisem 1.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`recentChanges`](#recentchanges) | function | Poslední změny sdílených záznamů (všech, nebo jen mých). |  |
| [`RECENT_CHANGES_LIMIT`](#recent_changes_limit) | const |  |  |
| [`dashboardMetrics`](#dashboardmetrics) | const |  |  |

### recentChanges

function · `packages/modules/prehled/src/metrics.ts`

Poslední změny sdílených záznamů (všech, nebo jen mých).

```ts
async function recentChanges(ctx: Ctx, deps: Pick<ModuleDeps, "registry">, opts: { scope: "mine" | "all"; limit?: number } = { scope: "all" }): Promise<ListItem[]>
```

### RECENT_CHANGES_LIMIT

const · `packages/modules/prehled/src/metrics.ts`

_Bez popisu._

```ts
const RECENT_CHANGES_LIMIT: 8
```

### dashboardMetrics

const · `packages/modules/prehled/src/metrics.ts`

_Bez popisu._

```ts
const dashboardMetrics: DashboardMetricDef[]
```
