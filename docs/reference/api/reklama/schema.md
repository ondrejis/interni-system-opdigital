# @rebar/reklama/schema

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/reklama/schema` (soubor `packages/modules/reklama/src/schema.ts`). Exportů: 8, z toho s popisem 8.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`AD_LEVELS`](#ad_levels) | const | Úroveň objektu v denních statistikách. |  |
| [`AD_OWNER_KINDS`](#ad_owner_kinds) | const | Čí je reklamní účet: agentury (vlastní akvizice), nebo klienta (kampaně pro zakázku). |  |
| [`ad`](#ad) | const | Reklama v sadě; `creative_url` je odkaz na náhled kreativy. |  |
| [`adAccount`](#adaccount) | const | Reklamní účet z Meta Ads (synchronizace stahuje jen čtení). `company_id` je měkký odkaz na klienta. |  |
| [`adCampaign`](#adcampaign) | const | Kampaň reklamního účtu; `job_id` je měkký odkaz na marketingovou zakázku, ke které se kampaň vztahuje. |  |
| [`adInsightDaily`](#adinsightdaily) | const | Denní statistiky objektu (kampaň, sada, reklama): útrata v haléřích, zobrazení, kliky, leady. Posledních 7 dní se při synchronizaci přepisuje. Technická tabulka bez soft-delete; unikátní je `(level, object_id, date)`. |  |
| [`adSet`](#adset) | const | Sada reklam (ad set) v kampani. |  |
| [`leadFormMapping`](#leadformmapping) | const | Mapování Meta formuláře na pipeline obchodů: do které fáze lead padá, kdo je vlastník a jaké služby se předvyplní. Příchozí leady loguje core `inbound_event`. |  |

### AD_LEVELS

const · `packages/modules/reklama/src/schema.ts`

Úroveň objektu v denních statistikách.

```ts
const AD_LEVELS: readonly ["campaign", "adset", "ad"]
```

### AD_OWNER_KINDS

const · `packages/modules/reklama/src/schema.ts`

Čí je reklamní účet: agentury (vlastní akvizice), nebo klienta (kampaně pro zakázku).

```ts
const AD_OWNER_KINDS: readonly ["agency", "client"]
```

### ad

const · `packages/modules/reklama/src/schema.ts`

Reklama v sadě; `creative_url` je odkaz na náhled kreativy.

```ts
const ad: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "ad"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "ad"; dataType: "date"; columnType: "PgTimestamp"; data: Date; driver…
```

### adAccount

const · `packages/modules/reklama/src/schema.ts`

Reklamní účet z Meta Ads (synchronizace stahuje jen čtení). `company_id` je měkký odkaz na klienta.

```ts
const adAccount: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "ad_account"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "ad_account"; dataType: "date"; columnType: "PgTimestamp"; da…
```

### adCampaign

const · `packages/modules/reklama/src/schema.ts`

Kampaň reklamního účtu; `job_id` je měkký odkaz na marketingovou zakázku, ke které se kampaň vztahuje.

```ts
const adCampaign: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "ad_campaign"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "ad_campaign"; dataType: "date"; columnType: "PgTimestamp"; …
```

### adInsightDaily

const · `packages/modules/reklama/src/schema.ts`

Denní statistiky objektu (kampaň, sada, reklama): útrata v haléřích, zobrazení, kliky, leady. Posledních 7 dní se při
synchronizaci přepisuje. Technická tabulka bez soft-delete; unikátní je `(level, object_id, date)`.

```ts
const adInsightDaily: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "ad_insight_daily"; schema: undefined; columns: { id: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "ad_insight_daily"; dataType: "string"; columnType: "PgUUID"; …
```

### adSet

const · `packages/modules/reklama/src/schema.ts`

Sada reklam (ad set) v kampani.

```ts
const adSet: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "ad_set"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "ad_set"; dataType: "date"; columnType: "PgTimestamp"; data: Date…
```

### leadFormMapping

const · `packages/modules/reklama/src/schema.ts`

Mapování Meta formuláře na pipeline obchodů: do které fáze lead padá, kdo je vlastník a jaké služby se předvyplní.
Příchozí leady loguje core `inbound_event`.

```ts
const leadFormMapping: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "lead_form_mapping"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "lead_form_mapping"; dataType: "date"; columnType: "Pg…
```
