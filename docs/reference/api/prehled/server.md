# @rebar/prehled/server

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/prehled/server` (soubor `packages/modules/prehled/src/server.ts`). Exportů: 2, z toho s popisem 1.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`privatePaths`](#privatepaths) | const |  |  |
| [`server`](#server) | const | Serverová část modulu „prehled“: metriky Přehledu a ruční čtecí cesty (soukromí). |  |

### privatePaths

const · `packages/modules/prehled/src/server.ts`

_Bez popisu._

```ts
const privatePaths: PrivatePathDef[]
```

### server

const · `packages/modules/prehled/src/server.ts`

Serverová část modulu „prehled“: metriky Přehledu a ruční čtecí cesty (soukromí).

```ts
const server: { readonly entities: readonly import("@rebar/core/entities").EntityDef[]; readonly commands: readonly import("@rebar/core/module-server").CommandDef[]; readonly dashboardMetrics: import("@rebar/core/module-server").DashboardMetricDef[]; re…
```
