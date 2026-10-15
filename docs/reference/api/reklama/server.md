# @rebar/reklama/server

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/reklama/server` (soubor `packages/modules/reklama/src/server.ts`). Exportů: 10, z toho s popisem 9.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`ad`](schema.md#ad) | const | Reklama v sadě; `creative_url` je odkaz na náhled kreativy. | v `@rebar/reklama/schema` |
| [`adAccount`](schema.md#adaccount) | const | Reklamní účet z Meta Ads (synchronizace stahuje jen čtení). `company_id` je měkký odkaz na klienta. | v `@rebar/reklama/schema` |
| [`adAccountEntity`](#adaccountentity) | const | Reklamní účet z Meta Ads (jen čtení z Mety; vlastníka a klienta nastavuje uživatel). |  |
| [`adCampaign`](schema.md#adcampaign) | const | Kampaň reklamního účtu; `job_id` je měkký odkaz na marketingovou zakázku, ke které se kampaň vztahuje. | v `@rebar/reklama/schema` |
| [`adCampaignEntity`](#adcampaignentity) | const | Reklamní kampaň (jen čtení z Mety); uživatel ji přiřazuje k marketingové zakázce. |  |
| [`adInsightDaily`](schema.md#adinsightdaily) | const | Denní statistiky objektu (kampaň, sada, reklama): útrata v haléřích, zobrazení, kliky, leady. Posledních 7 dní se při synchronizaci přepisuje. Technická tabulka bez soft-delete; unikátní je `(level, object_id, date)`. | v `@rebar/reklama/schema` |
| [`adSet`](schema.md#adset) | const | Sada reklam (ad set) v kampani. | v `@rebar/reklama/schema` |
| [`entities`](#entities) | const |  |  |
| [`leadFormMapping`](schema.md#leadformmapping) | const | Mapování Meta formuláře na pipeline obchodů: do které fáze lead padá, kdo je vlastník a jaké služby se předvyplní. Příchozí leady loguje core `inbound_event`. | v `@rebar/reklama/schema` |
| [`server`](#server) | const | Serverová část modulu „reklama“: společné entity a příkazy plus oblasti. |  |

### adAccountEntity

const · `packages/modules/reklama/src/entities.ts`

Reklamní účet z Meta Ads (jen čtení z Mety; vlastníka a klienta nastavuje uživatel).

```ts
const adAccountEntity: import("@rebar/core/entities").EntityDef
```

### adCampaignEntity

const · `packages/modules/reklama/src/entities.ts`

Reklamní kampaň (jen čtení z Mety); uživatel ji přiřazuje k marketingové zakázce.

```ts
const adCampaignEntity: import("@rebar/core/entities").EntityDef
```

### entities

const · `packages/modules/reklama/src/entities.ts`

_Bez popisu._

```ts
const entities: import("@rebar/core/entities").EntityDef[]
```

### server

const · `packages/modules/reklama/src/server.ts`

Serverová část modulu „reklama“: společné entity a příkazy plus oblasti.

```ts
const server: import("@rebar/core/module-server").ModuleServer
```
