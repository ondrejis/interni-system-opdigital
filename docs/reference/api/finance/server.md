# @rebar/finance/server

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/finance/server` (soubor `packages/modules/finance/src/server.ts`). Exportů: 9, z toho s popisem 8.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`entities`](#entities) | const |  |  |
| [`payment`](schema.md#payment) | const | Platba (plánovaná, vystavená, zaplacená, zrušená). `job_id` je prázdné jen u plateb z Fakturoidu (`kind = recurring`, R-12): taková platba je vždy soukromá a mimo saldo. Viditelnost: dědí od zakázky a smí mít vlastní zámek. Měsíční retainer platba je v zakázce jedna na měsíc. | v `@rebar/finance/schema` |
| [`paymentAllocation`](schema.md#paymentallocation) | const | Podíl uživatele na platbě v haléřích; součet podílů se rovná částce platby. Dědí viditelnost platby. | v `@rebar/finance/schema` |
| [`paymentEntity`](#paymententity) | const | Platba zakázky (plánovaná, vystavená, zaplacená). Vzniká příkazy modulu (šablona, retainer, ruční zadání); rozdělení mezi lidi je v `payment_allocation`. Částky vidí jen, kdo má `finance.read`. Platba bez zakázky (Fakturoid) je vždy soukromá a mimo saldo (R-12). |  |
| [`retainer`](schema.md#retainer) | const | Retainer zakázky: opakovaná měsíční platba s dnem vystavení (1–28) a fakturujícím (pevný, nebo střídavý). Měsíce jsou `YYYY-MM`. Platby z něj generuje úloha `finance.retainer.generate` (idempotentně podle `payment_retainer_month_uq`). | v `@rebar/finance/schema` |
| [`server`](#server) | const | Serverová část modulu „finance“: společné entity a příkazy plus oblasti. |  |
| [`settlement`](schema.md#settlement) | const | Vyrovnání mezi partnery (ruční záznam, že jeden druhému zaplatil nebo zafakturoval): kdo, komu, kolik, kdy, jak. Storno vyplní `canceled_at` (záznam se nemaže). Počítá se jen se sdílenými zakázkami. | v `@rebar/finance/schema` |
| [`settlementEntity`](#settlemententity) | const | Záznam vyrovnání mezi partnery (kdo komu, kolik, jak). Storno místo mazání; zápis jen s `finance.settlements_write`. |  |
| [`splitRule`](schema.md#splitrule) | const | Pravidlo rozdělení plateb zakázky mezi lidi: procenta, pevná částka za platbu, nebo pevná celková částka; platí pro všechny druhy plateb nebo jen pro jeden, od–do měsíce (`YYYY-MM`). Pořadí určuje `position`. | v `@rebar/finance/schema` |

### entities

const · `packages/modules/finance/src/entities.ts`

_Bez popisu._

```ts
const entities: import("@rebar/core/entities").EntityDef[]
```

### paymentEntity

const · `packages/modules/finance/src/entities.ts`

Platba zakázky (plánovaná, vystavená, zaplacená). Vzniká příkazy modulu (šablona, retainer, ruční zadání);
rozdělení mezi lidi je v `payment_allocation`. Částky vidí jen, kdo má `finance.read`. Platba bez zakázky (Fakturoid)
je vždy soukromá a mimo saldo (R-12).

```ts
const paymentEntity: import("@rebar/core/entities").EntityDef
```

### server

const · `packages/modules/finance/src/server.ts`

Serverová část modulu „finance“: společné entity a příkazy plus oblasti.

```ts
const server: import("@rebar/core/module-server").ModuleServer
```

### settlementEntity

const · `packages/modules/finance/src/entities.ts`

Záznam vyrovnání mezi partnery (kdo komu, kolik, jak). Storno místo mazání; zápis jen s `finance.settlements_write`.

```ts
const settlementEntity: import("@rebar/core/entities").EntityDef
```
