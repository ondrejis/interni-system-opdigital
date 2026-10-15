# @rebar/muj-prostor/server

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/muj-prostor/server` (soubor `packages/modules/muj-prostor/src/server.ts`). Exportů: 11, z toho s popisem 10.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`countCriticalDomains`](#countcriticaldomains) | function | Počet kritických domén (DOM-03): méně než `warn_days` dní do expirace nebo po expiraci. Bez oprávnění 0. |  |
| [`emailLibraryItem`](schema.md#emaillibraryitem) | const | Soukromá knihovna e-mailových textů vlastníka (odděleně od sdílených šablon, lze přesouvat mezi nimi). | v `@rebar/muj-prostor/schema` |
| [`emailLibraryItemEntity`](#emaillibraryitementity) | const | Soukromá e-mailová knihovna vlastníka (KNI-01): texty, které nejsou sdílenými šablonami. Stránku `/muj-prostor/knihovna` (hledání, náhled s daty kontaktu, kopírování, Gmail) kreslí UI modulu; generický seznam s filtry, exportem a plným detailem záznamu je na `/muj-prostor/knihovna/vse`. Text je prostý (`bodyText`) s proměnnými `{jmeno}`; `bodyJson` (Tiptap) vzniká jen přesunem ze šablon a úprava textu ho vynuluje, aby se texty nerozcházely. |  |
| [`entities`](#entities) | const |  |  |
| [`recurringInvoice`](schema.md#recurringinvoice) | const | Návrh opakované faktury za období služby (v3, Fakturoid): koncept → schválená → odeslaná do Fakturoidu. Pro službu a začátek období je jen jeden návrh (`recurring_invoice_period_uq`). | v `@rebar/muj-prostor/schema` |
| [`recurringInvoiceEntity`](#recurringinvoiceentity) | const | Návrhy opakovaných faktur za období služby (v3, odeslání do Fakturoidu po schválení). |  |
| [`recurringService`](schema.md#recurringservice) | const | Opakovaná služba klienta (hosting, údržba webu) s cenou za období a dalším termínem obnovy. | v `@rebar/muj-prostor/schema` |
| [`recurringServiceEntity`](#recurringserviceentity) | const | Hosting a údržba webů klientů (opakované služby s obnovou). Stránku `/muj-prostor/hosting` (souhrn, pohledy) kreslí UI modulu; generický seznam s filtry, exportem a detaily záznamů je na `/muj-prostor/hosting/vse`. |  |
| [`server`](#server) | const | Serverová část modulu „muj-prostor“: společné entity a příkazy plus oblasti. |  |
| [`webDomain`](schema.md#webdomain) | const | Doména klienta nebo agentury: registrátor, expirace, kdo platí, varování `warn_days` předem. Doména je mezi živými unikátní. | v `@rebar/muj-prostor/schema` |
| [`webDomainEntity`](#webdomainentity) | const | Domény klientů a agentury s expirací a upozorněním (`warn_days`). Stránku `/muj-prostor/domeny` (barvy expirace, hromadné vložení) kreslí UI modulu; generický seznam s filtry a exportem je na `/muj-prostor/domeny/vse`. |  |

### countCriticalDomains

function · `packages/modules/muj-prostor/src/domains/index.ts`

Počet kritických domén (DOM-03): méně než `warn_days` dní do expirace nebo po expiraci. Bez oprávnění 0.

```ts
async function countCriticalDomains(ctx: Parameters<typeof loadDomainList>[0], today = todayIso()): Promise<number>
```

### emailLibraryItemEntity

const · `packages/modules/muj-prostor/src/library/entity.ts`

Soukromá e-mailová knihovna vlastníka (KNI-01): texty, které nejsou sdílenými šablonami. Stránku `/muj-prostor/knihovna`
(hledání, náhled s daty kontaktu, kopírování, Gmail) kreslí UI modulu; generický seznam s filtry, exportem a plným
detailem záznamu je na `/muj-prostor/knihovna/vse`. Text je prostý (`bodyText`) s proměnnými `{jmeno}`; `bodyJson`
(Tiptap) vzniká jen přesunem ze šablon a úprava textu ho vynuluje, aby se texty nerozcházely.

```ts
const emailLibraryItemEntity: import("@rebar/core/entities").EntityDef
```

### entities

const · `packages/modules/muj-prostor/src/entities.ts`

_Bez popisu._

```ts
const entities: import("@rebar/core/entities").EntityDef[]
```

### recurringInvoiceEntity

const · `packages/modules/muj-prostor/src/entities.ts`

Návrhy opakovaných faktur za období služby (v3, odeslání do Fakturoidu po schválení).

```ts
const recurringInvoiceEntity: import("@rebar/core/entities").EntityDef
```

### recurringServiceEntity

const · `packages/modules/muj-prostor/src/entities.ts`

Hosting a údržba webů klientů (opakované služby s obnovou). Stránku `/muj-prostor/hosting` (souhrn, pohledy)
kreslí UI modulu; generický seznam s filtry, exportem a detaily záznamů je na `/muj-prostor/hosting/vse`.

```ts
const recurringServiceEntity: import("@rebar/core/entities").EntityDef
```

### server

const · `packages/modules/muj-prostor/src/server.ts`

Serverová část modulu „muj-prostor“: společné entity a příkazy plus oblasti.

```ts
const server: import("@rebar/core/module-server").ModuleServer
```

### webDomainEntity

const · `packages/modules/muj-prostor/src/entities.ts`

Domény klientů a agentury s expirací a upozorněním (`warn_days`). Stránku `/muj-prostor/domeny` (barvy expirace,
hromadné vložení) kreslí UI modulu; generický seznam s filtry a exportem je na `/muj-prostor/domeny/vse`.

```ts
const webDomainEntity: import("@rebar/core/entities").EntityDef
```
